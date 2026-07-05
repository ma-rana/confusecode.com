import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import cors from "@fastify/cors";
import { CONFIG } from "./config.js";
import { validateSubmission, type SubmissionInput } from "./validate.js";
import { routeByExtension } from "./router.js";
import { analyze } from "./analyze.js";
import { ConcurrencyGate } from "./semaphore.js";

/**
 * The backend pipeline (§4.2):
 *   validate → rate-limit → route → analyze (worker+timeout) → JSON
 *
 * Stateless. Stores nothing. Never logs submitted code (§7.9).
 * Binds localhost only — only Caddy is public (§4.5).
 */

const app = Fastify({
  bodyLimit: 2_000_000, // 2 MB, mirrors the Caddy request-body cap
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

app.get("/health", async () => ({ status: "ok" }));

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
    const result = validateSubmission(req.body as SubmissionInput);
    if (!result.ok) {
      return reply.code(400).send({ error: result.error });
    }

    // Route to an analyzer. v1 has exactly one: JS/TS → ESLint.
    const analyzer = routeByExtension(result.ext);
    if (analyzer !== "eslint") {
      // Phase 3: log as demand data. For now, reject.
      return reply.code(400).send({ error: "Unsupported language." });
    }

    const findings = await analyze(result.code);
    // Code is discarded here — nothing is retained (§4.4).
    return reply.send({ findings });
  } catch (err) {
    // Generic outward message; detail stays in server logs only (§7.10).
    req.log.error({ err: err instanceof Error ? err.message : "unknown" }, "analysis failed");
    return reply.code(500).send({ error: "Analysis failed. Please try again." });
  } finally {
    gate.release();
  }
});

try {
  await app.listen({ port: CONFIG.PORT, host: CONFIG.HOST });
  app.log.info(`ConfuseCode backend listening on http://${CONFIG.HOST}:${CONFIG.PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
