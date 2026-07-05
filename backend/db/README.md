# ConfuseCode — Database (Phase 5)

Phase 5 is the first phase that needs a database. Phases 0–4 run with none, so
if you're not using accounts/history yet, you can ignore this directory entirely.

## Principle

> Store learning **history (events/diffs), never raw code** (§5.1, §8.1a, §9.6).

Nothing in this schema holds user source code. It keeps minimal OAuth identity
and learning-history categories (rule, concept, outcome) — so a breach exposes
progress, not code, and there are no passwords to leak (OAuth only).

## Tables (migration `001_init.sql`)

- **users** — minimal identity from an OAuth provider (github/google). No password.
- **auth_sessions** — server-side sessions; stores a *hash* of the session token,
  never the token itself, so a DB leak can't be replayed as a cookie.
- **learning_sessions** — durable version of the Phase 4 work-log: summary metrics
  per saved session (counts, review type, revisions). No code.
- **learning_events** — per-issue history (rule + concept + outcome). Categories,
  never the code line that triggered them. Powers "you've hit this before".

## Local setup (real PostgreSQL, matching production)

1. Install PostgreSQL 14+ and create a least-privilege role and database:

   ```sql
   CREATE ROLE confusecode WITH LOGIN PASSWORD 'changeme';
   CREATE DATABASE confusecode OWNER confusecode;
   ```

2. Point the backend at it in `backend/.env`:

   ```
   DATABASE_URL=postgres://confusecode:changeme@localhost:5432/confusecode
   ```

3. Run the migrations:

   ```bash
   cd backend
   npm run migrate          # dev (tsx)
   # or, after building:
   npm run migrate:prod     # node dist/migrate.js
   ```

   The runner applies any `.sql` in `db/migrations/` not yet recorded in
   `schema_migrations`, in filename order, each in its own transaction.

## Security notes (§7.12)

- **Parameterized queries only.** All SQL lives in `src/db-queries.ts` and uses
  `$1, $2` placeholders — never string interpolation of user input.
- **Least-privilege DB user.** The app's role should own only this database and
  hold no superuser rights.
- **TLS in production.** Set `DATABASE_SSL=true` so the app requires TLS to the DB.
- **Backups + tested restore** belong here (Phase 5), now that there's data to own.
