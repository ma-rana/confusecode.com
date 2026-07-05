-- ConfuseCode — Phase 5 schema (migration 001)
-- =============================================================================
-- GOVERNING PRINCIPLE (§5.1, §8.1a, §9.6): store learning HISTORY, never raw code.
-- Nothing in this schema holds user source code. We keep the minimum identity
-- needed to know whose history is whose, plus events/diffs about what they
-- learned. Every table is designed so a breach exposes progress, not code and
-- not secrets. No passwords are stored (OAuth only), so there are none to leak.
-- =============================================================================

-- UUIDs for primary keys (v4). pgcrypto ships with Postgres and gives gen_random_uuid().
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- users — minimal identity, sourced from an OAuth provider (§7.12).
-- We store no password (there is none) and no email is required to function;
-- email is optional and only kept if the provider returns it and the user opts in.
-- -----------------------------------------------------------------------------
CREATE TABLE users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Which provider authenticated them, e.g. 'github' or 'google'.
  provider       TEXT NOT NULL,
  -- The provider's own stable user id (NOT our id). Unique per provider.
  provider_id    TEXT NOT NULL,
  -- Optional, minimal profile fields. Nullable on purpose — none are required.
  display_name   TEXT,
  email          TEXT,
  avatar_url     TEXT,
  -- Whether the user has opted in to saving learning history (§9.5 opt-in).
  history_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One account per (provider, provider_id). Prevents duplicate identities.
  CONSTRAINT users_provider_identity_unique UNIQUE (provider, provider_id),
  CONSTRAINT users_provider_check CHECK (provider IN ('github', 'google'))
);

-- -----------------------------------------------------------------------------
-- sessions — server-side auth sessions (§7.12: HttpOnly/Secure/SameSite cookie).
-- The cookie carries only this opaque id; all session data lives here, not in
-- the cookie. Storing sessions server-side lets us revoke them (logout, breach).
-- We store a HASH of the session token, never the token itself — so a DB leak
-- can't be replayed as a valid cookie.
-- -----------------------------------------------------------------------------
CREATE TABLE auth_sessions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- SHA-256 of the session token. The raw token is only ever in the user's cookie.
  token_hash     TEXT NOT NULL UNIQUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at     TIMESTAMPTZ NOT NULL,
  -- For idle-timeout enforcement and "last active" display.
  last_used_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Transient, truncated context for abuse review — never a full IP long-term (§7.9).
  user_agent     TEXT
);

CREATE INDEX auth_sessions_user_id_idx ON auth_sessions (user_id);
CREATE INDEX auth_sessions_expires_at_idx ON auth_sessions (expires_at);

-- -----------------------------------------------------------------------------
-- learning_sessions — one row per completed review session a user chose to save.
-- This is the durable version of the in-browser work-log from Phase 4. It holds
-- SUMMARY facts (counts, concepts, review type), NOT the code and NOT the raw
-- findings' code context.
-- -----------------------------------------------------------------------------
CREATE TABLE learning_sessions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Which review preset was used (e.g. 'errors', 'confusing'). Not code.
  review_type    TEXT NOT NULL,
  language       TEXT NOT NULL DEFAULT 'typescript',
  -- Summary metrics mirrored from the Phase 4 completion summary.
  revisions      INTEGER NOT NULL DEFAULT 1,
  issues_total   INTEGER NOT NULL DEFAULT 0,
  issues_fixed   INTEGER NOT NULL DEFAULT 0,
  issues_understood INTEGER NOT NULL DEFAULT 0,
  started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Auto-expiry timestamp for retention limits (§9.5). NULL = keep until deleted.
  expires_at     TIMESTAMPTZ
);

CREATE INDEX learning_sessions_user_id_idx ON learning_sessions (user_id);
CREATE INDEX learning_sessions_finished_at_idx ON learning_sessions (finished_at);
CREATE INDEX learning_sessions_expires_at_idx ON learning_sessions (expires_at);

-- -----------------------------------------------------------------------------
-- learning_events — the per-issue "diff" history (§6.4, §8.1a: events NOT code).
-- Each row records that a user encountered/understood/fixed a specific kind of
-- issue. It stores the RULE and CONCEPT — never the code line that triggered it.
-- This is what powers "you've made this mistake before" across files/days,
-- without ever keeping the user's source.
-- -----------------------------------------------------------------------------
CREATE TABLE learning_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learning_session_id UUID NOT NULL REFERENCES learning_sessions(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- The ESLint rule and our concept label — categories, not code.
  rule_id             TEXT,
  concept             TEXT NOT NULL,
  severity            TEXT NOT NULL,
  difficulty          TEXT NOT NULL,
  -- What happened to this issue in the session.
  outcome             TEXT NOT NULL,  -- 'surfaced' | 'understood' | 'fixed'
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT learning_events_outcome_check
    CHECK (outcome IN ('surfaced', 'understood', 'fixed')),
  CONSTRAINT learning_events_severity_check
    CHECK (severity IN ('info', 'low', 'medium', 'high')),
  CONSTRAINT learning_events_difficulty_check
    CHECK (difficulty IN ('beginner', 'intermediate', 'advanced'))
);

CREATE INDEX learning_events_user_id_idx ON learning_events (user_id);
CREATE INDEX learning_events_session_idx ON learning_events (learning_session_id);
-- Supports "how often has this user hit this concept?" queries efficiently.
CREATE INDEX learning_events_user_concept_idx ON learning_events (user_id, concept);

-- -----------------------------------------------------------------------------
-- schema_migrations — tracks which migrations have run (simple, no ORM needed).
-- -----------------------------------------------------------------------------
CREATE TABLE schema_migrations (
  version     TEXT PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
