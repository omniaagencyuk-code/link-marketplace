'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminSession } from '@/lib/auth/admin-access';
import { enquiryService, ENQUIRY_PAGE_SIZE } from '@/lib/services/enquiry-service';
import { isEnquiryStatus, type EnquiryStatus } from '@/lib/enquiries/options';

/**
 * Reading and handling pricing enquiries.
 *
 * `requireAdminSession` first in both, not because the page is already
 * behind the proxy gate but because a server action has its own endpoint and
 * is callable without ever rendering that page. The Sales Centre's actions
 * are guarded the same way and for the same reason.
 */

export async function enquiryPageAction(input: {
  status: string;
  page: number;
}) {
  await requireAdminSession();

  const status: EnquiryStatus | 'all' =
    input.status === 'all' || !isEnquiryStatus(input.status)
      ? 'all'
      : input.status;

  return enquiryService.page(status, Math.max(1, Math.floor(input.page) || 1), ENQUIRY_PAGE_SIZE);
}

export async function setEnquiryStatusAction(id: string, status: string) {
  const session = await requireAdminSession();

  if (!isEnquiryStatus(status)) {
    return { error: 'That is not a status an enquiry can be in.' };
  }

  const updated = await enquiryService.setStatus(id, status, session.email);
  if (!updated) return { error: 'That enquiry no longer exists.' };

  // The sidebar's "new" figure and this page both read the same rows.
  revalidatePath('/admin/enquiries');
  return { ok: true as const };
}
