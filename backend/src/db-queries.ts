import type { Pool } from "pg";
import { getPool } from "./db.js";

/**
 * Data-access layer (Phase 5).
 *
 * EVERY query here uses parameterized placeholders ($1, $2, …) — never string
 * interpolation of user input (§7.12). This module is the ONLY place SQL lives,
 * so the parameterization rule is enforceable by review in one file.
 *
 * Nothing here reads or writes raw user code — only identity and learning
 * history (events/diffs), per §8.1a.
 */

// ---- Row types (mirror the schema) ----

export interface UserRow {
  id: string;
  provider: string;
  provider_id: string;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
  history_opt_in: boolean;
  created_at: Date;
  updated_at: Date;
  last_seen_at: Date;
}

export interface LearningSessionRow {
  id: string;
  user_id: string;
  review_type: string;
  language: string;
  revisions: number;
  issues_total: number;
  issues_fixed: number;
  issues_understood: number;
  started_at: Date;
  finished_at: Date;
  expires_at: Date | null;
}

export interface LearningEventInput {
  ruleId: string | null;
  concept: string;
  severity: string;
  difficulty: string;
  outcome: "surfaced" | "understood" | "fixed";
}

// ---- Users ----

/**
 * Find an existing user by their provider identity, or create one. Called after
 * a successful OAuth login. Upserts minimal profile fields the provider returned.
 */
export async function upsertUserByProvider(params: {
  provider: string;
  providerId: string;
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
}): Promise<UserRow> {
  const pool: Pool = getPool();
  const { rows } = await pool.query<UserRow>(
    `INSERT INTO users (provider, provider_id, display_name, email, avatar_url, last_seen_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (provider, provider_id)
     DO UPDATE SET
       display_name = EXCLUDED.display_name,
       email        = EXCLUDED.email,
       avatar_url   = EXCLUDED.avatar_url,
       last_seen_at = now(),
       updated_at   = now()
     RETURNING *`,
    [
      params.provider,
      params.providerId,
      params.displayName,
      params.email,
      params.avatarUrl,
    ],
  );
  // ON CONFLICT ... RETURNING always yields exactly one row.
  return rows[0]!;
}

