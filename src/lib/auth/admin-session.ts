import { signToken, verifyToken } from './session-token';

/**
 * Signed admin session cookie.
 *
 * A stateless HMAC-signed token: the payload carries the admin's email and an
 * expiry, and the signature proves the server issued it. Used by `proxy.ts`
 * to gate every /admin route and by the admin server actions to re-check the
 * caller, since server actions are reachable independently of page rendering.
 */

export const ADMIN_SESSION_COOKIE = 'pp_admin_session';

/** How long a sign-in lasts before the admin has to log in again. */
export const ADMIN_SESSION_TTL_SECONDS = 12 * 60 * 60;

export interface AdminSession {
  email: string;
  /** Unix milliseconds. */
  exp: number;
}

/**
 * Issue a token. Returns null when `ADMIN_SESSION_SECRET` is missing, so a
 * misconfigured deployment locks the admin area rather than opening it.
 */
export async function createAdminSessionToken(email: string): Promise<string | null> {
  const session: AdminSession = {
    email,
    exp: Date.now() + ADMIN_SESSION_TTL_SECONDS * 1000,
  };
  return signToken(session, process.env.ADMIN_SESSION_SECRET);
}

export async function verifyAdminSessionToken(
  token: string | undefined | null,
): Promise<AdminSession | null> {
  const payload = await verifyToken(token, process.env.ADMIN_SESSION_SECRET);
  if (!payload) return null;

  const { email, exp } = payload;
  if (typeof email !== 'string' || typeof exp !== 'number') return null;
  if (exp < Date.now()) return null;

  return { email, exp };
}
