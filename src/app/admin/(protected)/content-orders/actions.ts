'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminSession } from '@/lib/auth/admin-access';
import { contentService } from '@/lib/services';
import { sanitiseText } from '@/lib/import/normalise';
import { contentStatuses } from '@/lib/config/content';
import type { ContentOrderStatus } from '@/lib/types/content';

/**
 * Admin actions on content orders.
 *
 * Every action calls `requireAdminSession()` first: server actions have their
 * own endpoints, so the proxy gate on /admin does not cover them.
 */

const validStatuses = new Set(contentStatuses.map((status) => status.value));

function revalidate(itemId: string) {
  revalidatePath('/admin/content-orders');
  revalidatePath(`/admin/content-orders/${itemId}`);
  revalidatePath('/dashboard/content');
  revalidatePath(`/dashboard/content/${itemId}`);
}

export async function updateContentItemAction(formData: FormData) {
  await requireAdminSession();

  const itemId = String(formData.get('itemId') ?? '');
  if (!itemId) return;

  const status = String(formData.get('status') ?? '');
  const price = String(formData.get('price') ?? '').trim();
  const priceMinor = price ? Math.round(Number(price) * 100) : undefined;

  await contentService.updateItem(itemId, {
    ...(validStatuses.has(status as ContentOrderStatus)
      ? { status: status as ContentOrderStatus }
      : {}),
    ...(priceMinor !== undefined && Number.isFinite(priceMinor) && priceMinor >= 0
      ? { priceMinor }
      : {}),
    writerName: sanitiseText(String(formData.get('writerName') ?? ''), 120) || undefined,
    internalNotes: sanitiseText(String(formData.get('internalNotes') ?? ''), 4000) || undefined,
  });

  revalidate(itemId);
}

export async function replyToContentItemAction(formData: FormData) {
  const session = await requireAdminSession();

  const itemId = String(formData.get('itemId') ?? '');
  const body = sanitiseText(String(formData.get('body') ?? ''), 4000);
  if (!itemId || !body) return;

  await contentService.addMessage(itemId, {
    authorRole: 'team',
    authorName: session.email,
    body,
  });

  revalidate(itemId);
}

export async function deliverContentAction(formData: FormData) {
  await requireAdminSession();

  const itemId = String(formData.get('itemId') ?? '');
  if (!itemId) return;

  const kind = String(formData.get('kind') ?? 'draft') === 'final' ? 'final' : 'draft';
  const fileName = sanitiseText(String(formData.get('fileName') ?? ''), 200);
  const body = sanitiseText(String(formData.get('body') ?? ''), 200_000);
  if (!fileName && !body) return;

  await contentService.addDelivery(itemId, {
    kind,
    fileName: fileName || `${kind}-article.txt`,
    body: body || undefined,
  });

  revalidate(itemId);
}