export async function getUserById(id: string): Promise<UserRow | null> {
  const pool = getPool();
  const { rows } = await pool.query<UserRow>(
    `SELECT * FROM users WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

/** Toggle the opt-in for saving history (§9.5). */
export async function setHistoryOptIn(
  userId: string,
  optIn: boolean,
): Promise<void> {
  const pool = getPool();
  await pool.query(
    `UPDATE users SET history_opt_in = $2, updated_at = now() WHERE id = $1`,
    [userId, optIn],
  );
}

/** Full account + data deletion (§9.5). Cascades to sessions/events by FK. */
export async function deleteUser(userId: string): Promise<void> {
  const pool = getPool();
  await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
}

// ---- Auth sessions ----

export async function createAuthSession(params: {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  userAgent: string | null;
}): Promise<string> {
  const pool = getPool();
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO auth_sessions (user_id, token_hash, expires_at, user_agent)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [params.userId, params.tokenHash, params.expiresAt, params.userAgent],
  );
  return rows[0]!.id;
}

/**
 * Resolve a session token hash to its user — the hot path on every request.
 *
 * Enforces BOTH expiry rules in SQL, in one round trip:
 *   - absolute: expires_at > now()            (set at login, never extended)
 *   - idle:     last_used_at > now() - idle   (a forgotten session dies on its own)
 *
 * Doing this in SQL (not in app code) means an expired session is unusable even
 * if a caller forgets to check, and the `RETURNING` on the UPDATE gives us the
 * touch-and-read atomically. A single expression, one lock, no race.
 *
 * Returns null for absent/expired/idle-timed-out sessions — indistinguishable to
 * the caller, so there's nothing to probe.
 */
export async function getUserBySessionToken(
  tokenHash: string,
  idleDays: number,
): Promise<UserRow | null> {
  const pool = getPool();
  const { rows } = await pool.query<UserRow>(
    `WITH touched AS (
       UPDATE auth_sessions
          SET last_used_at = now()
        WHERE token_hash = $1
          AND expires_at > now()
          AND last_used_at > now() - ($2 || ' days')::interval
        RETURNING user_id
     )
     UPDATE users u
        SET last_seen_at = now()
       FROM touched t
      WHERE u.id = t.user_id
      RETURNING u.*`,
    [tokenHash, String(idleDays)],
  );
  return rows[0] ?? null;
}

export async function deleteAuthSession(tokenHash: string): Promise<void> {
  const pool = getPool();
  await pool.query(`DELETE FROM auth_sessions WHERE token_hash = $1`, [
    tokenHash,
  ]);
}

/** Log out everywhere — kill every session this user has. Used on account delete. */
export async function deleteAllAuthSessions(userId: string): Promise<void> {
  const pool = getPool();
  await pool.query(`DELETE FROM auth_sessions WHERE user_id = $1`, [userId]);
}

/**
 * Housekeeping (§9.5). Runs on a schedule and deletes, unprompted:
 *   - auth sessions past their absolute expiry OR their idle window
 *   - learning history past its retention date
 *
 * Retention that only happens when a user asks isn't retention, it's a promise.
 * This is the code that makes "we don't keep it forever" true by default.
 */
export async function purgeExpired(idleDays: number): Promise<{
  sessions: number;
  history: number;
}> {
  const pool = getPool();
  const s = await pool.query(
    `DELETE FROM auth_sessions
      WHERE expires_at <= now()
         OR last_used_at <= now() - ($1 || ' days')::interval`,
    [String(idleDays)],
  );
  const h = await pool.query(
    `DELETE FROM learning_sessions
      WHERE expires_at IS NOT NULL AND expires_at <= now()`,
  );
  return { sessions: s.rowCount ?? 0, history: h.rowCount ?? 0 };
}

// ---- Learning history ----

/**
 * Persist a completed learning session plus its per-issue events, atomically.
 * Only called when the user has opted in (§9.5). Stores summary + events, never
 * code (§8.1a).
 */
export async function saveLearningSession(params: {
  userId: string;
  reviewType: string;
  language: string;
  revisions: number;
  issuesTotal: number;
  issuesFixed: number;
  issuesUnderstood: number;
  events: LearningEventInput[];
  expiresAt: Date | null;
}): Promise<string> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO learning_sessions
         (user_id, review_type, language, revisions,
          issues_total, issues_fixed, issues_understood, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        params.userId,
        params.reviewType,
        params.language,
        params.revisions,
        params.issuesTotal,
        params.issuesFixed,
        params.issuesUnderstood,
        params.expiresAt,
      ],
    );
    const sessionId = rows[0]!.id;

    // All events in ONE statement via UNNEST of parallel arrays. Still fully
    // parameterized ($3..$7 are arrays, not interpolated SQL), but it's a single
    // round trip instead of N — a 60-issue session was 60 network hops before.
    if (params.events.length > 0) {
      await client.query(
        `INSERT INTO learning_events
           (learning_session_id, user_id, rule_id, concept, severity, difficulty, outcome)
         SELECT $1, $2, r, c, s, d, o
           FROM unnest(
                  $3::text[], $4::text[], $5::text[], $6::text[], $7::text[]
                ) AS t(r, c, s, d, o)`,
        [
          sessionId,
          params.userId,
          params.events.map((e) => e.ruleId),
          params.events.map((e) => e.concept),
          params.events.map((e) => e.severity),
          params.events.map((e) => e.difficulty),
          params.events.map((e) => e.outcome),
        ],
      );
    }

    await client.query("COMMIT");
    return sessionId;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** A user's saved sessions, newest first. Ownership enforced by user_id (§7.12). */
export async function listLearningSessions(
  userId: string,
  limit = 50,
): Promise<LearningSessionRow[]> {
  const pool = getPool();
  const { rows } = await pool.query<LearningSessionRow>(
    `SELECT * FROM learning_sessions
     WHERE user_id = $1
     ORDER BY finished_at DESC
     LIMIT $2`,
    [userId, limit],
  );
  return rows;
}

/**
 * "You've hit this concept before" — counts of each concept across a user's
 * history (§5, Phase 5 goal). Categories only, never code.
 */
export async function conceptCounts(
  userId: string,
): Promise<{ concept: string; count: number }[]> {
  const pool = getPool();
  const { rows } = await pool.query<{ concept: string; count: string }>(
    `SELECT concept, COUNT(*) AS count
     FROM learning_events
     WHERE user_id = $1
     GROUP BY concept
     ORDER BY count DESC`,
    [userId],
  );
  return rows.map((r) => ({ concept: r.concept, count: Number(r.count) }));
}

export interface RuleHistoryRow {
  rule_id: string;
  times_seen: number;
  times_fixed: number;
  last_seen: Date;
}

/**
 * The payload behind "you've hit this before" (§5) — per RULE, because that's
 * what a card carries. One row per rule the user has ever encountered, with how
 * often they hit it, how often they actually fixed it, and when they last saw it.
 *
 * `times_fixed` vs `times_seen` is the interesting number: a rule seen eight
 * times and fixed twice is a habit, not an accident, and that's exactly the
 * thing worth telling a learner. Counts and rule names only — never code.
 */
export async function ruleHistory(userId: string): Promise<RuleHistoryRow[]> {
  const pool = getPool();
  const { rows } = await pool.query<{
    rule_id: string;
    times_seen: string;
    times_fixed: string;
    last_seen: Date;
  }>(
    `SELECT rule_id,
            COUNT(*)                                        AS times_seen,
            COUNT(*) FILTER (WHERE outcome = 'fixed')       AS times_fixed,
            MAX(created_at)                                 AS last_seen
       FROM learning_events
      WHERE user_id = $1 AND rule_id IS NOT NULL
      GROUP BY rule_id
      ORDER BY times_seen DESC`,
    [userId],
  );
  return rows.map((r) => ({
    rule_id: r.rule_id,
    times_seen: Number(r.times_seen),
    times_fixed: Number(r.times_fixed),
    last_seen: r.last_seen,
  }));
}

/** Delete one saved session (ownership-checked). Part of user data rights (§9.5). */
export async function deleteLearningSession(
  userId: string,
  sessionId: string,
): Promise<boolean> {
  const pool = getPool();
  const { rowCount } = await pool.query(
    `DELETE FROM learning_sessions WHERE id = $1 AND user_id = $2`,
    [sessionId, userId],
  );
  return (rowCount ?? 0) > 0;
}

/** Export everything we hold for a user (§9.5 access/export). */
export async function exportUserData(userId: string): Promise<{
  user: UserRow | null;
  sessions: LearningSessionRow[];
  concepts: { concept: string; count: number }[];
}> {
  const [user, sessions, concepts] = await Promise.all([
    getUserById(userId),
    listLearningSessions(userId, 1000),
    conceptCounts(userId),
  ]);
  return { user, sessions, concepts };
}
