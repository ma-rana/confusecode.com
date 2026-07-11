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
  // Wall-clock kill for a single analysis. This bounds the actual PARSE only —
  // the one-time parser cold-load is warmed at startup and waits untimed (see
  // analyze.ts), so it is not counted here. A real parse is a few dozen ms; the
  // generous margin is headroom for a large/pathological input on a slow box.
  ANALYSIS_TIMEOUT_MS: 8_000,
  MAX_CONCURRENT_ANALYSES: 4, // semaphore; excess gets 503 + Retry-After
  RATE_LIMIT_MAX: 30, // requests...
  RATE_LIMIT_WINDOW: "1 minute", // ...per window, per IP

  // ---- Server ----
  PORT: Number(process.env.PORT ?? 4000),
  HOST: process.env.HOST ?? "127.0.0.1", // localhost only — only Caddy is public
  // In production the frontend is same-origin via Caddy, so CORS can stay locked.
  // For local dev the Next.js dev server runs on a different port.
  ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN ?? "http://localhost:3000",

  // ---- Phase 5: accounts, sessions, history (§7.12, §9.5) ----
  // The whole account layer is OPTIONAL. If DATABASE_URL is unset the server
  // still boots and the stateless core (Phases 1–4) works exactly as before —
  // the account routes simply aren't registered. Fail safe, not fail closed.

  /** Public origin the browser sees. OAuth redirect URIs are built from this. */
  PUBLIC_ORIGIN: process.env.PUBLIC_ORIGIN ?? "http://localhost:3000",

  /** Cookie signing secret. REQUIRED when accounts are enabled. */
  COOKIE_SECRET: process.env.COOKIE_SECRET ?? "",
  /** Secure cookies (HTTPS only). Off in local dev, ON in production. */
  COOKIE_SECURE: process.env.COOKIE_SECURE === "true",

  /** Absolute session lifetime — a session dies this long after login, always. */
  SESSION_ABSOLUTE_DAYS: 30,
  /** Idle timeout — an untouched session dies this long after its last use. */
  SESSION_IDLE_DAYS: 14,
  /** How long the short-lived OAuth `state` cookie lives (CSRF guard). */
  OAUTH_STATE_TTL_MS: 10 * 60 * 1000,

  /** Default retention for saved learning history (§9.5). 0 = keep until deleted. */
  HISTORY_RETENTION_DAYS: Number(process.env.HISTORY_RETENTION_DAYS ?? 365),
  /** Max learning_events accepted in one save — bounds a hostile payload. */
  MAX_EVENTS_PER_SAVE: 500,
  /** How often the background purge sweeps expired sessions + history. */
  PURGE_INTERVAL_MS: 60 * 60 * 1000, // hourly
} as const;

/** True when the account/history layer is configured. Checked at boot. */
export function accountsEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL && process.env.COOKIE_SECRET);
}
