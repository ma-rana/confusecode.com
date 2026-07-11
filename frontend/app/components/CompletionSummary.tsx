import type { Summary } from "../session";

/**
 * The completion summary shown on "Finish now" (§6.3).
 * A completion marker only — nothing is stored server-side. The user copies
 * their clean file out of the editor if they want it. This is the emotional
 * payoff of the start → struggle → understand → finish arc.
 */
export function CompletionSummary({
  summary,
  onKeepGoing,
  savedNote = "",
}: {
  summary: Summary;
  onKeepGoing: () => void;
  /**
   * Set only when the session's SUMMARY was written to the user's history (they
   * were signed in and had opted in). The code itself is never part of that —
   * see the note below, which changes wording but never its promise.
   */
  savedNote?: string;
}) {
  const { total, understood, fixed, revisions, concepts, allClear } = summary;

  return (
    <section className="summary" aria-label="Session summary">
      <p className="summary__eyebrow">Session complete</p>
      <h2 className="summary__headline">
        {allClear
          ? "You cleared every issue you set out to."
          : understood + fixed > 0
            ? "You worked through this — here's what you did."
            : "Session ended."}
      </h2>

      <div className="summary__stats">
        <div className="summary__stat">
          <span className="summary__num">{total}</span>
          <span className="summary__label">issues surfaced</span>
        </div>
        <div className="summary__stat">
          <span className="summary__num">{fixed}</span>
          <span className="summary__label">fixed in the editor</span>
        </div>
        <div className="summary__stat">
          <span className="summary__num">{understood}</span>
          <span className="summary__label">marked understood</span>
        </div>
        <div className="summary__stat">
          <span className="summary__num">{revisions}</span>
          <span className="summary__label">
            {revisions === 1 ? "revision" : "revisions"}
          </span>
        </div>
      </div>

      {concepts.length > 0 && (
        <div className="summary__concepts">
          <span className="summary__concepts-label">
            Concepts you touched
          </span>
          <div className="summary__chips">
            {concepts.map((concept) => (
              <span key={concept} className="chip">
                {concept}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* The promise is identical either way. Signed out, nothing at all was
         written down. Signed in and opted in, the RULES you met were written
         down — and your code still never left the browser. */}
      <p className="summary__note">
        {savedNote ? (
          <>
            {savedNote} Your code stayed in your browser — copy it out of the
            editor if you want to keep it.
          </>
        ) : (
          <>
            Nothing here was saved — your code stayed in your browser. Copy it
            out of the editor if you want to keep it.
          </>
        )}
      </p>

      <button className="btn-analyze" onClick={onKeepGoing}>
        Keep working on this file
      </button>
    </section>
  );
}
