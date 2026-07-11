import { CONFIG } from "./config.js";

/**
 * OAuth 2.0 (authorization-code flow) for GitHub and Google — Phase 5 (§7.12).
 *
 * Hand-rolled on top of `fetch`, deliberately. The flow is ~60 lines and a
 * dependency here would be a dependency with our client secret in it. What we
 * DO get from doing it ourselves is the ability to state exactly what leaves the
 * process:
 *
 *   - We request the NARROWEST scopes that identify a user and nothing more.
 *     GitHub: `read:user` (profile only — no repos, no email scope, no writes).
 *     Google: `openid email profile`.
 *   - The client secret is sent only to the provider's token endpoint, over TLS,
 *     in a POST body. It is never in a URL, never logged, never sent to the browser.
 *   - We take from the provider only: a stable id, a display name, an email, an
 *     avatar URL. Everything else in the response is dropped on the floor.
 *   - The access token is used once, to read the profile, and then discarded.
 *     We never store it. ConfuseCode holds no credential that can act as the
 *     user on GitHub or Google — so a breach of our DB grants an attacker
 *     nothing on their accounts.
 *   - `state` is a CSPRNG nonce round-tripped through a signed, HttpOnly cookie
 *     and compared in constant time (see auth.ts). This is what stops an
 *     attacker from stitching their OAuth code onto your browser session.
 */

export type ProviderId = "github" | "google";

export function isProviderId(v: unknown): v is ProviderId {
  return v === "github" || v === "google";
}

/** The minimal identity we accept from any provider. Nothing else is kept. */
export interface OAuthProfile {
  providerId: string;
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
}

interface ProviderConfig {
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  clientId: string;
  clientSecret: string;
}

/**
 * Provider credentials come from the environment, never from source (§7.12).
 * A provider with no credentials configured is simply not offered in the UI —
 * you can ship with GitHub only, or Google only, and nothing breaks.
 */
function providerConfig(provider: ProviderId): ProviderConfig | null {
  if (provider === "github") {
    const clientId = process.env.GITHUB_CLIENT_ID ?? "";
    const clientSecret = process.env.GITHUB_CLIENT_SECRET ?? "";
    if (!clientId || !clientSecret) return null;
    return {
      authorizeUrl: "https://github.com/login/oauth/authorize",
      tokenUrl: "https://github.com/login/oauth/access_token",
      scope: "read:user", // profile only. Not repos. Not email. Not write.
      clientId,
      clientSecret,
    };
  }
  const clientId = process.env.GOOGLE_CLIENT_ID ?? "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? "";
  if (!clientId || !clientSecret) return null;
  return {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope: "openid email profile",
    clientId,
    clientSecret,
  };
}

/** Which providers are actually usable right now. Drives the login buttons. */
export function enabledProviders(): ProviderId[] {
  return (["github", "google"] as const).filter((p) => providerConfig(p) !== null);
}

/** The redirect URI must match the one registered with the provider, exactly. */
export function redirectUri(provider: ProviderId): string {
  return `${CONFIG.PUBLIC_ORIGIN}/api/auth/${provider}/callback`;
}

/** Step 1: where we send the user's browser to authenticate. */
export function authorizeUrl(provider: ProviderId, state: string): string | null {
  const cfg = providerConfig(provider);
  if (!cfg) return null;

  const url = new URL(cfg.authorizeUrl);
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("redirect_uri", redirectUri(provider));
  url.searchParams.set("scope", cfg.scope);
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  if (provider === "google") {
    // Never mint a refresh token: we don't want long-lived access to the
    // account, and a credential we don't hold is a credential we can't leak.
    url.searchParams.set("access_type", "online");
    url.searchParams.set("prompt", "select_account");
  }
  return url.toString();
}

/** Step 2: swap the one-time code for a short-lived access token. */
async function exchangeCode(
  provider: ProviderId,
  code: string,
): Promise<string | null> {
  const cfg = providerConfig(provider);
  if (!cfg) return null;

  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code,
      redirect_uri: redirectUri(provider),
      grant_type: "authorization_code", // required by Google, ignored by GitHub
    }),
  });
  if (!res.ok) return null;

  const data = (await res.json()) as { access_token?: unknown };
  return typeof data.access_token === "string" ? data.access_token : null;
}

/** Step 3: read the profile — the ONLY thing we ever take from the provider. */
async function fetchProfile(
  provider: ProviderId,
  accessToken: string,
): Promise<OAuthProfile | null> {
  if (provider === "github") {
    const res = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "confusecode",
      },
    });
    if (!res.ok) return null;
    const u = (await res.json()) as Record<string, unknown>;
    if (typeof u.id !== "number" && typeof u.id !== "string") return null;
    return {
      providerId: String(u.id),
      displayName: str(u.name) ?? str(u.login),
      // We do NOT request the `user:email` scope, so this is only present if the
      // user made it public. Absent is fine — email is optional in our schema.
      email: str(u.email),
      avatarUrl: str(u.avatar_url),
    };
  }

  const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const u = (await res.json()) as Record<string, unknown>;
  if (typeof u.sub !== "string") return null;
  return {
    providerId: u.sub,
    displayName: str(u.name),
    email: u.email_verified === true ? str(u.email) : null, // unverified ⇒ untrusted
    avatarUrl: str(u.picture),
  };
}

/** Steps 2+3 together: code in, identity out. Null on any failure (fail closed). */
export async function completeOAuth(
  provider: ProviderId,
  code: string,
): Promise<OAuthProfile | null> {
  const token = await exchangeCode(provider, code);
  if (!token) return null;
  return fetchProfile(provider, token);
}

/** Coerce an unknown JSON field to a trimmed string, or null. Bounded length. */
function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  return s.slice(0, 300); // a hostile/oversized provider field can't bloat a row
}
