/**
 * The educational card — Phase 2, "THE HEART" (§6.2).
 *
 * A raw ESLint finding is a machine message. A card is a teaching moment:
 * it explains WHY something matters and nudges the learner to investigate,
 * but it NEVER contains a fix. The user does the work.
 *
 * Write card content for "past-you": the stuck version who wanted to
 * understand, not be handed a patch. Warm, explanatory, teaching.
 */

export type Severity = "info" | "low" | "medium" | "high";
export type Difficulty = "beginner" | "intermediate" | "advanced";

/** The teaching content attached to a rule — authored by us, never user-derived. */
export interface EducationContent {
  title: string; // human title, e.g. "Confusing variable shadowing"
  severity: Severity;
  why: string; // plain-English: why this is a problem
  concept: string; // the programming concept, e.g. "variable scope & shadowing"
  difficulty: Difficulty;
  investigate: string; // a nudge to research/solve — NOT a fix
}

/** A finding turned into a full teaching card, ready for the UI. */
export interface EducationalCard extends EducationContent {
  id: string; // stable-ish identity (rule + location) for cross-revision matching
  ruleId: string | null; // original ESLint rule, for reference
  line: number;
  column: number;
}
