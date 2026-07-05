/**
 * The language router (§4.3).
 *
 * Maps a validated extension to the analyzer that handles it. All rows here
 * still resolve to ESLint — but ESLint now drives several parsers (JS/TS via
 * typescript-eslint, .vue via vue-eslint-parser, .svelte via svelte-eslint-
 * parser), selected per-extension inside the worker (see analyzers.ts).
 *
 * This is the future-proofing seam. Adding a language later is: install its
 * analyzer, add a row here, write its finding→card translation — NO rewrite of
 * the pipeline.
 *
 *   (future) ".py"  → "ruff"
 *   (future) ".go"  → "govet"
 */

export type Analyzer = "eslint";

const ROUTES: Record<string, Analyzer> = {
  ".js": "eslint",
  ".jsx": "eslint",
  ".ts": "eslint",
  ".tsx": "eslint",
  ".mjs": "eslint",
  ".cjs": "eslint",
  ".vue": "eslint",
  ".svelte": "eslint",
};

/**
 * Resolve a validated extension to an analyzer, or null if unsupported.
 * (A null result in Phase 3 becomes "attempted unsupported language"
 * demand-logging; for now the caller simply rejects it.)
 */
export function routeByExtension(ext: string): Analyzer | null {
  return ROUTES[ext] ?? null;
}
