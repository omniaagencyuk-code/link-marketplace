import { draftMode } from 'next/headers';
import { hasPreviewGrant } from '@/lib/auth/preview-session';

/**
 * Whether this request is an administrator looking at a preview.
 *
 * Two conditions, and the second is the one that matters: the request is in
 * draft mode, and the browser is carrying a preview grant. Both are set by
 * the same admin action, and neither can be forged - draft mode's cookie is
 * signed by the framework, and the grant is signed with the admin secret
 * under its own purpose string.
 *
 * The grant is its own short-lived cookie rather than the admin session,
 * because that one is scoped to `/admin` so an admin token never travels
 * with a request for a marketing page. Widening it would have been the easy
 * fix and the wrong one.
 *
 * It is defence in depth rather than the defence. Behind this, drafts live
 * in `section_drafts`, which has one policy and it is `is_admin()` - so an
 * unpublished change could not reach a visitor even if this returned true
 * for everybody. This is the door; that is the wall.
 *
 * It was a column on `page_sections` for one commit, and that is not a wall:
 * the policy on that table lets anyone read the rows of a published page,
 * and row level security is row level. Anyone with the publishable key could
 * ask for the column by name.
 *
 * ## Why draft mode, and why the order of these two lines matters
 *
 * This used to read `?preview=1` from the URL. Reading a search parameter
 * makes a page dynamic, and these are the marketing pages - so the
 * homepage, every CMS page and every niche landing page was rendered from
 * scratch on every request, for a query string that is absent on all but a
 * handful of them a week.
 *
 * Draft mode exists for exactly this. The framework prerenders the page
 * with draft mode off, and serves the prerendered copy to everybody who is
 * not carrying its cookie; a request that is carrying one bypasses the
 * cache and renders fresh. So the check costs nothing on the pages where
 * nobody is previewing.
 *
 * The grant is read *after* the draft-mode check and only if it passed,
 * because reading a cookie is itself a request read. On the common path
 * this function touches nothing request-specific at all, which is what
 * keeps the page prerenderable.
 */
export async function isPreview(): Promise<boolean> {
  const { isEnabled } = await draftMode();
  if (!isEnabled) return false;

  return hasPreviewGrant();
}
