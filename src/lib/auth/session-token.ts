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
 * its own secret and payload shape.
 */

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
): Promise<string | null> {
  if (!secret) return null;
  const encoded = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const key = await signingKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(encoded));
  return `${encoded}.${toBase64Url(new Uint8Array(signature))}`;
}

/**
 * Verify a token and return its payload, or null if the signature does not
 * match, the secret is missing or the token is malformed.
 *
 * Expiry is not checked here - callers own their own payload shape.
 */
export async function verifyToken(
  token: string | undefined | null,
  secret: string | undefined,
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
    return decoded as Record<string, unknown>;
  } catch {
    return null;
  }
}
