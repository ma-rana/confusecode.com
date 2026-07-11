# ConfuseCode — Database & Accounts (Phase 5)

Phase 5 is the first phase that needs a database. Phases 0–4 run with none, and
they still do: if `DATABASE_URL` or `COOKIE_SECRET` is unset, the server boots in
**stateless mode** — no pool is opened, no cookie plugin is registered, and none
of the account routes exist. That is a supported way to run ConfuseCode forever.

## Principle

> Store learning **history (events/diffs), never raw code** (§5.1, §8.1a, §9.6).

Nothing in this schema holds user source code. It keeps minimal OAuth identity
and learning-history categories (rule, concept, outcome) — so a breach exposes
progress, not code, and there are no passwords to leak (OAuth only).

The promise is enforced in three places, not one:

1. **`routes-history.ts`** builds every saved row from a field-by-field
   whitelist. A `code` key in the request body isn't rejected — it's simply never
   read, so it cannot reach the database.
2. **`account.ts` (frontend)** builds the payload the same way, from named fields
   only. There is no `...card` spread anywhere, so a new field on `Card` can't
   silently start being uploaded.
3. **The schema itself** has no column that could hold code even if we wanted to.

## Tables

| table | what it holds | what it never holds |
|---|---|---|
| `users` | provider, provider id, optional name/email/avatar, `history_opt_in` | passwords (there are none — OAuth only) |
| `auth_sessions` | a **SHA-256 hash** of the session token, expiry, last-used | the token itself, so a DB leak can't be replayed as a cookie |
| `learning_sessions` | per-session counts: revisions, surfaced/fixed/understood | code, filenames, findings |
| `learning_events` | rule id, concept, severity, difficulty, outcome | the code line that triggered it |
| `schema_migrations` | which migrations have run | — |

## Sessions expire twice

Both rules are enforced **in SQL**, in the same statement that resolves the
cookie — so an expired session is unusable even if a caller forgets to check.

- **Absolute:** 30 days from login. Set once, never extended.
- **Idle:** 14 days since last use. A forgotten session dies on its own.

Revocation is real: logout `DELETE`s the row. Deleting an account deletes every
session it ever had.

## Retention runs on its own

An hourly sweep (`purgeExpired`, started in `server.ts`) deletes expired auth
sessions and learning history past `HISTORY_RETENTION_DAYS` (default 365; set 0
to keep until the user deletes it). A retention policy that needs a human to run
it isn't a policy — it's an intention.

## Local setup

1. Install PostgreSQL 14+ and create a least-privilege role and database:

   ```sql
   CREATE ROLE confusecode WITH LOGIN PASSWORD 'changeme';
   CREATE DATABASE confusecode OWNER confusecode;
   ```

   You do **not** need `postgresql-contrib`. The schema uses core
   `gen_random_uuid()` (Postgres 13+), not the `pgcrypto` extension, precisely so
   a clean VPS doesn't fail on the very first migration.

2. Fill in `backend/.env` (copy from `.env.example`):

   ```
   DATABASE_URL=postgres://confusecode:changeme@localhost:5432/confusecode
   COOKIE_SECRET=<node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
   PUBLIC_ORIGIN=http://localhost:3000
   ```

3. Register at least one OAuth app and put its credentials in `.env`:

   - **GitHub** — <https://github.com/settings/developers> → New OAuth App.
     Callback URL: `<PUBLIC_ORIGIN>/api/auth/github/callback`.
     We request `read:user` only: profile, no repo access, ever.
   - **Google** — <https://console.cloud.google.com/apis/credentials>.
     Redirect URI: `<PUBLIC_ORIGIN>/api/auth/google/callback`.
     Scopes `openid email profile`.

   A provider with no credentials configured simply isn't offered as a login
   button. Shipping with one, both, or neither all work.

4. Run the migrations:

   ```bash
   cd backend
   npm install              # @fastify/cookie is new in Phase 5
   npm run migrate          # dev (tsx)
   npm run migrate:prod     # or, after building: node dist/migrate.js
   ```

   The runner applies any `.sql` in `db/migrations/` not yet recorded in
   `schema_migrations`, in filename order, each in its own transaction.

## Routes this layer adds

```
GET    /api/auth/providers          which logins are configured
GET    /api/auth/:provider/start    → redirect to GitHub/Google
GET    /api/auth/:provider/callback ← provider returns here; session is minted
POST   /api/auth/logout             kill this session (row deleted, not just cookie)
GET    /api/me                      who am I (null when signed out — not a 401)
POST   /api/me/history-opt-in       the consent switch (§9.5)
DELETE /api/me                      delete account + everything, cascading
POST   /api/history/sessions        save a finished session (opt-in required)
GET    /api/history/sessions        my saved sessions
DELETE /api/history/sessions/:id    delete one
GET    /api/history/rules           "you've hit this before" — per-rule counts
GET    /api/history/export          everything we hold on me, as JSON
```

There is **no route that takes a user id**. Every query is scoped by the
session's own `user_id` in SQL, so reading someone else's history isn't blocked —
it's unexpressible.

## Where "you've hit this before" is computed

In the **browser**. The frontend fetches its own per-rule counts from
`/api/history/rules` and joins them against the cards it just received. The
server therefore never learns which rules fired on the code you just pasted:
your current findings and your saved history are never correlated server-side.

## Security notes (§7.12)

- **Parameterized queries only.** All SQL lives in `src/db-queries.ts` and uses
  `$1, $2` placeholders — never string interpolation of user input.
- **Session tokens are hashed at rest** (SHA-256). The raw token exists only in
  the user's `HttpOnly` cookie.
- **CSRF:** `SameSite=Lax` cookies *plus* a server-side Origin check on every
  state-changing route. Two mechanisms, so neither is load-bearing alone.
- **OAuth `state`** is a CSPRNG nonce in a *signed* HttpOnly cookie, compared in
  constant time. The provider's access token is used once to read the profile and
  then discarded — we never store a credential that can act as the user on GitHub
  or Google.
- **Least-privilege DB user.** The app's role should own only this database.
- **TLS in production.** Set `DATABASE_SSL=true`.
- **Backups + tested restore** belong here — now there's data to own.

## Testing the schema without installing Postgres

The migrations and every query in `db-queries.ts` were validated against real
Postgres (PGlite, the official WASM build) — covering the CTE session lookup, the
idle and absolute expiry rules, the `UNNEST` bulk insert, the recall query, every
CHECK constraint, the retention purge, and the delete-cascades. Worth keeping that
habit: schema bugs are the expensive kind.
