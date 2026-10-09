import { cookies, draftMode } from 'next/headers';
import { signToken, verifyToken } from './session-token';

/**
 * A short-lived permission to look at unpublished changes.
 *
 * Deliberately not the admin session. That cookie is scoped to `/admin` on
 * purpose, so an admin token never travels with a request for a marketing
 * page - which is the right decision and not one to undo for a convenience.
 *
 * So previewing gets a cookie of its own. It is scoped to the whole site
 * because that is where the pages are, and in exchange it carries one
 * capability and almost no lifetime: it says "this browser may see drafts"
 * and nothing else. It cannot sign in, cannot write, and cannot be used to
 * reach the admin area.
 *
 * Thirty minutes, because a preview is something somebody looks at now.
 */

export const PREVIEW_COOKIE = 'pp_preview';

/** Long enough to read a page and change your mind. Not long enough to forget. */
export const PREVIEW_TTL_SECONDS = 30 * 60;

interface PreviewGrant {
  /** Who was shown it, so the log says who rather than that somebody did. */
  email: string;
  exp: number;
}

/**
 * Signed with the admin secret and a different purpose string, so an admin
 * session token cannot be replayed as a preview grant and a preview grant
 * cannot be replayed as a session. `signToken` binds the purpose into the
 * signature.
 */
export async function createPreviewToken(email: string): Promise<string | null> {
  const grant: PreviewGrant = { email, exp: Date.now() + PREVIEW_TTL_SECONDS * 1000 };
  return signToken(grant, process.env.ADMIN_SESSION_SECRET, 'preview');
}

export async function verifyPreviewToken(
  token: string | undefined | null,
): Promise<PreviewGrant | null> {
  const payload = await verifyToken(token, process.env.ADMIN_SESSION_SECRET, 'preview');
  if (!payload) return null;

  const { email, exp } = payload;
  if (typeof email !== 'string' || typeof exp !== 'number') return null;
  if (exp < Date.now()) return null;

  return { email, exp };
}

/** Whether this request may see unpublished changes. */
export async function hasPreviewGrant(): Promise<boolean> {
  const store = await cookies();
  return (await verifyPreviewToken(store.get(PREVIEW_COOKIE)?.value)) !== null;
}

/**
 * Issue the grant. Called only from an action that has already checked.
 *
 * Draft mode is turned on alongside it, and the two have to move together:
 * the grant is the authorisation - who, and for how long - and draft mode
 * is what makes the framework stop serving this browser the prerendered
 * copy. A grant without draft mode would authorise somebody to see drafts
 * and then hand them the cached page anyway.
 */
export async function grantPreview(email: string): Promise<void> {
  const token = await createPreviewToken(email);
  if (!token) return;

  (await draftMode()).enable();

  const store = await cookies();
  store.set(PREVIEW_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: PREVIEW_TTL_SECONDS,
  });
}

export async function revokePreview(): Promise<void> {
  // Draft mode first. If this threw half way, the safe half to have done is
  // the one that puts the browser back on the cached, published page.
  (await draftMode()).disable();

  const store = await cookies();
  store.delete({ name: PREVIEW_COOKIE, path: '/' });
}
