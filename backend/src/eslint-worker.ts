import { parentPort } from "node:worker_threads";
import { Linter } from "eslint";
import { fileURLToPath } from "node:url";
import type { Linter as LinterNS } from "eslint";
import type { profileForExt as ProfileForExt } from "./analyzers.js";

/**
 * Runs INSIDE a pooled worker thread (spawned once by analyze.ts, then reused).
 *
 * NON-NEGOTIABLE (§7.2): this only ever PARSES the code into an AST and
 * measures it against rules. It NEVER executes submitted code — no eval,
 * import(), require(), Function(), or vm. `Linter.verify` is parse-only,
 * which is exactly why no Docker sandbox is needed in v1.
 *
 * WHY A LONG-LIVED WORKER (perf): loading the parser/plugin packages (Vue,
 * Svelte, typescript-eslint, react, next, n) costs ~2s cold. Doing that on
 * every request, inside the wall-clock timeout, blew past the 4s limit. So the
 * worker loads them ONCE at startup (the dynamic import below runs at module
 * load), then serves many analyses over messages — each actual `verify` is a
 * few dozen ms. The parent still enforces the per-job timeout by terminating a
 * worker that goes silent (see analyze.ts), preserving the DoS guarantee (§7.4).
 *
 * DEV vs PROD import: the specifier must match the runtime — analyzers.ts under
 * tsx in dev, analyzers.js when compiled. import.meta.url carries the right
 * extension for the file we're executing as, so we pick accordingly and load it
 * with a typed dynamic import (keeps full type-safety via the `typeof` type).
 */

export interface RawFinding {
  ruleId: string | null;
  message: string;
  line: number;
  column: number;
  severity: number; // 1 = warn, 2 = error
}

/** A job sent from the parent: analyze this code for this ext with these rules. */
export interface WorkerJob {
  id: number;
  code: string;
  ext: string;
  rules: LinterNS.RulesRecord;
}

/** The reply for a job: either findings or an error message. */
export type WorkerReply =
  | { id: number; ok: true; findings: RawFinding[] }
  | { id: number; ok: false; error: string };

// Load the parser wiring ONCE, at worker startup (not per request).
const IS_DEV = fileURLToPath(import.meta.url).endsWith(".ts");
const ANALYZERS_PATH = IS_DEV ? "./analyzers.ts" : "./analyzers.js";
const { profileForExt } = (await import(ANALYZERS_PATH)) as {
  profileForExt: typeof ProfileForExt;
};

// One Linter instance is reused across jobs — it holds no per-job state.
const linter = new Linter();

function analyzeOne(job: WorkerJob): RawFinding[] {
  const profile = profileForExt(job.ext);
  if (!profile) {
    // Should never happen — the router rejects unsupported extensions first —
    // but fail closed rather than guess a parser.
    throw new Error(`No analyzer profile for extension: ${job.ext}`);
  }
  const config = profile.build(job.rules);
  const filename = profile.filenameFor(job.ext);
  const messages = linter.verify(job.code, config, filename);
  return messages.map((m) => ({
    ruleId: m.ruleId,
    message: m.message,
    line: m.line,
    column: m.column,
    severity: m.severity,
  }));
}

// Serve jobs over the message channel. One job in, one reply out.
parentPort?.on("message", (job: WorkerJob) => {
  try {
    const findings = analyzeOne(job);
    const reply: WorkerReply = { id: job.id, ok: true, findings };
    parentPort?.postMessage(reply);
  } catch (err) {
    const reply: WorkerReply = {
      id: job.id,
      ok: false,
      error: err instanceof Error ? err.message : "analysis error",
    };
    parentPort?.postMessage(reply);
  }
});

// Signal readiness once parsers are loaded, so the parent knows the worker is
// warm and can accept jobs.
parentPort?.postMessage({ ready: true });
