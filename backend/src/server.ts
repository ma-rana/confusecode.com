import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import { CONFIG, accountsEnabled } from "./config.js";
import { registerAuthRoutes } from "./routes-auth.js";
import { registerHistoryRoutes } from "./routes-history.js";
import { purgeExpired } from "./db-queries.js";
import { closePool } from "./db.js";
import { validateSubmission, type SubmissionInput } from "./validate.js";
import { routeByExtension } from "./router.js";
import { detectFramework } from "./detect.js";
import { analyze } from "./analyze.js";
import { educate } from "./educate.js";
import { ConcurrencyGate } from "./semaphore.js";
import {
  REVIEW_MENU,
  DEFAULT_REVIEW_TYPE,
  isReviewType,
  rulesFor,
} from "./review-presets.js";

/**
 * The backend pipeline (§4.2):
 *   validate → rate-limit → route → analyze (worker+timeout) → educate → JSON
 *
 * Stateless. Stores nothing. Never logs submitted code (§7.9).
 * Binds localhost only — only the reverse proxy (nginx) is public (§4.5).
 */

const app = Fastify({
  bodyLimit: 2_000_000, // 2 MB, mirrors the proxy's request-body cap

  /**
   * We sit behind nginx, so EVERY request arrives from 127.0.0.1. Without this,
   * `req.ip` is the proxy's address for all users — and the per-IP rate limiter
   * (§7.4) would silently become a per-SITE rate limiter: 30 requests a minute
   * shared by the entire internet, and one busy user locks everyone out.
   *
   * Trusting only the loopback hop is the careful version. `X-Forwarded-For` is
   * a client-settable header, so trusting it blindly lets anyone forge their IP
   * and evade the limiter; here we accept it only from 127.0.0.1, which is the
   * one address that cannot be spoofed from outside — nginx is the sole thing
   * that can reach this port, because we bind to localhost.
   */
  trustProxy: "127.0.0.1",

  logger: {
    // Log events, not people. Never include request bodies.
    level: "info",
    redact: ["req.body", "req.headers.authorization"],
  },
});

const gate = new ConcurrencyGate(CONFIG.MAX_CONCURRENT_ANALYSES);

await app.register(cors, {
  origin: CONFIG.ALLOWED_ORIGIN, // locked to the app's origin; never "*"
  methods: ["POST", "GET"],
});

await app.register(rateLimit, {
  max: CONFIG.RATE_LIMIT_MAX,
  timeWindow: CONFIG.RATE_LIMIT_WINDOW,
  // @fastify/rate-limit returns 429 with Retry-After automatically.
});

/**
 * ---- Phase 5: the account layer, and why it's conditional --------------------
 *
 * Accounts are a STRICTLY OPTIONAL layer bolted onto a system that works without
 * them. If DATABASE_URL or COOKIE_SECRET is unset, none of the routes below are
 * registered and no pool is ever opened — the server is exactly the stateless
 * Phase 1–4 analyzer it always was. This is not a fallback, it's the design:
 * the core product must never *need* a database, because the core product must
 * never hold anything worth breaching.
 *
 * Everything the account layer adds is a memory of your PROGRESS. Not your code.
 */
const withAccounts = accountsEnabled();

if (withAccounts) {
  // Cookies are the only reason the account layer needs a plugin at all. The
  // secret signs the short-lived OAuth `state` cookie; the session cookie itself
  // is an opaque random token that needs no signing (there's nothing to forge).
  await app.register(cookie, { secret: CONFIG.COOKIE_SECRET });
  registerAuthRoutes(app);
  registerHistoryRoutes(app);
  app.log.info("accounts + history enabled (DATABASE_URL is set)");
} else {
  // Say so loudly at boot. A silently-disabled auth layer is how you end up
  // wondering for an hour why /api/me 404s.
  app.log.info(
    "accounts DISABLED — stateless mode. Set DATABASE_URL and COOKIE_SECRET to enable.",
  );
  // Answer the UI's probes honestly rather than 404ing at them, so the frontend
  // can simply not render a login button instead of erroring.
  app.get("/api/auth/providers", async () => ({ providers: [] }));
  app.get("/api/me", async () => ({ user: null }));
}

app.get("/health", async () => ({ status: "ok" }));

// The review-type menu (§6.1). The frontend renders these as buttons.
app.get("/api/review-types", async () => ({
  reviewTypes: REVIEW_MENU,
  default: DEFAULT_REVIEW_TYPE,
}));

