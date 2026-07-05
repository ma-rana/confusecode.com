import { CONFIG } from "./config.js";

/**
 * Server-side input validation — THE security boundary (§7.2, §7.3).
 * Client-side checks are UX only; attackers bypass the browser.
 *
 * Principles enforced here:
 *  - Validate every input, every time (not just the first).
 *  - Fail closed: any ambiguity/error → reject cleanly, never "try anyway".
 *  - Cheapest checks first, before any parsing.
 *  - Never extract, unpack, decode, or execute anything.
 */

export type ValidationOk = {
  ok: true;
  code: string;
  ext: string;
};

export type ValidationError = {
  ok: false;
  /** Safe, non-leaking message intended for the client. */
  error: string;
};

export type ValidationResult = ValidationOk | ValidationError;

export interface SubmissionInput {
  code: unknown;
  filename?: unknown;
}

const ALLOWED = CONFIG.ALLOWED_EXTENSIONS as readonly string[];

function extensionOf(filename: string): string | null {
  const dot = filename.lastIndexOf(".");
  if (dot < 0) return null;
  return filename.slice(dot).toLowerCase();
}

/**
 * Rough nesting-depth estimate from bracket balance.
 * Not a parser (that's the analyzer's job) — just a cheap guard against
 * pathologically deep input before we hand it to the real parser.
 */
function maxNestingDepth(code: string): number {
  let depth = 0;
  let max = 0;
  for (const ch of code) {
    if (ch === "{" || ch === "(" || ch === "[") {
      depth++;
      if (depth > max) max = depth;
    } else if (ch === "}" || ch === ")" || ch === "]") {
      if (depth > 0) depth--;
    }
  }
  return max;
}

export function validateSubmission(input: SubmissionInput): ValidationResult {
  const { code, filename } = input;

  // 1. Must be a non-empty string.
  if (typeof code !== "string") {
    return { ok: false, error: "No code submitted." };
  }
  if (code.length === 0) {
    return { ok: false, error: "The submission is empty." };
  }

  // 2. Reject binary / non-text early (null byte is the cheapest tell).
  if (code.includes("\u0000")) {
    return { ok: false, error: "Binary or non-text content is not allowed." };
  }

  // 3. Size cap (UTF-8 bytes, measured server-side).
  const bytes = Buffer.byteLength(code, "utf8");
  if (bytes > CONFIG.MAX_BYTES) {
    return {
      ok: false,
      error: `File is too large (limit ${Math.round(CONFIG.MAX_BYTES / 1000)} KB).`,
    };
  }

  // 4. Line-count and line-length caps.
  const lines = code.split("\n");
  if (lines.length > CONFIG.MAX_LINES) {
    return { ok: false, error: `Too many lines (limit ${CONFIG.MAX_LINES}).` };
  }
  for (const line of lines) {
    if (line.length > CONFIG.MAX_LINE_LENGTH) {
      return {
        ok: false,
        error: `A line exceeds the maximum length (${CONFIG.MAX_LINE_LENGTH}).`,
      };
    }
  }

  // 5. Nesting-depth guard.
  if (maxNestingDepth(code) > CONFIG.MAX_NESTING_DEPTH) {
    return { ok: false, error: "Code is nested too deeply to analyze safely." };
  }

  // 6. Extension check. Pasted code has no filename → default to TypeScript,
  //    which is a superset the parser handles for both JS and TS.
  let ext = ".ts";
  if (filename !== undefined && filename !== null && filename !== "") {
    if (typeof filename !== "string") {
      return { ok: false, error: "Invalid filename." };
    }
    const parsedExt = extensionOf(filename);
    if (parsedExt === null || !ALLOWED.includes(parsedExt)) {
      return {
        ok: false,
        error: "Only JavaScript/TypeScript files are supported (.js .jsx .ts .tsx .mjs .cjs).",
      };
    }
    ext = parsedExt;
  }

  return { ok: true, code, ext };
}
