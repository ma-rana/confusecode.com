import type { RawFinding } from "./eslint-worker.js";
import type { EducationalCard } from "./education-types.js";
import { RULE_EDUCATION, fallbackEducation } from "./education-map.js";

/**
 * Translate raw ESLint findings into educational cards (§6.2).
 * This is the pipeline stage that makes ConfuseCode more than "ESLint with a UI".
 *
 * Pure and deterministic: same findings in → same cards out. No fixing, ever.
 */

/**
 * A stable-ish identity for a finding, used to match "the same issue" across
 * edits (§6.4). Line numbers shift as the user edits, so we intentionally do
 * NOT include the line — rule + a rough ordinal is "good enough to feel like
 * progress", which the design doc explicitly prefers over perfect matching.
 */
function makeId(ruleId: string | null, ordinal: number): string {
  return `${ruleId ?? "unknown"}#${ordinal}`;
}

export function educate(findings: RawFinding[]): EducationalCard[] {
  // Track how many times we've seen each rule, to give repeated findings of the
  // same rule distinct-but-stable ids.
  const seen = new Map<string, number>();

  return findings.map((f) => {
    const key = f.ruleId ?? "unknown";
    const ordinal = seen.get(key) ?? 0;
    seen.set(key, ordinal + 1);

    const content =
      (f.ruleId && RULE_EDUCATION[f.ruleId]) ||
      fallbackEducation(f.ruleId, f.message);

    return {
      ...content,
      id: makeId(f.ruleId, ordinal),
      ruleId: f.ruleId,
      line: f.line,
      column: f.column,
      detail: f.message,
    };
  });
}
