import type { Finding } from "../types";

/**
 * Renders raw findings as escaped text (§7.6). React escapes all interpolated
 * strings by default — we never use dangerouslySetInnerHTML with anything
 * user-derived. The rule messages echo user identifiers, so they are untrusted.
 *
 * Phase 1 shows raw ESLint output. Phase 2 replaces each row with an
 * educational card (why-it-matters, concept, difficulty, investigate).
 */

function severityLabel(severity: number): "error" | "warn" {
  return severity === 2 ? "error" : "warn";
}

export function Findings({ findings }: { findings: Finding[] }) {
  if (findings.length === 0) {
    return (
      <div className="all-clear" role="status">
        <strong>All clear.</strong>
        Nothing flagged in this pass. Edit your code and analyze again to keep
        probing, or move on with confidence.
      </div>
    );
  }

  const errors = findings.filter((f) => f.severity === 2).length;
  const warnings = findings.length - errors;

  return (
    <section className="findings" aria-label="Findings">
      <div className="findings__head">
        <span className="findings__count">
          {findings.length} {findings.length === 1 ? "finding" : "findings"}
        </span>
        <span className="findings__sub">
          {errors} error{errors === 1 ? "" : "s"} · {warnings} warning
          {warnings === 1 ? "" : "s"} — you fix them, not us
        </span>
      </div>

      <ul className="finding-list">
        {findings.map((f, i) => {
          const kind = severityLabel(f.severity);
          return (
            <li key={i} className={`finding finding--${kind}`}>
              <span className="finding__loc">
                {f.line}:{f.column}
              </span>
              <p className="finding__msg">
                <span className={`severity-tag severity-tag--${kind}`}>
                  {kind}
                </span>
                {f.message}
              </p>
              {f.ruleId && <span className="finding__rule">{f.ruleId}</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
