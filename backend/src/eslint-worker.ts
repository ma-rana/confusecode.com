import { parentPort, workerData } from "node:worker_threads";
import { Linter } from "eslint";
import { profileForExt } from "./analyzers.js";
import type { Linter as LinterNS } from "eslint";

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
 * or crash the server. This matters MORE now that several framework parsers
 * (Vue, Svelte) run here — each is its own surface, all under one timeout.
 *
 * Design note: the parser/plugin wiring lives in analyzers.ts. The worker just
 * picks the profile for the submission's extension, builds its config, and runs
 * verify() with a synthetic filename (required so the flat-config `files`
 * matcher matches — see analyzers.ts). The rule set is passed in via workerData.
 */

export interface RawFinding {
  ruleId: string | null;
  message: string;
  line: number;
  column: number;
  severity: number; // 1 = warn, 2 = error
}

interface WorkerInput {
  code: string;
  ext: string;
  rules: LinterNS.RulesRecord;
}

const { code, ext, rules } = workerData as WorkerInput;

const linter = new Linter();

const profile = profileForExt(ext);
if (!profile) {
  // Should never happen — the router rejects unsupported extensions before we
  // get here — but fail closed rather than guess a parser.
  throw new Error(`No analyzer profile for extension: ${ext}`);
}

// Phase 3: the rule set is chosen by the review type the user picked (§6.1) and
// passed in from the parent. The curated presets ARE the intelligence — no
// model, just measured rules. The profile supplies the parser + plugins.
const config = profile.build(rules);
const filename = profile.filenameFor(ext);

const messages = linter.verify(code, config, filename);

const findings: RawFinding[] = messages.map((m) => ({
  ruleId: m.ruleId,
  message: m.message,
  line: m.line,
  column: m.column,
  severity: m.severity,
}));

parentPort?.postMessage(findings);
