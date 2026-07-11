"use client";

import type { Me, ProviderId } from "../account";

/**
 * The account strip (Phase 5).
 *
 * Deliberately quiet. The product is the reviewer, not the account — so this is
 * one line of small type in the corner, never a modal, never a wall, never a
 * "sign in to continue". Signed out, the tool is fully usable and the strip is a
 * single unobtrusive link. That's the point: the account is an offer, not a toll.
 */

const PROVIDER_LABELS: Record<ProviderId, string> = {
  github: "GitHub",
  google: "Google",
};

export function AccountBar({
  me,
  providers,
  onLogout,
  onToggleOptIn,
  onOpenHistory,
  historyOpen,
}: {
  me: Me | null;
  providers: ProviderId[];
  onLogout: () => void;
  onToggleOptIn: (next: boolean) => void;
  onOpenHistory: () => void;
  historyOpen: boolean;
}) {
  // Accounts aren't configured on this deployment — render nothing at all rather
  // than a dead button.
  if (providers.length === 0 && !me) return null;

  if (!me) {
    return (
      <div className="account">
        <span className="account__pitch">
          Optional: sign in to remember which mistakes you keep making.
        </span>
        {providers.map((p) => (
          // A plain link, not a fetch — OAuth is a browser redirect, and the
          // backend sets the state cookie on the way out.
          <a key={p} className="account__link" href={`/api/auth/${p}/start`}>
            Sign in with {PROVIDER_LABELS[p]}
          </a>
        ))}
      </div>
    );
  }

  return (
    <div className="account">
      {me.avatarUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="account__avatar" src={me.avatarUrl} alt="" width={20} height={20} />
      )}
      <span className="account__name">{me.displayName ?? "Signed in"}</span>

      <button
        className="account__link"
        onClick={onOpenHistory}
        aria-pressed={historyOpen}
      >
        {historyOpen ? "Hide history" : "My history"}
      </button>

      {/* The consent switch. Signing in does NOT imply consent to be remembered —
          history stays off until this is on, and the label says exactly what
          gets kept. */}
      <label className="account__optin">
        <input
          type="checkbox"
          checked={me.historyOptIn}
          onChange={(e) => onToggleOptIn(e.target.checked)}
        />
        <span>
          Remember my progress
          <span className="account__optin-note">
            {" "}
            — rules and concepts only, never your code
          </span>
        </span>
      </label>

      <button className="account__link" onClick={onLogout}>
        Sign out
      </button>
    </div>
  );
}
