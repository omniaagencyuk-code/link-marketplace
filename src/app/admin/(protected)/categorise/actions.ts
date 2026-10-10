'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminSession } from '@/lib/auth/admin-access';
import { categoryReadService } from '@/lib/services/category-read-service';

/**
 * The most sites one request may read.
 *
 * Eight at a time inside the service, so this is three waves - a few seconds
 * of fetching, comfortably inside a function's life. The browser sends more
 * than this as more requests, which is what keeps the progress bar moving
 * rather than leaving one long silence.
 */
const BATCH_LIMIT = 24;

/**
 * Reading one homepage, and applying what it found.
 *
 * Both behind `requireAdminSession`. The read spends money - a fetch to
 * somebody else's server and a model call - and the apply changes what
 * buyers see, so neither is reachable without an admin session.
 */

export async function readHomepageAction(websiteId: string) {
  await requireAdminSession();
  const read = await categoryReadService.read(String(websiteId));
  revalidatePath('/admin/categorise');
  return read;
}

/**
 * One request per batch, not per site.
 *
 * Twenty-five server actions in flight is twenty-five functions each holding
 * a fetch open; a batch is one, and the concurrency inside it is the
 * politeness limit rather than however many the browser felt like starting.
 */
export async function readHomepagesAction(websiteIds: string[]) {
  await requireAdminSession();
  const ids = (Array.isArray(websiteIds) ? websiteIds : []).map(String).slice(0, BATCH_LIMIT);
  const reads = await categoryReadService.readMany(ids);
  revalidatePath('/admin/categorise');
  return reads;
}

export async function applyCategoryAction(websiteId: string) {
  const admin = await requireAdminSession();
  const applied = await categoryReadService.apply(String(websiteId), admin.email);
  revalidatePath('/admin/categorise');
  return { applied };
}
