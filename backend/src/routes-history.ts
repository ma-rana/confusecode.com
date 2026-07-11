import type { FastifyInstance } from "fastify";
import { CONFIG } from "./config.js";
import { requireSameOrigin, requireUser } from "./auth.js";
import { isReviewType } from "./review-presets.js";
import {
  conceptCounts,
  deleteLearningSession,
  exportUserData,
  listLearningSessions,
  ruleHistory,
  saveLearningSession,
  type LearningEventInput,
} from "./db-queries.js";

/**
 * Learning-history routes (Phase 5).
 *
 *   POST   /api/history/sessions       save a finished session (opt-in only)
 *   GET    /api/history/sessions       my saved sessions, newest first
 *   DELETE /api/history/sessions/:id   delete one
 *   GET    /api/history/rules          "you've hit this before" — per-rule counts
 *   GET    /api/history/export         everything we hold on me, as JSON (§9.5)
 *
 * =============================================================================
 * THE ONE RULE THIS FILE EXISTS TO ENFORCE (§8.1a):
 *
 *   The client sends what it *claims* is a learning summary. This file is the
 *   boundary that decides what a summary is ALLOWED to be. Every field is
 *   whitelisted by name and re-validated by type. Anything the client sends that
 *   we didn't ask for — a `code` field, a snippet, a filename, a source line —
 *   is not rejected so much as never looked at. It cannot reach the database,
 *   because nothing here ever reads it.
 *
 *   That is the difference between "we don't store your code" as a policy and as
 *   a property. The frontend is not trusted to keep the promise; this file makes
 *   it structurally unable to break it.
 * =============================================================================
 */

/** The shape we accept. Note what's absent: no code, no filename, no line/column. */
interface SaveBody {
  reviewType?: unknown;
  language?: unknown;
  revisions?: unknown;
  issuesTotal?: unknown;
  issuesFixed?: unknown;
  issuesUnderstood?: unknown;
  events?: unknown;
}

const SEVERITIES = new Set(["info", "low", "medium", "high"]);
const DIFFICULTIES = new Set(["beginner", "intermediate", "advanced"]);
const OUTCOMES = new Set(["surfaced", "understood", "fixed"]);
const LANGUAGES = new Set(["javascript", "typescript", "tsx", "jsx", "vue", "svelte"]);

/** A non-negative integer, or null. Rejects floats, NaN, Infinity, "3", true. */
function nat(v: unknown, max: number): number | null {
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > max) return null;
  return v;
}

/** A short, clean string — or null. Bounds every text field that reaches SQL. */
function shortStr(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || s.length > max) return null;
  return s;
}

/**
 * Validate one event. Returns null if it doesn't fit — and one bad event fails
 * the whole save rather than being silently dropped, because a summary with
 * holes in it is a lie about what the user did.
 */
