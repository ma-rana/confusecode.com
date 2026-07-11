"use client";

import type { ConceptCount, RuleHistory, SavedSession } from "../account";

/**
 * "My history" (Phase 5) — the payoff for having an account.
 *
 * The framing matters and is chosen carefully. This is NOT a scoreboard and NOT
 * a streak. A learner who sees "you've hit no-shadow eight times" should feel
 * *informed*, not shamed — so the copy names the pattern and points at the
 * concept, and the numbers are counts, never grades. There is no "accuracy",
 * no percentage, nothing to optimise. You cannot lose points here.
 *
 * The habit list is sorted by how often a rule was surfaced and NOT fixed,
 * because that's the honest definition of a habit you still have.
 */
export function HistoryPanel({
  rules,
  concepts,
  sessions,
  onDeleteSession,
  onDeleteAccount,
}: {
  rules: RuleHistory;
  concepts: ConceptCount[];
  sessions: SavedSession[];
  onDeleteSession: (id: string) => void;
  onDeleteAccount: () => void;
}) {
  const habits = Object.values(rules)
    .map((r) => ({ ...r, unfixed: r.times_seen - r.times_fixed }))
    .filter((r) => r.times_seen > 1) // once isn't a habit, it's a Tuesday
    .sort((a, b) => b.unfixed - a.unfixed || b.times_seen - a.times_seen)
    .slice(0, 8);

  const nothingYet = sessions.length === 0 && habits.length === 0;

  return (
    <section className="history" aria-label="My learning history">
      <p className="panel-label">
        <span>My history</span>
      </p>

      {nothingYet && (
        <div className="empty-state">
          <strong>No history yet.</strong>
          Finish a review with &ldquo;Remember my progress&rdquo; turned on and
          the issues you worked through will start showing up here.
        </div>
      )}

      {habits.length > 0 && (
        <div className="history__block">
          <h3 className="history__heading">Patterns you keep running into</h3>
          <ul className="history__rules">
            {habits.map((r) => (
              <li key={r.rule_id} className="history__rule">
                <code className="history__rule-id">{r.rule_id}</code>
                <span className="history__rule-count">
                  seen {r.times_seen}×
                  {r.times_fixed > 0 && `, fixed ${r.times_fixed}×`}
                </span>
              </li>
            ))}
          </ul>
          <p className="history__note">
            Seen often but rarely fixed? That&rsquo;s the one worth reading up on.
          </p>
        </div>
      )}

      {concepts.length > 0 && (
        <div className="history__block">
          <h3 className="history__heading">Concepts you&rsquo;ve touched</h3>
          <div className="summary__chips">
            {concepts.slice(0, 14).map((c) => (
              <span key={c.concept} className="chip">
                {c.concept} <span className="chip__count">{c.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {sessions.length > 0 && (
        <div className="history__block">
          <h3 className="history__heading">Saved sessions</h3>
          <ul className="history__sessions">
            {sessions.map((s) => (
              <li key={s.id} className="history__session">
                <span className="history__session-when">
                  {new Date(s.finished_at).toLocaleDateString()}
                </span>
                <span className="history__session-what">
                  {s.review_type} · {s.issues_total} surfaced · {s.issues_fixed}{" "}
                  fixed
                </span>
                <button
                  className="history__delete"
                  onClick={() => onDeleteSession(s.id)}
                  aria-label="Delete this saved session"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Your data, your call. No confirmation funnel, no retention window, no
          "are you sure?" three times. One button, and it's really gone (§9.5). */}
      <p className="history__danger">
        <button className="history__delete" onClick={onDeleteAccount}>
          Delete my account and all history
        </button>
      </p>
    </section>
  );
}
