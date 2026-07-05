import type { Card } from "./types";

/**
 * The session work-log (§6.4) — in-browser state only, nothing stored server-side.
 *
 * A running record of every issue seen across revisions of ONE file. It powers
 * live progress ("4 of 6 resolved") and the completion summary. When the user
 * edits and re-analyzes, we match the new findings against tracked issues so
 * progress is visible.
 *
 * Matching note (§6.4): line numbers shift as code is edited, so we match on the
 * backend's stable id (ruleId + ordinal), NOT on line. This is deliberately
 * "good enough to feel like progress" — the design doc explicitly warns against
 * chasing perfect cross-edit matching.
 */

export type IssueStatus = "open" | "got-it" | "resolved";

export interface TrackedIssue {
  /** Stable id from the backend (e.g. "no-undef#0"). Survives edits. */
  id: string;
  /** The most recent card content for this issue. */
  card: Card;
  status: IssueStatus;
  /** Revision number (1-based) where this issue first appeared. */
  firstSeenRev: number;
  /** Revision where it was last present in the analysis. */
  lastSeenRev: number;
  /** True once the analyzer stops reporting it (the user fixed it). */
  goneFromAnalysis: boolean;
}

export interface SessionState {
  /** Revision counter — increments each analyze. */
  revision: number;
  /** All issues ever seen this session, keyed by stable id. */
  issues: TrackedIssue[];
}

export function emptySession(): SessionState {
  return { revision: 0, issues: [] };
}

/**
 * Fold a fresh analysis (list of cards) into the work-log, producing the next
 * session state. Pure: same inputs → same output.
 *
 * Rules:
 *  - A card whose id is new → add as a new open issue.
 *  - A card whose id already exists → still present; update its card content
 *    and lastSeenRev, and clear any "gone" flag (it came back).
 *  - A tracked issue NOT in this analysis → the user fixed it: mark it gone.
 *    If the user had already pressed "got it", it becomes "resolved"; otherwise
 *    it's still counted as resolved-by-fix but we keep its prior status label.
 */
export function foldAnalysis(
  prev: SessionState,
  cards: Card[],
): SessionState {
  const revision = prev.revision + 1;
  const cardById = new Map(cards.map((c) => [c.id, c]));

  // Start from existing issues, updating them.
  const next: TrackedIssue[] = prev.issues.map((issue) => {
    const stillPresent = cardById.get(issue.id);
    if (stillPresent) {
      return {
        ...issue,
        card: stillPresent,
        lastSeenRev: revision,
        goneFromAnalysis: false,
      };
    }
    // Not in this analysis → the analyzer no longer flags it (fixed).
    return {
      ...issue,
      goneFromAnalysis: true,
      status: issue.status === "open" ? "resolved" : issue.status,
    };
  });

  // Add issues that are new this revision.
  const knownIds = new Set(prev.issues.map((i) => i.id));
  for (const card of cards) {
    if (!knownIds.has(card.id)) {
      next.push({
        id: card.id,
        card,
        status: "open",
        firstSeenRev: revision,
        lastSeenRev: revision,
        goneFromAnalysis: false,
      });
    }
  }

  return { revision, issues: next };
}

/** Mark an issue as understood ("got it") — a learning act by the user (§6.3). */
export function markGotIt(state: SessionState, id: string): SessionState {
  return {
    ...state,
    issues: state.issues.map((i) =>
      i.id === id
        ? { ...i, status: i.goneFromAnalysis ? "resolved" : "got-it" }
        : i,
    ),
  };
}

/** An issue counts as "done" if the user understood it or fixed it away. */
export function isDone(issue: TrackedIssue): boolean {
  return (
    issue.status === "resolved" ||
    issue.status === "got-it" ||
    issue.goneFromAnalysis
  );
}

export interface Progress {
  total: number;
  done: number;
  openCount: number;
  allClear: boolean;
}

export function progressOf(state: SessionState): Progress {
  const total = state.issues.length;
  const done = state.issues.filter(isDone).length;
  return {
    total,
    done,
    openCount: total - done,
    allClear: total > 0 && done === total,
  };
}

export interface Summary extends Progress {
  revisions: number;
  fixed: number; // issues the analyzer stopped reporting
  understood: number; // issues explicitly marked "got it"
  concepts: string[]; // distinct concepts encountered this session
}

/** Build the completion summary shown on "Finish now" (§6.3). */
export function summarize(state: SessionState): Summary {
  const p = progressOf(state);
  const fixed = state.issues.filter((i) => i.goneFromAnalysis).length;
  const understood = state.issues.filter(
    (i) => i.status === "got-it" || i.status === "resolved",
  ).length;
  const concepts = [...new Set(state.issues.map((i) => i.card.concept))];
  return { ...p, revisions: state.revision, fixed, understood, concepts };
}
