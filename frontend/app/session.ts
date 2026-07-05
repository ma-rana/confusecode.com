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
  /** The review type that was active when this issue was found. */
  reviewType: string;
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
 * A separate work-log per review type. Each review type ("bugs", "confusing",
 * …) tracks its own issues independently, so switching the "What kind of
 * review?" button shows only that type's session and never mixes findings from
 * different types. Keyed by review-type id.
 */
export type SessionsByType = Record<string, SessionState>;

/** Read one review type's session, or an empty one if it hasn't been run yet. */
export function sessionFor(
  sessions: SessionsByType,
  reviewType: string,
): SessionState {
  return sessions[reviewType] ?? emptySession();
}

/**
 * One open file in the workspace. Each file carries its own code, editor
 * language, and its OWN per-review-type sessions — so work on file A is fully
 * independent of file B, and switching between them preserves everything. All
 * in-memory only; nothing is stored server-side (privacy, §7.9).
 */
export interface OpenFile {
  /** Stable local id for this open file (not the filename — names can repeat). */
  fileId: string;
  /** Display name ("pasted code" for pasted snippets, else the upload's name). */
  filename: string;
  /** The editor flavor string ("tsx", "vue", …) — kept loose to avoid a cycle. */
  language: string;
  /** Current editor contents for this file. */
  code: string;
  /** This file's per-review-type work-logs. */
  sessions: SessionsByType;
}

/** Total open issues across every review type of one file (for the file tab badge). */
export function openIssueCount(file: OpenFile): number {
  let open = 0;
  for (const s of Object.values(file.sessions)) {
    open += progressOf(s).openCount;
  }
  return open;
}

/** True if any review type of this file has been analyzed at least once. */
export function fileHasWork(file: OpenFile): boolean {
  return Object.values(file.sessions).some((s) => s.revision > 0);
}

/**
 * Fold a fresh analysis (list of cards) into the work-log, producing the next
 * session state. Pure: same inputs → same output.
 *
 * `reviewType` is the review type that produced THIS analysis. It matters for
 * the "gone" logic below: an issue may be absent from this analysis simply
 * because it belongs to a DIFFERENT review type whose rules didn't run. That is
 * not a fix, so we only mark an issue gone/resolved when it belongs to the
 * review type currently being analyzed. Issues from other review types are left
 * exactly as they are.
 *
 * Rules:
 *  - A card whose id is new → add as a new open issue, tagged with reviewType.
 *  - A card whose id already exists → still present; update its card content
 *    and lastSeenRev, and clear any "gone" flag (it came back).
 *  - A tracked issue of THIS reviewType, not in this analysis → the user fixed
 *    it: mark it gone.
 *  - A tracked issue of a DIFFERENT reviewType, not in this analysis → untouched
 *    (its rules weren't even run, so absence means nothing).
 */
export function foldAnalysis(
  prev: SessionState,
  cards: Card[],
  reviewType: string,
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
        reviewType,
        goneFromAnalysis: false,
      };
    }
    // Absent from this analysis. Only treat it as fixed if it belongs to the
    // review type we actually just ran — otherwise its rules never ran, so its
    // absence tells us nothing. Leave cross-type issues completely untouched.
    if (issue.reviewType !== reviewType) {
      return issue;
    }
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
        reviewType,
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
