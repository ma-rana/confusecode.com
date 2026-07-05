import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { Linter } from "eslint";
import { CONFIG } from "./config.js";
import type { RawFinding } from "./eslint-worker.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Run the ESLint pass in a worker thread with a hard wall-clock timeout (§7.4).
 * If the parse hangs (ReDoS / pathological input), the worker is terminated and
 * the request fails cleanly — no single request can pin a core or crash the box.
 *
 * The worker file sits next to this one: `eslint-worker.js` in the compiled
 * `dist/` output, or `eslint-worker.ts` when running the sources under tsx in
 * dev. `import.meta.url` already carries the correct extension for the current
 * runtime, so we swap the basename. The worker imports nothing project-local,
 * so it resolves cleanly under both runtimes — the rule set is passed in.
 */
const IS_DEV = fileURLToPath(import.meta.url).endsWith(".ts");
const WORKER_FILE = IS_DEV ? "eslint-worker.ts" : "eslint-worker.js";
const WORKER_PATH = path.resolve(__dirname, WORKER_FILE);

export function analyze(
  code: string,
  rules: Linter.RulesRecord,
): Promise<RawFinding[]> {
  return new Promise<RawFinding[]>((resolve, reject) => {
    const worker = new Worker(WORKER_PATH, {
      workerData: { code, rules },
      // Preserve any loader flags (e.g. tsx) so the worker runs in dev too.
      execArgv: process.execArgv,
    });

    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      fn();
    };

    const timer = setTimeout(() => {
      finish(() => reject(new Error("Analysis timed out.")));
    }, CONFIG.ANALYSIS_TIMEOUT_MS);

    worker.on("message", (msg: RawFinding[]) => finish(() => resolve(msg)));
    worker.on("error", (err) => finish(() => reject(err)));
    worker.on("exit", (exitCode) => {
      if (exitCode !== 0) {
        finish(() => reject(new Error("Analysis worker stopped unexpectedly.")));
      }
    });
  });
}
