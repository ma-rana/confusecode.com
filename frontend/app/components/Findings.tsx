import type { Card, Severity } from "../types";

/**
 * Renders educational cards (§6.2) as escaped text. React escapes all
 * interpolated strings by default — we never use dangerouslySetInnerHTML with
 * user-derived content. Card prose is authored by us (safe); the ESLint message
 * echoed in the fallback `why` is user-adjacent, so escaping still matters.
 *
 * A card explains WHY and nudges investigation. It never shows a fix.
 */

const SEVERITY_ORDER: Record<Severity, number> = {
  high: 0,
  medium: 1,
  low: 2,
  info: 3,
};

export function Findings({ cards }: { cards: Card[] }) {
  if (cards.length === 0) {
    return (
      <div className="all-clear" role="status">
        <strong>All clear.</strong>
        Nothing flagged in this pass. Edit your code and analyze again to keep
        probing, or move on with confidence.
      </div>
    );
  }

  const sorted = [...cards].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );

  return (
    <section className="findings" aria-label="Findings">
      <div className="findings__head">
        <span className="findings__count">
          {cards.length} {cards.length === 1 ? "thing to look into" : "things to look into"}
        </span>
        <span className="findings__sub">
          understand each one, then fix it yourself
        </span>
      </div>

      <ul className="card-list">
        {sorted.map((c) => (
          <li key={c.id} className={`card card--${c.severity}`}>
            <div className="card__top">
              <span className={`sev sev--${c.severity}`}>{c.severity}</span>
              <h3 className="card__title">{c.title}</h3>
              <span className="card__loc">
                line {c.line}
              </span>
            </div>

            <p className="card__why">{c.why}</p>

            <div className="card__meta">
              <span className="chip">
                <span className="chip__label">concept</span>
                {c.concept}
              </span>
              <span className="chip">
                <span className="chip__label">difficulty</span>
                {c.difficulty}
              </span>
              {c.ruleId && (
                <span className="chip chip--mono">
                  <span className="chip__label">rule</span>
                  {c.ruleId}
                </span>
              )}
            </div>

            <p className="card__investigate">
              <span className="card__investigate-label">Go investigate</span>
              {c.investigate}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
