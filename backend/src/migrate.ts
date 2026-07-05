import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { getPool, closePool } from "./db.js";

/**
 * Minimal migration runner (§7.12 favours an ORM, but for a solo project a tiny
 * explicit runner is simpler and fully auditable). Applies any .sql file in
 * db/migrations that hasn't been recorded in schema_migrations yet, in order.
 *
 * Run with: npm run migrate
 * Requires DATABASE_URL to be set.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// In dev this file is src/migrate.ts; in prod dist/migrate.js. Migrations live
// at backend/db/migrations either way — walk up from src|dist to backend root.
const MIGRATIONS_DIR = path.resolve(__dirname, "..", "db", "migrations");

async function run(): Promise<void> {
  const pool = getPool();

  // Ensure the tracking table exists before we query it.
  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version TEXT PRIMARY KEY,
       applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
  );

  const applied = new Set(
    (
      await pool.query<{ version: string }>(
        `SELECT version FROM schema_migrations`,
      )
    ).rows.map((r) => r.version),
  );

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort(); // filenames are zero-padded, so lexical sort = correct order

  let ran = 0;
  for (const file of files) {
    const version = file.replace(/\.sql$/, "");
    if (applied.has(version)) continue;

    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(
        `INSERT INTO schema_migrations (version) VALUES ($1)`,
        [version],
      );
      await client.query("COMMIT");
      console.log(`✓ applied ${version}`);
      ran++;
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`✗ failed ${version}:`, (err as Error).message);
      throw err;
    } finally {
      client.release();
    }
  }

  if (ran === 0) console.log("Up to date — no migrations to apply.");
  else console.log(`Done — applied ${ran} migration(s).`);
}

run()
  .then(() => closePool())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error(err);
    await closePool();
    process.exit(1);
  });
