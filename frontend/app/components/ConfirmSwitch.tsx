"use client";

/**
 * The mid-session switch confirmation (§6.5, step 3).
 * "Start new session? Current progress on [File A] will be cleared."
 *
 * A destructive action made explicit and confirmable — the design principle
 * behind §6.5. Cancel keeps the current session untouched; confirm starts fresh.
 */
export function ConfirmSwitch({
  currentName,
  nextName,
  onCancel,
  onConfirm,
}: {
  currentName: string;
  nextName: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="switch-title"
      onClick={onCancel}
    >
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 id="switch-title" className="modal__title">
          Start a new session?
        </h2>
        <p className="modal__body">
          You&rsquo;re working on <strong>{currentName}</strong>. Opening{" "}
          <strong>{nextName}</strong> will clear your current progress and start
          fresh. This can&rsquo;t be undone.
        </p>
        <div className="modal__actions">
          <button className="btn-ghost" onClick={onCancel}>
            Keep working on {currentName}
          </button>
          <button className="btn-analyze" onClick={onConfirm}>
            Start fresh with {nextName}
          </button>
        </div>
      </div>
    </div>
  );
}
