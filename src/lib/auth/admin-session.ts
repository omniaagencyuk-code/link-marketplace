/**
 * Signed admin session cookie.
 *
 * A stateless HMAC-signed token: the payload carries the admin's email and an
 * expiry, and the signature proves the server issued it. Used by `proxy.ts`
 * to gate every /admin route and by the admin server actions to re-check the
 * caller, since server actions are reachable independently of page rendering.
 *
 * Signing uses Web Crypto so this module works in any runtime.
 */

export const ADMIN_SESSION_COOKIE = 'pp_admin_session';

/** How long a sign-in lasts before the admin has to log in again. */
export const ADMIN_SESSION_TTL_SECONDS = 12 * 60 * 60;

export interface AdminSession {
  email: string;
  /** Unix milliseconds. */
  exp: number;
}

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string) {
  const padded = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function signingKey(secret: string) {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

/**
 * Issue a token. Returns null when `ADMIN_SESSION_SECRET` is missing, so a
 * misconfigured deployment locks the admin area rather than opening it.
 */
export async function createAdminSessionToken(email: string): Promise<string | null> {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) return null;

  const session: AdminSession = {
    email,
    exp: Date.now() + ADMIN_SESSION_TTL_SECONDS * 1000,
  };
  const payload = toBase64Url(encoder.encode(JSON.stringify(session)));
  const key = await signingKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return `${payload}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function verifyAdminSessionToken(
  token: string | undefined | null,
): Promise<AdminSession | null> {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || !token) return null;

  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;

  try {
    const key = await signingKey(secret);
    // subtle.verify compares in constant time.
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      fromBase64Url(signature) as unknown as BufferSource,
      encoder.encode(payload),
    );
    if (!valid) return null;

    const session = JSON.parse(
      new TextDecoder().decode(fromBase64Url(payload)),
    ) as Partial<AdminSession>;

    if (typeof session.email !== 'string' || typeof session.exp !== 'number') return null;
    if (session.exp < Date.now()) return null;

    return { email: session.email, exp: session.exp };
  } catch {
    return null;
  }
}
