import type { TrackedIssue, IssueStatus } from "../session";
import type { RuleHistory } from "../account";

/**
 * The work-log view (§6.4): every issue seen this session, with its status
 * across revisions. Renders card content as escaped text (§7.6) and offers the
 * "Got it" learning act (§6.3). Never shows a fix.
 *
 * Phase 5 adds ONE line to a card: "you've hit this before". It's the entire
 * user-visible payoff of having an account, and it's computed HERE, in the
 * browser, by joining the cards you just got against the rule counts fetched
 * from your history. The server never learns which rules fired on the code you
 * just pasted — the two halves only ever meet on your machine.
 */

/**
 * The recall line. Tuned to inform, never to scold: it states the count, and if
 * the user has actually fixed this rule before it says so, because "you've
 * solved this one before" is the most useful thing you can tell someone who is
 * stuck on it again.
 */
function recallLine(seen: number, fixed: number): string {
  if (fixed > 0) {
    return `You've hit this ${seen}× before — and fixed it ${fixed}×. You know this one.`;
  }
  return `You've hit this ${seen}× before, and not fixed it yet. Worth a proper read.`;
}

function statusLabel(issue: TrackedIssue): { text: string; kind: IssueStatus | "fixed" } {
  if (issue.goneFromAnalysis && issue.status !== "got-it") {
    return { text: "fixed", kind: "fixed" };
  }
  if (issue.status === "got-it") return { text: "got it", kind: "got-it" };
  if (issue.status === "resolved") return { text: "resolved", kind: "resolved" };
  return { text: "open", kind: "open" };
}

export function WorkLog({
  issues,
  onGotIt,
  ruleHistory = {},
}: {
  issues: TrackedIssue[];
  onGotIt: (id: string) => void;
  /** Rule → past encounters. Empty when signed out or not opted in. */
  ruleHistory?: RuleHistory;
}) {
  if (issues.length === 0) {
    return (
      <div className="all-clear" role="status">
        <strong>Nothing flagged.</strong>
        This pass came back clean. Edit and analyze again to keep probing, or
        finish up.
      </div>
    );
  }

  // Open issues first, then done ones — keeps the active work at the top.
  const ordered = [...issues].sort((a, b) => {
    const aDone = a.goneFromAnalysis || a.status !== "open";
    const bDone = b.goneFromAnalysis || b.status !== "open";
    return Number(aDone) - Number(bDone);
  });

  return (
    <section className="findings" aria-label="Work log">
      <ul className="card-list">
        {ordered.map((issue) => {
          const c = issue.card;
          const status = statusLabel(issue);
          const done = issue.goneFromAnalysis || issue.status !== "open";
          // The join: this rule, against everything this user has done before.
          const past = c.ruleId ? ruleHistory[c.ruleId] : undefined;
          return (
            <li
              key={issue.id}
              className={`card card--${c.severity} ${done ? "card--done" : ""}`}
            >
              <div className="card__top">
                <span className={`sev sev--${c.severity}`}>{c.severity}</span>
                <h3 className="card__title">{c.title}</h3>
                <span className={`status status--${status.kind}`}>
                  {status.text}
                </span>
              </div>

              {c.line > 0 && (
                <p className="card__loc">
                  <span className="card__loc-label">location</span>
                  line {c.line}
                  {c.column > 0 ? `, column ${c.column}` : ""}
                </p>
              )}

              {c.detail && (
                <p className="card__detail">
                  <span className="card__detail-label">analyzer</span>
                  {c.detail}
                </p>
              )}

              {past && past.times_seen > 0 && (
                <p className="card__recall">
                  <span className="card__recall-label">before</span>
                  {recallLine(past.times_seen, past.times_fixed)}
                </p>
              )}

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

              {!issue.goneFromAnalysis && (
                <p className="card__investigate">
                  <span className="card__investigate-label">Go investigate</span>
                  {c.investigate}
                </p>
              )}

              {issue.goneFromAnalysis &&
                issue.status !== "got-it" &&
                issue.status !== "resolved" && (
                  <div className="card__fixed-row">
                    <p className="card__fixed-note">
                      You fixed this — it&rsquo;s no longer flagged. Nice.
                    </p>
                    <button
                      className="btn-gotit btn-gotit--small"
                      onClick={() => onGotIt(issue.id)}
                    >
                      Got it
                    </button>
                  </div>
                )}

              {issue.goneFromAnalysis &&
                (issue.status === "got-it" || issue.status === "resolved") && (
                  <p className="card__fixed-note">
                    Fixed and understood. ✓
                  </p>
                )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
