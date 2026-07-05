/**
 * The shape of a raw finding returned by the backend.
 * Phase 1 is raw ESLint output. Phase 2 will wrap each of these in an
 * educational card (title, why-it-matters, concept, difficulty, investigate).
 */
export interface Finding {
  ruleId: string | null;
  message: string;
  line: number;
  column: number;
  severity: number; // 1 = warning, 2 = error
}

export interface AnalyzeSuccess {
  findings: Finding[];
}

export interface AnalyzeError {
  error: string;
}

export type AnalyzeResponse = AnalyzeSuccess | AnalyzeError;
