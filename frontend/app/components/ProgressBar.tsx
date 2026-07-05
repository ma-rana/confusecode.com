import type { Progress } from "../session";

/**
 * Live progress across the session (§6.4): "4 of 6 resolved".
 * Purely reflects in-browser work-log state.
 */
export function ProgressBar({ progress }: { progress: Progress }) {
  const { total, done, allClear } = progress;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <div className="progress" aria-label="Session progress">
      <div className="progress__row">
        <span className="progress__count">
          {done} of {total} resolved
        </span>
        {allClear && <span className="progress__clear">all clear</span>}
      </div>
      <div
        className="progress__track"
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={total}
      >
        <div
          className={`progress__fill ${allClear ? "progress__fill--clear" : ""}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
