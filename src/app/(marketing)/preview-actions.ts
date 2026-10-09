'use server';

import { redirect } from 'next/navigation';
import { revokePreview } from '@/lib/auth/preview-session';
import { safeReturnPath } from '@/lib/cms/return-path';

/**
 * Leave preview, from the public side of the site.
 *
 * Deliberately not `stopPreviewingAction`, which is the admin editor's
 * version and calls `requireAdminSession()` first. That session cookie is
 * scoped to `/admin`, so it is not sent with a form posted from a marketing
 * page - and more to the point, the person who most needs this button is the
 * one whose grant lapsed half an hour ago, who may well have signed out of
 * the admin area since.
 *
 * Requiring nothing costs nothing. All this does is delete two of the
 * caller's own cookies; the worst a forged request achieves is to stop
 * showing somebody drafts, which is the safe direction. Nothing is read,
 * nothing is written, and no draft becomes visible to anybody.
 */
export async function exitPreviewAction(formData: FormData): Promise<void> {
  await revokePreview();
  redirect(safeReturnPath(formData.get('path')));
}
