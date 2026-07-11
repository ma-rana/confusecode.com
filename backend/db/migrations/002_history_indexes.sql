-- ConfuseCode — Phase 5 schema (migration 002)
-- =============================================================================
-- Migration 001 designed the tables. This one makes them hold up under the
-- queries the app actually runs, and under a hostile client.
--
-- Nothing here changes the governing principle: still no user code, anywhere.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. The index behind "you've hit this before".
--
-- ruleHistory() groups a user's events by rule_id. Without this, that's a scan
-- of every event the user has ever produced, every time they analyze. 001 gave
-- us (user_id, concept); cards are keyed by RULE, so we need (user_id, rule_id)
-- too. Partial: rows with no rule_id are never grouped, so they don't belong in
-- the index and shouldn't pay for it.
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS learning_events_user_rule_idx
  ON learning_events (user_id, rule_id)
  WHERE rule_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. The index behind the idle-timeout purge.
--
-- The session sweep deletes on `last_used_at <= now() - interval`. 001 indexed
-- expires_at but not last_used_at, so half of the purge predicate was a seq scan.
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS auth_sessions_last_used_at_idx
  ON auth_sessions (last_used_at);

-- -----------------------------------------------------------------------------
-- 3. Integrity constraints the app promises but the schema never enforced.
--
-- The API validates its inputs — but the database is the LAST line, and it's the
-- one that's still true if a future route forgets. These say, in the schema
-- itself, what a coherent learning session is: you cannot have fixed more issues
-- than were ever surfaced, and you cannot have run negative revisions.
--
-- (Written as NOT VALID + VALIDATE so adding them never takes a long exclusive
-- lock on an existing table — the pattern to reach for on a live database.)
-- -----------------------------------------------------------------------------
ALTER TABLE learning_sessions
  ADD CONSTRAINT learning_sessions_counts_sane
  CHECK (
    revisions         >= 1 AND
    issues_total      >= 0 AND
    issues_fixed      >= 0 AND
    issues_understood >= 0 AND
    issues_fixed      <= issues_total AND
    issues_understood <= issues_total
  ) NOT VALID;

ALTER TABLE learning_sessions VALIDATE CONSTRAINT learning_sessions_counts_sane;

-- A saved session must finish no earlier than it started.
ALTER TABLE learning_sessions
  ADD CONSTRAINT learning_sessions_timeline_sane
  CHECK (finished_at >= started_at) NOT VALID;

ALTER TABLE learning_sessions VALIDATE CONSTRAINT learning_sessions_timeline_sane;

-- An auth session must expire after it was created.
ALTER TABLE auth_sessions
  ADD CONSTRAINT auth_sessions_expiry_sane
  CHECK (expires_at > created_at) NOT VALID;

ALTER TABLE auth_sessions VALIDATE CONSTRAINT auth_sessions_expiry_sane;

-- -----------------------------------------------------------------------------
-- 4. Bound the text columns.
--
-- 001 used bare TEXT everywhere, which in Postgres is unbounded — a single field
-- can hold a gigabyte. These are all short, well-known values (an OAuth id, a
-- rule name, a concept label), so cap them. This is not micro-optimisation: it
-- closes off a class of storage-exhaustion abuse where a hostile client (or a
-- weird provider response) writes megabytes into a row we thought was tiny.
-- -----------------------------------------------------------------------------
ALTER TABLE users
  ADD CONSTRAINT users_field_lengths
  CHECK (
    length(provider)             <= 32  AND
    length(provider_id)          <= 255 AND
    length(coalesce(display_name, '')) <= 300 AND
    length(coalesce(email, ''))        <= 320 AND
    length(coalesce(avatar_url, ''))   <= 2048
  ) NOT VALID;

ALTER TABLE users VALIDATE CONSTRAINT users_field_lengths;

ALTER TABLE learning_events
  ADD CONSTRAINT learning_events_field_lengths
  CHECK (
    length(coalesce(rule_id, '')) <= 128 AND
    length(concept)               <= 128
  ) NOT VALID;

ALTER TABLE learning_events VALIDATE CONSTRAINT learning_events_field_lengths;

ALTER TABLE learning_sessions
  ADD CONSTRAINT learning_sessions_field_lengths
  CHECK (
    length(review_type) <= 64 AND
    length(language)    <= 32
  ) NOT VALID;

ALTER TABLE learning_sessions VALIDATE CONSTRAINT learning_sessions_field_lengths;

ALTER TABLE auth_sessions
  ADD CONSTRAINT auth_sessions_field_lengths
  CHECK (
    length(token_hash) = 64 AND                        -- SHA-256, hex. Exactly.
    length(coalesce(user_agent, '')) <= 256
  ) NOT VALID;

ALTER TABLE auth_sessions VALIDATE CONSTRAINT auth_sessions_field_lengths;
