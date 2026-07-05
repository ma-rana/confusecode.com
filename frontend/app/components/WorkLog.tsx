import type { TrackedIssue, IssueStatus } from "../session";

/**
 * The work-log view (§6.4): every issue seen this session, with its status
 * across revisions. Renders card content as escaped text (§7.6) and offers the
 * "Got it" learning act (§6.3). Never shows a fix.
 */

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
}: {
  issues: TrackedIssue[];
  onGotIt: (id: string) => void;
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

              {issue.goneFromAnalysis && issue.status !== "got-it" && (
                <p className="card__fixed-note">
                  You fixed this — it&rsquo;s no longer flagged. Nice.
                </p>
              )}

              {issue.status === "open" && !issue.goneFromAnalysis && (
                <button
                  className="btn-gotit"
                  onClick={() => onGotIt(issue.id)}
                >
                  I understand this — got it
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