function parseEvent(raw: unknown): LearningEventInput | null {
  if (typeof raw !== "object" || raw === null) return null;
  const e = raw as Record<string, unknown>;

  const concept = shortStr(e.concept, 128);
  const severity = shortStr(e.severity, 16);
  const difficulty = shortStr(e.difficulty, 16);
  const outcome = shortStr(e.outcome, 16);
  if (!concept || !severity || !difficulty || !outcome) return null;
  if (!SEVERITIES.has(severity)) return null;
  if (!DIFFICULTIES.has(difficulty)) return null;
  if (!OUTCOMES.has(outcome)) return null;

  // rule_id is genuinely optional (our fallback cards have none).
  const ruleId = e.ruleId === null || e.ruleId === undefined
    ? null
    : shortStr(e.ruleId, 128);
  if (e.ruleId !== null && e.ruleId !== undefined && ruleId === null) return null;

  return {
    ruleId,
    concept,
    severity,
    difficulty,
    outcome: outcome as LearningEventInput["outcome"],
  };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Retention date for a newly-saved session (§9.5). Null = keep until deleted. */
function retentionDate(): Date | null {
  if (CONFIG.HISTORY_RETENTION_DAYS <= 0) return null;
  return new Date(Date.now() + CONFIG.HISTORY_RETENTION_DAYS * 86_400_000);
}

export function registerHistoryRoutes(app: FastifyInstance): void {
  // Everything below requires a signed-in user, and state-changing calls also
  // require a same-origin request. There is no route that takes a user id — you
  // can only ever read your own history, by construction.
  const guarded = { preHandler: [requireSameOrigin, requireUser] };
  const guardedRead = { preHandler: requireUser };

  // ---- Save a finished session ----------------------------------------------
  app.post<{ Body: SaveBody }>("/api/history/sessions", guarded, async (req, reply) => {
    const user = req.user!;

    // Consent gate. Signed in ≠ consented to be remembered (§9.5). If the user
    // hasn't opted in, we don't save and we say so — we don't silently discard.
    if (!user.history_opt_in) {
      return reply.code(403).send({
        error: "History saving is off. Turn it on in your account to save sessions.",
      });
    }

    const b = (req.body ?? {}) as SaveBody;

    // Whitelist, field by field. Note that `b` may well contain a `code` key —
    // we simply never read it, so it dies here with the request object.
    if (!isReviewType(b.reviewType)) {
      return reply.code(400).send({ error: "Unknown review type." });
    }
    const language = shortStr(b.language, 32);
    if (!language || !LANGUAGES.has(language)) {
      return reply.code(400).send({ error: "Unknown language." });
    }

    const revisions = nat(b.revisions, 10_000);
    const issuesTotal = nat(b.issuesTotal, 10_000);
    const issuesFixed = nat(b.issuesFixed, 10_000);
    const issuesUnderstood = nat(b.issuesUnderstood, 10_000);
    if (
      revisions === null || revisions < 1 ||
      issuesTotal === null ||
      issuesFixed === null ||
      issuesUnderstood === null
    ) {
      return reply.code(400).send({ error: "Invalid session metrics." });
    }
    // The same coherence rules the DB now enforces — checked here so the user
    // gets a 400 instead of a 500 from a constraint violation.
    if (issuesFixed > issuesTotal || issuesUnderstood > issuesTotal) {
      return reply.code(400).send({ error: "Invalid session metrics." });
    }

    if (!Array.isArray(b.events)) {
      return reply.code(400).send({ error: "events must be an array." });
    }
    if (b.events.length > CONFIG.MAX_EVENTS_PER_SAVE) {
      return reply.code(413).send({ error: "Too many events in one session." });
    }

    const events: LearningEventInput[] = [];
    for (const raw of b.events) {
      const e = parseEvent(raw);
      if (!e) return reply.code(400).send({ error: "Invalid learning event." });
      events.push(e);
    }

    const id = await saveLearningSession({
      userId: user.id,
      reviewType: b.reviewType,
      language,
      revisions,
      issuesTotal,
      issuesFixed,
      issuesUnderstood,
      events,
      expiresAt: retentionDate(),
    });

    req.log.info({ event: "history_saved", reviewType: b.reviewType }, "session saved");
    return reply.code(201).send({ id });
  });

  // ---- Read my history -------------------------------------------------------
  app.get("/api/history/sessions", guardedRead, async (req, reply) => {
    const sessions = await listLearningSessions(req.user!.id, 50);
    return reply.send({ sessions });
  });

  /**
   * The payload behind "you've hit this before". The frontend joins these counts
   * onto the cards it just received — the JOIN happens in the BROWSER, so the
   * server never sees which rules fired on the code you just pasted. Your current
   * findings and your saved history are never correlated server-side.
   */
  app.get("/api/history/rules", guardedRead, async (req, reply) => {
    const [rules, concepts] = await Promise.all([
      ruleHistory(req.user!.id),
      conceptCounts(req.user!.id),
    ]);
    return reply.send({ rules, concepts });
  });

  app.delete<{ Params: { id: string } }>(
    "/api/history/sessions/:id",
    guarded,
    async (req, reply) => {
      // Reject non-UUIDs before they reach Postgres: `id = 'nope'` is a 22P02
      // type error, which would surface as a 500 for what is really a 404.
      if (!UUID_RE.test(req.params.id)) {
        return reply.code(404).send({ error: "Not found." });
      }
      // The DELETE is scoped by user_id in SQL, so guessing another user's UUID
      // deletes nothing and is indistinguishable from a stale id.
      const ok = await deleteLearningSession(req.user!.id, req.params.id);
      if (!ok) return reply.code(404).send({ error: "Not found." });
      return reply.send({ ok: true });
    },
  );

  /** Everything we hold on you, in one file (§9.5 access/export). */
  app.get("/api/history/export", guardedRead, async (req, reply) => {
    const data = await exportUserData(req.user!.id);
    return reply
      .header("Content-Disposition", 'attachment; filename="confusecode-data.json"')
      .send(data);
  });
}
