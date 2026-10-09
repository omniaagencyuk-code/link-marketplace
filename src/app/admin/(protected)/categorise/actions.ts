'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminSession } from '@/lib/auth/admin-access';
import { categoryReadService } from '@/lib/services/category-read-service';

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

export async function applyCategoryAction(websiteId: string) {
  const admin = await requireAdminSession();
  const applied = await categoryReadService.apply(String(websiteId), admin.email);
  revalidatePath('/admin/categorise');
  return { applied };
}
