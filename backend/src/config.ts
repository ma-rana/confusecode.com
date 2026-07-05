/**
 * All tunable limits in one place.
 * Sourced from the Master Design Document §7.3 (input validation) and
 * §7.4 (DoS resistance). Change here, nowhere else.
 */
export const CONFIG = {
  // ---- Input validation caps (§7.3) ----
  MAX_BYTES: 1_000_000, // ~1 MB, measured server-side (UTF-8 bytes)
  MAX_LINES: 5_000, // "a few thousand"
  MAX_LINE_LENGTH: 5_000, // guards pathological single-line input
  MAX_NESTING_DEPTH: 200, // guards deeply-nested input that stresses the parser
  ALLOWED_EXTENSIONS: [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".vue", ".svelte"] as const,

  // ---- DoS resistance (§7.4) ----
  ANALYSIS_TIMEOUT_MS: 4_000, // hard wall-clock kill for a single analysis
  MAX_CONCURRENT_ANALYSES: 4, // semaphore; excess gets 503 + Retry-After
  RATE_LIMIT_MAX: 30, // requests...
  RATE_LIMIT_WINDOW: "1 minute", // ...per window, per IP

  // ---- Server ----
  PORT: Number(process.env.PORT ?? 4000),
  HOST: process.env.HOST ?? "127.0.0.1", // localhost only — only Caddy is public
  // In production the frontend is same-origin via Caddy, so CORS can stay locked.
  // For local dev the Next.js dev server runs on a different port.
  ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN ?? "http://localhost:3000",
} as const;
