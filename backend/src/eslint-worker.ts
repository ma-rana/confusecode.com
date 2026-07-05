import { parentPort, workerData } from "node:worker_threads";
import { Linter } from "eslint";
import tsParser from "@typescript-eslint/parser";

/**
 * Runs INSIDE a worker thread (spawned by analyze.ts).
 *
 * NON-NEGOTIABLE (§7.2): this only ever PARSES the code into an AST and
 * measures it against rules. It NEVER executes submitted code — no eval,
 * import(), require(), Function(), or vm. `Linter.verify` is parse-only,
 * which is exactly why no Docker sandbox is needed in v1.
 *
 * Isolation rationale (§7.2, decision #16): the parser is an attack surface
 * (ReDoS, pathological nesting). Running here in a worker means a hung parse
 * is killed by the parent's wall-clock timeout and can't pin the event loop
 * or crash the server.
 *
 * Design note: this worker imports NOTHING project-local (only eslint + parser,
 * which are real node_modules). The rule set is passed in via workerData rather
 * than imported here, so the worker resolves cleanly in both dev (tsx running
 * .ts) and production (compiled .js) without depending on a loader propagating
 * into the worker thread.
 */

import type { Linter as LinterNS } from "eslint";

export interface RawFinding {
  ruleId: string | null;
  message: string;
  line: number;
  column: number;
  severity: number; // 1 = warn, 2 = error
}

interface WorkerInput {
  code: string;
  rules: LinterNS.RulesRecord;
}

const { code, rules } = workerData as WorkerInput;

const linter = new Linter();

// Phase 3: the rule set is chosen by the review type the user picked (§6.1) and
// passed in from the parent. The curated presets ARE the intelligence — no
// model, just measured rules.
const messages = linter.verify(code, {
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    // typescript-eslint parser handles both JS and TS syntax.
    parser: tsParser,
    // Standard globals so common runtime names aren't false-flagged by no-undef.
    globals: {
      console: "readonly",
      process: "readonly",
      window: "readonly",
      document: "readonly",
      fetch: "readonly",
      setTimeout: "readonly",
      clearTimeout: "readonly",
      setInterval: "readonly",
      clearInterval: "readonly",
      Promise: "readonly",
      Math: "readonly",
      JSON: "readonly",
      Object: "readonly",
      Array: "readonly",
    },
  },
  rules,
});

const findings: RawFinding[] = messages.map((m) => ({
  ruleId: m.ruleId,
  message: m.message,
  line: m.line,
  column: m.column,
  severity: m.severity,
}));

parentPort?.postMessage(findings);
