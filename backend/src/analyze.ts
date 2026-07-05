import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { Linter } from "eslint";
import { CONFIG } from "./config.js";
import type { RawFinding, WorkerJob, WorkerReply } from "./eslint-worker.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * A single LONG-LIVED worker thread that serves analyses one at a time (§4.4,
 * §7.4).
 *
 * Why one persistent worker instead of one-per-request: the parser/plugin
 * packages (Vue, Svelte, typescript-eslint, react, next, n) take a few seconds
 * to load — several seconds under the dev loader on some machines. Paying that
 * on every request, inside the wall-clock timeout, made every analysis time out.
 * So the worker loads them ONCE and is reused; the actual `verify` is ~40ms.
 *
 * TWO THINGS THAT MATTER for the timeout:
 *  1. We WARM the worker at startup (see the eager spawn at the bottom), so the
 *     cold parser load happens before any user request instead of during one.
 *  2. The per-job wall-clock timer only starts once the worker is READY and the
 *     job is actually posted. It must NOT count the cold-load time against a
 *     job — otherwise a slow first load trips the timeout before the worker even
 *     begins parsing. The worker sends a `{ ready: true }` ping when its parsers
 *     have loaded; jobs queued before that just wait (untimed) for it.
 *
 * Why ONE worker, not a pool: the real work is tiny; the cost is purely the cold
 * load. Several workers just multiply that load and contend under the dev loader.
 * This app analyzes one paste at a time, so serial processing with a queue fits.
 * The concurrency cap in server.ts still sheds genuine overload with a 503.
 *
 * DoS guarantee (§7.4) preserved: a job that blows the wall clock means a hung
 * parse, so we TERMINATE the worker (killing the parse) and respawn; the next
 * queued job runs on the fresh worker. One pathological input costs one restart.
 *
 * The worker file sits next to this one: `eslint-worker.js` compiled, or
 * `eslint-worker.ts` under tsx in dev. import.meta.url carries the right
 * extension, so we swap the basename.
 */
const IS_DEV = fileURLToPath(import.meta.url).endsWith(".ts");
const WORKER_FILE = IS_DEV ? "eslint-worker.ts" : "eslint-worker.js";
const WORKER_PATH = path.resolve(__dirname, WORKER_FILE);

interface PendingJob {
  job: WorkerJob;
  resolve: (findings: RawFinding[]) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout | null;
}

let worker: Worker | null = null;
let workerReady = false;
// Timestamp when the current worker began warming, for a one-time ready log.
let warmStartedAt: number | null = null;
let jobCounter = 0;
// The job currently running on the worker (workers do one at a time).
let active: PendingJob | null = null;
// Jobs waiting for the worker to be free (or to finish loading).
const queue: PendingJob[] = [];

function makeWorker(): Worker {
  workerReady = false;
  warmStartedAt = performance.now();
  const w = new Worker(WORKER_PATH, {
    // Preserve loader flags (e.g. tsx) so the worker runs in dev too.
    execArgv: process.execArgv,
  });

  w.on("message", (msg: WorkerReply | { ready: true }) => {
    // Startup readiness ping — the worker has finished loading its parsers.
    // NOW it can actually process jobs, so we let the queue start (and only
    // now does a job's timeout clock begin, inside pump()).
    if ("ready" in msg) {
      workerReady = true;
      if (warmStartedAt !== null) {
        // One-time visibility: how long the parser cold-load actually took.
        const ms = Math.round(performance.now() - warmStartedAt);
        // eslint-disable-next-line no-console
        console.log(`[analyze] parser worker ready in ${ms}ms`);
        warmStartedAt = null;
      }
      pump();
      return;
    }

    const finished = active;
    if (!finished || msg.id !== finished.job.id) return; // stray/stale reply.
    if (finished.timer) clearTimeout(finished.timer);
    active = null;

    if (msg.ok) finished.resolve(msg.findings);
    else finished.reject(new Error(msg.error));

    pump();
  });

  w.on("error", (err) => {
    failActiveAndRespawn(err instanceof Error ? err : new Error("worker error"));
  });

  w.on("exit", (code) => {
    // Non-zero exit with an active job is a crash; fail it and respawn.
    if (code !== 0 && active) {
      failActiveAndRespawn(new Error("Analysis worker stopped unexpectedly."));
    } else if (worker === w) {
      worker = null;
      workerReady = false; // force a fresh (warming) spawn next time.
    }
  });

  return w;
}

/** Ensure a worker exists, spawning (and warming) one if needed. */
function ensureWorker(): void {
  if (!worker) worker = makeWorker();
}

/** Terminate the current worker, fail the active job, and respawn a fresh one. */
function failActiveAndRespawn(err: Error): void {
  const dead = worker;
  worker = null;
  workerReady = false;
  if (dead) void dead.terminate();

  const failed = active;
  active = null;
  if (failed) {
    if (failed.timer) clearTimeout(failed.timer);
    failed.reject(err);
  }

  // Bring a fresh worker up (it will warm, then pump the queue on ready).
  if (queue.length > 0) ensureWorker();
}

/**
 * Start the next queued job, but ONLY if the worker is idle AND ready. If the
 * worker is still loading parsers, queued jobs wait here untimed until the
 * `{ ready: true }` ping calls pump() again.
 */
function pump(): void {
  if (active || queue.length === 0) return;
  ensureWorker();
  if (!workerReady) return; // wait for the readiness ping; do NOT start a timer.

  const next = queue.shift()!;
  active = next;

  next.timer = setTimeout(() => {
    // Wall-clock kill: a hung parse. Terminate + respawn; reject this job.
    failActiveAndRespawn(new Error("Analysis timed out."));
  }, CONFIG.ANALYSIS_TIMEOUT_MS);

  worker!.postMessage(next.job);
}

/**
 * Analyze `code` (of extension `ext`) against `rules` on the persistent worker,
 * with a hard per-job wall-clock timeout that starts only once the worker is
 * ready. Jobs run one at a time in FIFO order. Same signature as before.
 */
export function analyze(
  code: string,
  ext: string,
  rules: Linter.RulesRecord,
): Promise<RawFinding[]> {
  return new Promise<RawFinding[]>((resolve, reject) => {
    const job: WorkerJob = { id: ++jobCounter, code, ext, rules };
    queue.push({ job, resolve, reject, timer: null });
    pump();
  });
}

// Warm the worker at module load, so the ~seconds-long parser load happens at
// server startup rather than during the first user request.
ensureWorker();
