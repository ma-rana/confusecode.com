import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { CONFIG } from "./config.js";
import {
  SESSION_COOKIE,
  absoluteExpiry,
  clearOAuthStateCookie,
  clearSessionCookie,
  currentUser,
  hashToken,
  newSessionToken,
  readOAuthStateCookie,
  requireSameOrigin,
  requireUser,
  safeEqual,
  setOAuthStateCookie,
  setSessionCookie,
} from "./auth.js";
import {
  authorizeUrl,
  completeOAuth,
  enabledProviders,
  isProviderId,
} from "./oauth.js";
import {
  createAuthSession,
  deleteAuthSession,
  deleteUser,
  deleteAllAuthSessions,
  setHistoryOptIn,
  upsertUserByProvider,
} from "./db-queries.js";

/**
 * Authentication routes (Phase 5).
 *
 *   GET  /api/auth/providers          which logins are configured
 *   GET  /api/auth/:provider/start    → redirect to GitHub/Google
 *   GET  /api/auth/:provider/callback ← provider returns here; session is minted
 *   POST /api/auth/logout             kill this session
 *   GET  /api/me                      who am I (null if signed out)
 *   POST /api/me/history-opt-in       turn history saving on/off (§9.5)
 *   DELETE /api/me                    delete the account and everything in it
 *
 * Signing in is OPTIONAL and changes nothing about how code is analyzed. The
 * anonymous path stays byte-for-byte what it was: paste code, get cards, store
 * nothing. An account only ever adds a memory of your *progress*.
 */
export function registerAuthRoutes(app: FastifyInstance): void {
  // Which providers have credentials configured. The UI renders only these.
  app.get("/api/auth/providers", async () => ({
    providers: enabledProviders(),
  }));

  // ---- Step 1: kick off the OAuth dance -------------------------------------
  app.get<{ Params: { provider: string } }>(
    "/api/auth/:provider/start",
    async (req, reply) => {
      const { provider } = req.params;
      if (!isProviderId(provider)) {
        return reply.code(404).send({ error: "Unknown provider." });
      }

      // A CSPRNG nonce, held in a signed HttpOnly cookie and echoed back by the
      // provider. If they don't match on return, the callback is not ours.
      const state = randomBytes(24).toString("base64url");
      const url = authorizeUrl(provider, state);
      if (!url) {
        return reply.code(503).send({ error: "This login isn't configured." });
      }

      setOAuthStateCookie(reply, `${provider}:${state}`);
      return reply.redirect(url);
    },
  );

  // ---- Step 2: the provider sends the user back here -------------------------
  app.get<{
    Params: { provider: string };
    Querystring: { code?: string; state?: string; error?: string };
  }>("/api/auth/:provider/callback", async (req, reply) => {
    const { provider } = req.params;
    const { code, state, error } = req.query;

    // The state cookie is single-use no matter what happens next.
    const expected = readOAuthStateCookie(req);
    clearOAuthStateCookie(reply);

    const fail = (why: string) => {
      // Never leak *why* to the URL bar — the user gets a generic banner, the
      // detail stays in our logs (§7.10).
      req.log.warn({ event: "oauth_failed", provider, why }, "oauth failed");
      return reply.redirect(`${CONFIG.PUBLIC_ORIGIN}/?auth=failed`);
    };

    if (!isProviderId(provider)) return fail("unknown provider");
    if (error) return fail(`provider error: ${error}`); // e.g. user clicked Cancel
    if (!code || !state) return fail("missing code/state");
    if (!expected) return fail("missing state cookie");
    if (!safeEqual(expected, `${provider}:${state}`)) return fail("state mismatch");

    const profile = await completeOAuth(provider, code);
    if (!profile) return fail("code exchange or profile fetch failed");

    // Identity in hand. Upsert the user, mint a session, set the cookie.
    const user = await upsertUserByProvider({
      provider,
      providerId: profile.providerId,
      displayName: profile.displayName,
      email: profile.email,
      avatarUrl: profile.avatarUrl,
    });

    const token = newSessionToken();
    await createAuthSession({
      userId: user.id,
      tokenHash: hashToken(token), // the raw token is only ever in the cookie
      expiresAt: absoluteExpiry(),
      userAgent: (req.headers["user-agent"] ?? "").slice(0, 256) || null,
    });

    setSessionCookie(reply, token);
    req.log.info({ event: "login", provider }, "user signed in"); // event, not person
    return reply.redirect(`${CONFIG.PUBLIC_ORIGIN}/?auth=ok`);
  });

  // ---- Session lifecycle -----------------------------------------------------
  app.post("/api/auth/logout", { preHandler: requireSameOrigin }, async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    // Delete the row, not just the cookie — logout must be real server-side.
    if (token) await deleteAuthSession(hashToken(token));
    clearSessionCookie(reply);
    return reply.send({ ok: true });
  });

  /** Who am I? Returns null (not 401) when signed out — this is a UI probe. */
  app.get("/api/me", async (req, reply) => {
    const user = await currentUser(req);
    if (!user) return reply.send({ user: null });
    return reply.send({
      user: {
        id: user.id,
        provider: user.provider,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
        historyOptIn: user.history_opt_in,
      },
    });
  });

  /**
   * The consent switch (§9.5). History is OFF until the user turns it on, and
   * turning it off stops all future saving. Signing in does NOT imply consent to
   * be remembered — those are two separate choices, deliberately.
   */
  app.post<{ Body: { optIn?: unknown } }>(
    "/api/me/history-opt-in",
    { preHandler: [requireSameOrigin, requireUser] },
    async (req, reply) => {
      const optIn = req.body?.optIn;
      if (typeof optIn !== "boolean") {
        return reply.code(400).send({ error: "optIn must be a boolean." });
      }
      await setHistoryOptIn(req.user!.id, optIn);
      return reply.send({ ok: true, historyOptIn: optIn });
    },
  );

  /**
   * Delete the account and everything attached to it (§9.5). The FK cascades
   * take out every session and event; no soft-delete, no tombstone, no "we keep
   * it for 30 days in case you change your mind". Gone means gone.
   */
  app.delete(
    "/api/me",
    { preHandler: [requireSameOrigin, requireUser] },
    async (req, reply) => {
      const userId = req.user!.id;
      await deleteAllAuthSessions(userId);
      await deleteUser(userId); // CASCADE: auth_sessions, learning_sessions, learning_events
      clearSessionCookie(reply);
      req.log.info({ event: "account_deleted" }, "account deleted");
      return reply.send({ ok: true });
    },
  );
}
