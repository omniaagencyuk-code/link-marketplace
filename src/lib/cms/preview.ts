import { hasPreviewGrant } from '@/lib/auth/preview-session';

/**
 * Whether this request is an administrator looking at a preview.
 *
 * Two conditions, and the second is the one that matters: the URL asked, and
 * the browser is carrying a preview grant. A visitor who types `?preview=1`
 * gets the live page, because they have no grant and cannot mint one.
 *
 * The grant is its own short-lived cookie rather than the admin session,
 * because that one is scoped to `/admin` so an admin token never travels
 * with a request for a marketing page. Widening it would have been the easy
 * fix and the wrong one.
 *
 * It is defence in depth rather than the defence. Behind this, the public
 * read names its columns and `draft` is not among them, so an unpublished
 * change could not reach a visitor even if this function returned true for
 * everybody. This is the door; that is the wall.
 *
 * One helper rather than the same three lines in each route, so a new page
 * cannot get the check subtly wrong.
 */
export async function isPreview(
  searchParams: Promise<Record<string, string | string[] | undefined>> | undefined,
): Promise<boolean> {
  if (!searchParams) return false;

  const params = await searchParams;
  const asked = params.preview;
  if (asked !== '1' && asked !== 'true') return false;

  return hasPreviewGrant();
}