app.post("/api/analyze", async (req, reply) => {
  // Concurrency cap — shed load cleanly rather than spawning unbounded workers.
  if (!gate.tryAcquire()) {
    return reply
      .code(503)
      .header("Retry-After", "2")
      .send({ error: "Server is busy. Please retry shortly." });
  }

  try {
    // Validate every input, every time (§7.2). Fail closed.
    const body = (req.body ?? {}) as SubmissionInput & { reviewType?: unknown };
    const result = validateSubmission(body);
    if (!result.ok) {
      return reply.code(400).send({ error: result.error });
    }

    // Resolve the review type. Unknown/absent → default preset (fail safe).
    const reviewType = isReviewType(body.reviewType)
      ? body.reviewType
      : DEFAULT_REVIEW_TYPE;

    // Auto-detect the framework + parser from the code and extension (§4.3).
    // The UI no longer asks; we infer. Detection may refine the extension too
    // (e.g. a pasted Vue SFC validated as .ts is detected as .vue so the Vue
    // parser runs). Detection never executes code — it's regex sniffing only.
    const detected = detectFramework(result.code, result.ext);

    // Route on the DETECTED extension — that's the one the worker will parse.
    const analyzer = routeByExtension(detected.ext);
    if (analyzer !== "eslint") {
      // Anonymous demand data: which unsupported languages people try (§Phase 3).
      // Logs the extension only — never the code.
      req.log.info(
        { event: "unsupported_language", ext: detected.ext },
        "attempted unsupported language",
      );
      return reply.code(400).send({ error: "Unsupported language." });
    }

    // The rule set = the chosen review type's rules PLUS the detected framework's
    // rules (if any). So a pasted React component under "Find errors" runs the
    // React rules and the error rules together, with no framework picker needed.
    const rules = rulesFor(reviewType, detected.framework);

    const findings = await analyze(result.code, detected.ext, rules);
    // Translate raw findings into educational cards (§6.2) — the teaching layer.
    const cards = educate(findings);
    // Code is discarded here — nothing is retained (§4.4).
    // Echo the detected framework so the UI can show what was recognised.
    return reply.send({ cards, reviewType, framework: detected.framework });
  } catch (err) {
    // Generic outward message; detail stays in server logs only (§7.10).
    req.log.error(
      { err: err instanceof Error ? err.message : "unknown" },
      "analysis failed",
    );
    return reply.code(500).send({ error: "Analysis failed. Please try again." });
  } finally {
    gate.release();
  }
});

/**
 * ---- Retention, unprompted (§9.5) -------------------------------------------
 *
 * Expired auth sessions and out-of-retention history are deleted on a timer, not
 * when someone remembers to ask. A retention policy that requires a human to run
 * it isn't a policy — it's an intention. This is the code that makes the promise
 * on the privacy page true while everyone's asleep.
 *
 * unref() so a pending timer never holds the process open during shutdown.
 */
let purgeTimer: NodeJS.Timeout | null = null;

if (withAccounts) {
  const sweep = async () => {
    try {
      const { sessions, history } = await purgeExpired(CONFIG.SESSION_IDLE_DAYS);
      if (sessions || history) {
        app.log.info({ event: "purge", sessions, history }, "expired data purged");
      }
    } catch (err) {
      // A failed sweep must never take the analyzer down with it.
      app.log.error(
        { err: err instanceof Error ? err.message : "unknown" },
        "purge failed",
      );
    }
  };
  purgeTimer = setInterval(sweep, CONFIG.PURGE_INTERVAL_MS);
  purgeTimer.unref();
  void sweep(); // once at boot, so a restart after downtime cleans up immediately
}

/**
 * Graceful shutdown. Stop accepting connections, let in-flight analyses finish,
 * then close the pool. Without the closePool() a redeploy leaves Postgres holding
 * dead connections until its own timeout reaps them.
 */
async function shutdown(signal: string): Promise<void> {
  app.log.info({ event: "shutdown", signal }, "shutting down");
  if (purgeTimer) clearInterval(purgeTimer);
  try {
    await app.close();
    if (withAccounts) await closePool();
  } catch (err) {
    app.log.error({ err: (err as Error).message }, "error during shutdown");
  }
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

try {
  await app.listen({ port: CONFIG.PORT, host: CONFIG.HOST });
  app.log.info(
    `ConfuseCode backend listening on http://${CONFIG.HOST}:${CONFIG.PORT}`,
  );
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
