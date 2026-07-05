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

/** Resolve a session token hash to its user, if the session is still valid. */
export async function getUserBySessionToken(
  tokenHash: string,
): Promise<UserRow | null> {
  const pool = getPool();
  const { rows } = await pool.query<UserRow>(
    `UPDATE auth_sessions
       SET last_used_at = now()
     WHERE token_hash = $1 AND expires_at > now()
     RETURNING user_id`,
    [tokenHash],
  );
  const userId = (rows[0] as unknown as { user_id?: string })?.user_id;
  if (!userId) return null;
  return getUserById(userId);
}

export async function deleteAuthSession(tokenHash: string): Promise<void> {
  const pool = getPool();
  await pool.query(`DELETE FROM auth_sessions WHERE token_hash = $1`, [
    tokenHash,
  ]);
}

/** Housekeeping: remove expired sessions. Safe to run on a schedule. */
export async function purgeExpiredSessions(): Promise<number> {
  const pool = getPool();
  const { rowCount } = await pool.query(
    `DELETE FROM auth_sessions WHERE expires_at <= now()`,
  );
  return rowCount ?? 0;
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

    for (const e of params.events) {
      await client.query(
        `INSERT INTO learning_events
           (learning_session_id, user_id, rule_id, concept, severity, difficulty, outcome)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          sessionId,
          params.userId,
          e.ruleId,
          e.concept,
          e.severity,
          e.difficulty,
          e.outcome,
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
