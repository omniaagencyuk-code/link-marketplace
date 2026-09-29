'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminSession } from '@/lib/auth/admin-access';
import { majesticService } from '@/lib/services/majestic-service';
import type { MajesticReading } from '@/lib/majestic/parse';
import type { NicheSlug } from '@/lib/types';

/**
 * Applying a Majestic export, behind an admin session.
 *
 * The file is parsed in the browser - the same place the website importer
 * parses one - so what arrives here is already typed readings rather than a
 * CSV. That keeps a sixty-column file off the wire and means this only has
 * to be trusted about what it writes, not about what it can read.
 */
export async function applyMajesticAction(readings: MajesticReading[], unusable: string[]) {
  await requireAdminSession();

  const result = await majesticService.apply(readings, unusable);
  revalidatePath('/admin/majestic');
  revalidatePath('/admin/websites');
  // Trust flow and the topics are on the public cards.
  revalidatePath('/marketplace');
  return result;
}

export async function acceptSuggestionsAction(
  accepted: { websiteId: string; niche: NicheSlug }[],
) {
  await requireAdminSession();
  if (accepted.length === 0) return { changed: 0 };

  const niches = Object.fromEntries(
    accepted.map((entry) => [entry.websiteId, entry.niche]),
  ) as Record<string, NicheSlug>;

  const result = await majesticService.acceptSuggestions(
    accepted.map((entry) => entry.websiteId),
    niches,
  );

  revalidatePath('/admin/majestic');
  revalidatePath('/admin/websites');
  revalidatePath('/marketplace');
  return result;
}
