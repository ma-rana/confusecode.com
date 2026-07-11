import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { CONFIG } from "./config.js";
import { getUserBySessionToken, type UserRow } from "./db-queries.js";

/**
 * Session + cookie layer (Phase 5, §7.12).
 *
 * THE RULES, and why:
 *
 *  1. The cookie carries an OPAQUE RANDOM TOKEN, nothing else. No user id, no
 *     email, no JWT claims. A stolen cookie tells an attacker nothing about the
 *     user, and there is no signature to forge — the token either matches a row
 *     in auth_sessions or it doesn't.
 *
 *  2. The DATABASE STORES ONLY A SHA-256 HASH of that token. If the DB leaks,
 *     the hashes cannot be replayed as cookies. (This mirrors password hashing,
 *     except there is no password — OAuth only. Fast SHA-256 is correct here:
 *     the token is 256 bits of CSPRNG entropy, so there is nothing to brute-force.)
 *
 *  3. Cookies are HttpOnly (JS cannot read them → XSS can't exfiltrate the
 *     session), SameSite=Lax (a cross-site POST won't carry the cookie → CSRF is
 *     blocked at the browser), and Secure in production (never sent over HTTP).
 *
 *  4. Sessions expire twice: an ABSOLUTE lifetime (30d, set at login, never
 *     extended) and an IDLE timeout (14d since last use). Both are enforced in
 *     SQL, not in the cookie, so revocation is real — deleting the row logs the
 *     user out immediately, everywhere.
 */

export const SESSION_COOKIE = "cc_session";
export const OAUTH_STATE_COOKIE = "cc_oauth";

/** Base cookie options shared by every cookie we set. */
function baseCookie() {
  return {
    httpOnly: true, // JS can never read it — XSS cannot steal the session
    secure: CONFIG.COOKIE_SECURE, // HTTPS-only in production
    sameSite: "lax" as const, // browser-level CSRF defence
    path: "/",
  };
}

/** A fresh session token: 32 bytes of CSPRNG entropy, URL-safe. */
export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** What we store in the DB. The raw token never touches disk. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Constant-time compare for the OAuth state value (avoids a timing oracle). */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function absoluteExpiry(): Date {
  return new Date(Date.now() + CONFIG.SESSION_ABSOLUTE_DAYS * 86_400_000);
}

export function setSessionCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(SESSION_COOKIE, token, {
    ...baseCookie(),
    maxAge: CONFIG.SESSION_ABSOLUTE_DAYS * 86_400,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, baseCookie());
}

/** The short-lived, SIGNED cookie that carries the OAuth `state` (CSRF nonce). */
export function setOAuthStateCookie(reply: FastifyReply, value: string): void {
  reply.setCookie(OAUTH_STATE_COOKIE, value, {
    ...baseCookie(),
    signed: true, // tamper-evident: the client can't forge a state
    maxAge: Math.floor(CONFIG.OAUTH_STATE_TTL_MS / 1000),
  });
}

export function clearOAuthStateCookie(reply: FastifyReply): void {
  reply.clearCookie(OAUTH_STATE_COOKIE, baseCookie());
}

/** Read + verify the signed OAuth state cookie. Null if absent or tampered. */
export function readOAuthStateCookie(req: FastifyRequest): string | null {
  const raw = req.cookies[OAUTH_STATE_COOKIE];
  if (!raw) return null;
  const unsigned = req.unsignCookie(raw);
  return unsigned.valid && unsigned.value ? unsigned.value : null;
}

/**
 * Resolve the current user from the session cookie, or null.
 * Touches last_used_at as a side effect (that's what keeps a session alive).
 */
export async function currentUser(req: FastifyRequest): Promise<UserRow | null> {
  const token = req.cookies[SESSION_COOKIE];
  if (!token) return null;
  return getUserBySessionToken(hashToken(token), CONFIG.SESSION_IDLE_DAYS);
}

/**
 * Fastify preHandler: 401 unless a valid session exists. On success the user is
 * attached to the request. Every history/account route sits behind this — there
 * is no route that reads another user's data by id, so there is nothing to
 * enumerate (IDOR is structurally impossible, not merely checked).
 */
export async function requireUser(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const user = await currentUser(req);
  if (!user) {
    await reply.code(401).send({ error: "Not signed in." });
    return;
  }
  req.user = user;
}

/**
 * Defence-in-depth CSRF check for state-changing requests. SameSite=Lax already
 * stops the browser sending our cookie on a cross-site POST; this rejects the
 * request server-side too, so we don't depend on one mechanism alone.
 */
export async function requireSameOrigin(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (req.method === "GET" || req.method === "HEAD") return;
  const origin = req.headers.origin;
  // Same-origin fetches from some browsers omit Origin; a cross-site one never does.
  if (!origin) return;
  if (origin !== CONFIG.ALLOWED_ORIGIN && origin !== CONFIG.PUBLIC_ORIGIN) {
    await reply.code(403).send({ error: "Cross-origin request rejected." });
  }
}

// Make `req.user` a typed, first-class property.
declare module "fastify" {
  interface FastifyRequest {
    user?: UserRow;
  }
}
