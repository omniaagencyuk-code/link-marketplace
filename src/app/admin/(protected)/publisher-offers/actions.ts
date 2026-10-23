'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminSession } from '@/lib/auth/admin-access';
import {
  publisherSubmissionService,
  SUBMISSION_PAGE_SIZE,
} from '@/lib/services/publisher-submission-service';
import { isSubmissionStatus, type SubmissionStatus } from '@/lib/publishers/options';

/**
 * Reading and handling offers of a site.
 *
 * `requireAdminSession` first in both, not because the page is already
 * behind the proxy gate but because a server action has its own endpoint and
 * is callable without ever rendering that page. The pricing enquiries'
 * actions are guarded the same way and for the same reason.
 */

export async function publisherSubmissionPageAction(input: { status: string; page: number }) {
  await requireAdminSession();

  const status: SubmissionStatus | 'all' =
    input.status === 'all' || !isSubmissionStatus(input.status) ? 'all' : input.status;

  return publisherSubmissionService.page(
    status,
    Math.max(1, Math.floor(input.page) || 1),
    SUBMISSION_PAGE_SIZE,
  );
}

export async function setPublisherSubmissionStatusAction(id: string, status: string) {
  const session = await requireAdminSession();

  if (!isSubmissionStatus(status)) {
    return { error: 'That is not a status an offer can be in.' };
  }

  const updated = await publisherSubmissionService.setStatus(id, status, session.email);
  if (!updated) return { error: 'That submission no longer exists.' };

  revalidatePath('/admin/publisher-offers');
  return { ok: true as const };
}

export async function deletePublisherSubmissionAction(id: string) {
  await requireAdminSession();

  const removed = await publisherSubmissionService.remove(id);
  if (!removed) return { error: 'That submission has already gone.' };

  revalidatePath('/admin/publisher-offers');
  return { ok: true as const };
}
