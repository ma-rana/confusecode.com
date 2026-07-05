/**
 * Educational card returned by the backend (Phase 2, §6.2).
 * Each card is a teaching moment built from a raw ESLint finding — it explains
 * why something matters and nudges investigation, but never contains a fix.
 */
export type Severity = "info" | "low" | "medium" | "high";
export type Difficulty = "beginner" | "intermediate" | "advanced";

export interface Card {
  id: string;
  ruleId: string | null;
  line: number;
  column: number;
  title: string;
  severity: Severity;
  why: string;
  concept: string;
  difficulty: Difficulty;
  investigate: string;
}

/** A review type in the menu (Phase 3, §6.1). */
export interface ReviewTypeOption {
  id: string;
  label: string;
  blurb: string;
  /** Analyzer profiles this review supports ("js", "vue", "svelte"). */
  profiles: string[];
}

export interface AnalyzeSuccess {
  cards: Card[];
  reviewType: string;
}

export interface AnalyzeError {
  error: string;
}

export type AnalyzeResponse = AnalyzeSuccess | AnalyzeError;

export interface ReviewTypesResponse {
  reviewTypes: ReviewTypeOption[];
  default: string;
}
