import { signToken, verifyToken } from './session-token';

/**
 * Signed customer session cookie.
 *
 * The marketplace inventory is only available to registered accounts, so the
 * customer session has to be verifiable on the server - a browser-only flag
 * would let anyone read the listings straight out of the page payload.
 *
 * Same construction as the admin session: an HMAC-signed payload, checked in
 * `proxy.ts` before a protected page renders and again inside the page, since
 * server actions and route handlers are reachable without rendering.
 */

export const CUSTOMER_SESSION_COOKIE = 'pp_session';

/** How long a sign-in lasts before the customer has to log in again. */
export const CUSTOMER_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export interface CustomerSession {
  /** Id of the account record. */
  sub: string;
  email: string;
  /** Unix milliseconds. */
  exp: number;
}

/**
 * The secret used to sign customer sessions.
 *
 * `AUTH_SESSION_SECRET` is the intended variable. It falls back to
 * `ADMIN_SESSION_SECRET` so an existing deployment keeps working without a new
 * variable, and to a fixed development value outside production so the app is
 * runnable straight from a clone. In production with neither variable set,
 * this returns undefined and sign-in fails closed with a clear message.
 */
export function customerSessionSecret(): string | undefined {
  const configured = process.env.AUTH_SESSION_SECRET ?? process.env.ADMIN_SESSION_SECRET;
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') return undefined;
  return 'development-only-customer-session-secret';
}

/** True when sign-in can actually issue a session. */
export function isCustomerAuthConfigured(): boolean {
  return Boolean(customerSessionSecret());
}

export async function createCustomerSessionToken(
  userId: string,
  email: string,
): Promise<string | null> {
  const session: CustomerSession = {
    sub: userId,
    email,
    exp: Date.now() + CUSTOMER_SESSION_TTL_SECONDS * 1000,
  };
  return signToken(session, customerSessionSecret(), 'customer');
}

export async function verifyCustomerSessionToken(
  token: string | undefined | null,
): Promise<CustomerSession | null> {
  const payload = await verifyToken(token, customerSessionSecret(), 'customer');
  if (!payload) return null;

  const { sub, email, exp } = payload;
  if (typeof sub !== 'string' || typeof email !== 'string' || typeof exp !== 'number') return null;
  if (exp < Date.now()) return null;

  return { sub, email, exp };
}
