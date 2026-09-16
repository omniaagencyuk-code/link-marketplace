/**
 * Stateless HMAC-signed session tokens.
 *
 * A token is `base64url(payload).base64url(signature)`. The payload is plain
 * JSON, so it is readable but not forgeable: only the server holds the secret
 * that produces a matching signature.
 *
 * Signing uses Web Crypto so this module works in any runtime, including the
 * proxy layer that runs before a page renders.
 *
 * Shared by the admin session and the customer session. Each caller supplies
 * its own secret and payload shape, and stamps an audience so that a token
 * minted for one can never be replayed as the other - see `SessionAudience`.
 */

/**
 * Who a token was issued for.
 *
 * Every payload carries one and every verifier demands its own, because the
 * two session types can end up signed with the same key: the customer secret
 * falls back to `ADMIN_SESSION_SECRET` when `AUTH_SESSION_SECRET` is unset.
 * Without this, a customer token - whose payload happens to satisfy the admin
 * verifier's shape check - could be pasted into the admin cookie and would
 * verify. Since mock sign-in accepts any address, that meant signing up as an
 * allowlisted admin address and walking straight into /admin.
 *
 * Separating the audiences makes that impossible whether or not the keys are
 * shared, which is the property worth having.
 */
export type SessionAudience = 'admin' | 'customer';

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
 * Sign a payload. Returns null when no secret is configured, so a
 * misconfigured deployment refuses to issue sessions rather than issuing
 * unprotected ones.
 */
export async function signToken(
  payload: object,
  secret: string | undefined,
  audience: SessionAudience,
): Promise<string | null> {
  if (!secret) return null;
  // Stamped here rather than by callers, so a new session type cannot forget.
  const encoded = toBase64Url(encoder.encode(JSON.stringify({ ...payload, aud: audience })));
  const key = await signingKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(encoded));
  return `${encoded}.${toBase64Url(new Uint8Array(signature))}`;
}

/**
 * Verify a token and return its payload, or null if the signature does not
 * match, the secret is missing, the token is malformed, or it was issued for
 * a different audience.
 *
 * Expiry is not checked here - callers own their own payload shape.
 */
export async function verifyToken(
  token: string | undefined | null,
  secret: string | undefined,
  audience: SessionAudience,
): Promise<Record<string, unknown> | null> {
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

    const decoded: unknown = JSON.parse(new TextDecoder().decode(fromBase64Url(payload)));
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) return null;

    // A valid signature is not enough: the token also has to have been issued
    // for this purpose. Tokens minted before audiences existed have no `aud`
    // and are refused, which signs everyone out once and is the safe way round.
    if ((decoded as Record<string, unknown>).aud !== audience) return null;

    return decoded as Record<string, unknown>;
  } catch {
    return null;
  }
}
