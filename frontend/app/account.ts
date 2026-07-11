import type { SessionState } from "./session";
import { isDone } from "./session";

/**
 * The account + history client (Phase 5).
 *
 * Signing in is OPTIONAL and changes NOTHING about how code is analyzed. With no
 * account you get exactly the tool you had before: paste, analyze, learn, and
 * nothing leaves the browser. An account adds one thing — a memory of the issues
 * you've worked through, so the app can tell you "you've hit this one before".
 *
 * What is sent when you save a session: rule ids, concept labels, severities,
 * difficulties, outcomes, and four counts. What is never sent: your code, your
 * filename, the lines an issue was on, or the text of any finding. Look at
 * `toSavePayload` below — the code isn't omitted by convention, it's simply
 * never in the object.
 */

export interface Me {
  id: string;
  provider: string;
  displayName: string | null;
  avatarUrl: string | null;
  historyOptIn: boolean;
}

export type ProviderId = "github" | "google";

export interface RuleHistoryEntry {
  rule_id: string;
  times_seen: number;
  times_fixed: number;
  last_seen: string;
}

export interface ConceptCount {
  concept: string;
  count: number;
}

export interface SavedSession {
  id: string;
  review_type: string;
  language: string;
  revisions: number;
  issues_total: number;
  issues_fixed: number;
  issues_understood: number;
  finished_at: string;
}

/** Rule id → how the user has fared with that rule before. Empty when signed out. */
export type RuleHistory = Record<string, RuleHistoryEntry>;

// ---- Reads ------------------------------------------------------------------

export async function fetchProviders(): Promise<ProviderId[]> {
  try {
    const res = await fetch("/api/auth/providers");
    if (!res.ok) return [];
    const d = (await res.json()) as { providers: ProviderId[] };
    return d.providers ?? [];
  } catch {
    return [];
  }
}

export async function fetchMe(): Promise<Me | null> {
  try {
    const res = await fetch("/api/me");
    if (!res.ok) return null;
    const d = (await res.json()) as { user: Me | null };
    return d.user;
  } catch {
    return null;
  }
}

export async function fetchRuleHistory(): Promise<{
  rules: RuleHistory;
  concepts: ConceptCount[];
}> {
  try {
    const res = await fetch("/api/history/rules");
    if (!res.ok) return { rules: {}, concepts: [] };
    const d = (await res.json()) as {
      rules: RuleHistoryEntry[];
      concepts: ConceptCount[];
    };
    const rules: RuleHistory = {};
    for (const r of d.rules ?? []) rules[r.rule_id] = r;
    return { rules, concepts: d.concepts ?? [] };
  } catch {
    return { rules: {}, concepts: [] };
  }
}

export async function fetchSavedSessions(): Promise<SavedSession[]> {
  try {
    const res = await fetch("/api/history/sessions");
    if (!res.ok) return [];
    const d = (await res.json()) as { sessions: SavedSession[] };
    return d.sessions ?? [];
  } catch {
    return [];
  }
}

// ---- Writes -----------------------------------------------------------------

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
}

export async function setHistoryOptIn(optIn: boolean): Promise<boolean> {
  const res = await fetch("/api/me/history-opt-in", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ optIn }),
  });
  return res.ok;
}

export async function deleteAccount(): Promise<boolean> {
  const res = await fetch("/api/me", { method: "DELETE" });
  return res.ok;
}

export async function deleteSavedSession(id: string): Promise<boolean> {
  const res = await fetch(`/api/history/sessions/${id}`, { method: "DELETE" });
  return res.ok;
}

/**
 * Turn a finished work-log into the ONLY thing we're willing to persist.
 *
 * Read this function as the privacy guarantee in executable form. It takes the
 * whole session — which contains every card, every message, every line number —
 * and returns an object built field by field from a whitelist. There is no
 * spread of the card into the payload, no `...issue`, nothing that could carry a
 * field along by accident. Add a field to Card tomorrow and it does not silently
 * start being uploaded.
 *
 * The outcome we record is the honest one:
 *   fixed      — the analyzer stopped reporting it. They actually changed the code.
 *   understood — they pressed "Got it" but it's still there.
 *   surfaced   — it was shown and they moved on. Recorded, not judged.
 */
export interface SavePayload {
  reviewType: string;
  language: string;
  revisions: number;
  issuesTotal: number;
  issuesFixed: number;
  issuesUnderstood: number;
  events: {
    ruleId: string | null;
    concept: string;
    severity: string;
    difficulty: string;
    outcome: "surfaced" | "understood" | "fixed";
  }[];
}

/** Map the editor's language flavour to the small set the backend accepts. */
function saveLanguage(editorLanguage: string): string {
  if (editorLanguage === "vue") return "vue";
  if (editorLanguage === "svelte") return "svelte";
  if (editorLanguage === "javascript" || editorLanguage === "jsx") return "javascript";
  return "typescript";
}

export function toSavePayload(
  session: SessionState,
  reviewType: string,
  editorLanguage: string,
): SavePayload {
  return {
    reviewType,
    language: saveLanguage(editorLanguage),
    revisions: Math.max(1, session.revision),
    issuesTotal: session.issues.length,
    issuesFixed: session.issues.filter((i) => i.goneFromAnalysis).length,
    issuesUnderstood: session.issues.filter(
      (i) => !i.goneFromAnalysis && isDone(i),
    ).length,
    events: session.issues.map((i) => ({
      ruleId: i.card.ruleId,
      concept: i.card.concept,
      severity: i.card.severity,
      difficulty: i.card.difficulty,
      outcome: i.goneFromAnalysis
        ? ("fixed" as const)
        : isDone(i)
          ? ("understood" as const)
          : ("surfaced" as const),
      // Deliberately absent: i.card.detail, i.card.line, i.card.column,
      // i.card.title, i.card.why — and the code itself, which this function
      // isn't even given access to.
    })),
  };
}

export async function saveSession(payload: SavePayload): Promise<boolean> {
  try {
    const res = await fetch("/api/history/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}
