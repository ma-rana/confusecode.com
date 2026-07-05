import { Pool } from "pg";

/**
 * PostgreSQL connection pool (Phase 5).
 *
 * Security posture (§7.12):
 *  - Parameterized queries ONLY — never string-concatenate user input into SQL.
 *    Every query in this codebase uses $1, $2 placeholders (see db-queries.ts).
 *  - Connection details come from the environment, never committed.
 *  - The DB user should be least-privilege (see db/README).
 *
 * The pool is created lazily and shared. In the stateless core (Phases 1–4) this
 * module is simply never imported, so no DB connection is ever opened.
 */

let pool: Pool | null = null;

export function getPool(): Pool {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Phase 5 features require a PostgreSQL connection.",
    );
  }

  pool = new Pool({
    connectionString,
    // Conservative defaults for a single small VPS.
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    // Enable TLS to the DB in production; local dev typically doesn't need it.
    ssl:
      process.env.DATABASE_SSL === "true"
        ? { rejectUnauthorized: true }
        : undefined,
  });

  pool.on("error", (err) => {
    // A pool-level error (e.g. a backend crash) shouldn't take down the process.
    console.error("Postgres pool error:", err.message);
  });

  return pool;
}

/** Close the pool (used on graceful shutdown and in tests). */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
