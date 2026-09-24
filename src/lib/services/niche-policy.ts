import { getAdminScopedClient } from '@/lib/supabase/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import type { Stance } from '@/lib/sourcing/schema';

/**
 * What a publisher actually told us about a topic.
 *
 * Distinct from what the listing sells. A site sells every topic it did not
 * refuse, which means most of them are sold on an assumption; this is the
 * record of which ones were confirmed and which were nobody asking.
 *
 * Admin only. There is no customer-facing use for this and there should not
 * be one: a marketplace that captions its own inventory with doubt sells
 * less of it without making anyone's decision better.
 */

/** Keyed "websiteId:niche". A missing key means no record either way. */
export async function nicheStances(websiteIds: string[]): Promise<Map<string, Stance>> {
  const stances = new Map<string, Stance>();
  if (!isSupabaseEnabled() || websiteIds.length === 0) return stances;

  const supabase = getAdminScopedClient();
  const { data, error } = await supabase
    .from('website_niche_policy')
    .select('website_id, niche, accepted')
    .in('website_id', websiteIds);

  // A missing table means 0019 has not been run. That is not worth failing an
  // order page over: no records simply means no warnings.
  if (error) return stances;

  for (const row of (data ?? []) as { website_id: string; niche: string; accepted: Stance }[]) {
    stances.set(`${row.website_id}:${row.niche}`, row.accepted);
  }
  return stances;
}
