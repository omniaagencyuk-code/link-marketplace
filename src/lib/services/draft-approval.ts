import { getAdminScopedClient } from '@/lib/supabase/server';
import { websiteService } from './website-service';
import { sensitiveNicheSlugs, legacyAcceptanceFlags } from '@/lib/config/accepted-niches';
import type { ExtractedListing } from '@/lib/sourcing/schema';
import type { Website } from '@/lib/types';

/**
 * Turning an approved draft into a listing.
 *
 * The only path from extracted data to the marketplace, and it runs only when
 * a human presses Approve. Nothing here is called by extraction.
 *
 * Two things it deliberately does not do:
 *
 * It does not set a sell price. The draft holds what the publisher charges
 * us; what we charge is a separate decision that is not part of this feature.
 * A new listing is therefore created as a draft with its services priced at
 * zero and unavailable, which is the existing hidden state - it cannot appear
 * in the marketplace, and `pricedServices()` already filters it out.
 *
 * It does not overwrite with silence. A field the email did not mention
 * arrives as null and is left alone, so approving a reply about gambling
 * rates cannot blank a word count somebody typed in by hand.
 */

/** Publisher currency, whole units, to the minor units the columns hold. */
function toMinor(amount: number | null): number | null {
  return amount == null ? null : Math.round(amount * 100);
}

/** Only sets a key when the model actually answered. */
function defined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

export interface ApprovalResult {
  websiteId: string;
  created: boolean;
  domain: string;
}

export async function approveDraft(
  draftId: string,
  listing: ExtractedListing,
  options: { domain: string; matchedWebsiteId: string | null; emailId: string; reviewer?: string },
): Promise<ApprovalResult> {
  const supabase = getAdminScopedClient();

  // ------------------------------------------------------ the listing itself
  const patch: Partial<Website> = {};
  const rules: Partial<Website['rules']> = {};

  if (defined(listing.language)) patch.language = listing.language as Website['language'];
  if (defined(listing.min_word_count)) rules.minWordCount = listing.min_word_count;
  if (defined(listing.max_word_count)) rules.maxWordCount = listing.max_word_count;
  if (defined(listing.max_links)) rules.maxLinks = listing.max_links;

  // 'unknown' means leave the listing as it is. The tri-state lives on the
  // draft, where "not stated" is meaningful; the listing keeps the two-state
  // column the marketplace already displays.
  if (listing.dofollow === 'yes') rules.linkAttribute = 'dofollow';
  if (listing.dofollow === 'no') rules.linkAttribute = 'nofollow';

  if (listing.sponsored_tag === 'yes') rules.sponsoredTag = 'always';
  if (listing.sponsored_tag === 'no') rules.sponsoredTag = 'never';
  if (listing.sponsored_tag === 'depends') rules.sponsoredTag = 'on-request';

  // The niches the publisher said yes to, kept in step with the policy table
  // the same way the five legacy booleans are kept in step with this array.
  const acceptedNow = sensitiveNicheSlugs.filter((slug) => listing.niches[slug]?.accepted === 'yes');
  if (acceptedNow.length > 0) {
    rules.acceptedNiches = acceptedNow;
    Object.assign(rules, legacyAcceptanceFlags(acceptedNow));
  }

  if (Object.keys(rules).length > 0) patch.rules = rules as Website['rules'];

  if (defined(listing.contact_email) || defined(listing.contact_name) || defined(listing.contact_notes)) {
    patch.contact = {
      email: listing.contact_email ?? undefined,
      name: listing.contact_name ?? undefined,
      notes: listing.contact_notes ?? undefined,
    };
  }

  let websiteId = options.matchedWebsiteId;
  const created = !websiteId;

  if (websiteId) {
    await websiteService.update(websiteId, patch);
  } else {
    const listingCreated = await websiteService.create({
      ...patch,
      domain: options.domain,
      // Unpublished until somebody sets a sell price. This is the existing
      // hidden state, not a new one.
      status: 'draft',
    });
    websiteId = listingCreated.id;
  }

  // Columns the website repository does not know about, written directly so
  // the repository stays untouched and the feature stays removable.
  const columns: Record<string, unknown> = {};
  if (defined(listing.dofollow_expires_after_months)) {
    columns.dofollow_expires_after_months = listing.dofollow_expires_after_months;
  }
  if (listing.permanence !== 'unknown') columns.permanence = listing.permanence;
  if (defined(listing.min_live_months)) columns.min_live_months = listing.min_live_months;
  if (listing.homepage_placement !== 'unknown') {
    columns.homepage_placement = listing.homepage_placement === 'yes';
  }
  if (defined(listing.topic_restriction)) columns.topic_restriction = listing.topic_restriction;
  if (Object.keys(columns).length > 0) {
    await supabase.from('websites').update(columns).eq('id', websiteId);
  }

  // ------------------------------------------------------------ what we pay
  await writeCosts(websiteId, listing, options.reviewer);

  // ------------------------------------------------------ per-niche stances
  const policy = sensitiveNicheSlugs
    .map((slug) => ({ slug, terms: listing.niches[slug] }))
    .filter((entry) => entry.terms)
    .map((entry) => ({
      website_id: websiteId,
      niche: entry.slug,
      accepted: entry.terms!.accepted,
      link_insertion_offered:
        entry.terms!.link_insertion_cost != null
          ? 'yes'
          : listing.link_insertion_offered === 'no'
            ? 'no'
            : 'unknown',
      updated_by: options.reviewer ?? null,
    }));

  if (policy.length > 0) {
    await supabase.from('website_niche_policy').upsert(policy, { onConflict: 'website_id,niche' });
  }

  // -------------------------------------------------------- commercial terms
  await supabase.from('website_commercials').upsert(
    {
      website_id: websiteId,
      ...(defined(listing.currency) ? { cost_currency: listing.currency.toUpperCase().slice(0, 3) } : {}),
      ...(defined(listing.homepage_link_cost) ? { homepage_link_cost_minor: toMinor(listing.homepage_link_cost) } : {}),
      ...(defined(listing.homepage_link_period) ? { homepage_link_period: listing.homepage_link_period } : {}),
      ...(defined(listing.banner_cost) ? { banner_cost_minor: toMinor(listing.banner_cost) } : {}),
      ...(defined(listing.banner_period) ? { banner_period: listing.banner_period } : {}),
      ...(defined(listing.prices_exclude_vat) ? { prices_exclude_vat: listing.prices_exclude_vat } : {}),
      ...(defined(listing.vat_notes) ? { vat_notes: listing.vat_notes } : {}),
      ...(listing.payment_methods.length > 0 ? { payment_methods: listing.payment_methods } : {}),
      ...(listing.payment_timing !== 'unknown' ? { payment_timing: listing.payment_timing } : {}),
      ...(defined(listing.minimum_order) ? { minimum_order: listing.minimum_order } : {}),
      ...(defined(listing.bulk_discount_notes) ? { bulk_discount_notes: listing.bulk_discount_notes } : {}),
      ...(defined(listing.price_valid_until) ? { price_valid_until: listing.price_valid_until } : {}),
      ...(defined(listing.future_price_notes) ? { future_price_notes: listing.future_price_notes } : {}),
      ...(defined(listing.notes) ? { notes: listing.notes } : {}),
      source_email_id: options.emailId,
      last_quoted_at: new Date().toISOString(),
      updated_by: options.reviewer ?? null,
    },
    { onConflict: 'website_id' },
  );

  // ---------------------------------------------------------- close the draft
  await supabase
    .from('listing_drafts')
    .update({
      status: created ? 'approved' : 'merged',
      reviewed_by: options.reviewer ?? null,
      reviewed_at: new Date().toISOString(),
      values: listing as unknown as Record<string, unknown>,
    })
    .eq('id', draftId);

  return { websiteId, created, domain: options.domain };
}

/**
 * Cost prices.
 *
 * A service row has to exist for a cost to hang off, and on a new listing it
 * is created priced at zero and unavailable - "we know what it costs us, we
 * have not decided what to charge". An existing listing's sell price is never
 * touched here.
 */
async function writeCosts(
  websiteId: string,
  listing: ExtractedListing,
  reviewer?: string,
): Promise<void> {
  const supabase = getAdminScopedClient();

  const wanted: { type: 'guest-post' | 'niche-edit'; cost: number | null; publisherWritten: number | null }[] = [
    {
      type: 'guest-post',
      cost: toMinor(listing.guest_post_cost),
      publisherWritten: toMinor(listing.guest_post_cost_written_by_publisher),
    },
    { type: 'niche-edit', cost: toMinor(listing.link_insertion_cost), publisherWritten: null },
  ];

  const { data: existing } = await supabase
    .from('services')
    .select('id, type')
    .eq('website_id', websiteId);
  const byType = new Map(
    ((existing ?? []) as { id: string; type: string }[]).map((row) => [row.type, row.id]),
  );

  for (const entry of wanted) {
    if (entry.cost == null && entry.publisherWritten == null) continue;

    let serviceId = byType.get(entry.type);
    if (!serviceId) {
      const { data: inserted } = await supabase
        .from('services')
        .insert({
          website_id: websiteId,
          type: entry.type,
          price_minor: 0,
          available: false,
          ...(listing.turnaround_min_days ? { turnaround_min_days: listing.turnaround_min_days } : {}),
          ...(listing.turnaround_max_days ? { turnaround_max_days: listing.turnaround_max_days } : {}),
        })
        .select('id')
        .single();
      if (!inserted) continue;
      serviceId = String((inserted as { id: string }).id);
    }

    await supabase.from('service_costs').upsert(
      {
        service_id: serviceId,
        ...(entry.cost == null ? {} : { cost_price_minor: entry.cost }),
        ...(entry.publisherWritten == null ? {} : { cost_publisher_written_minor: entry.publisherWritten }),
        updated_by: reviewer ?? null,
      },
      { onConflict: 'service_id' },
    );
  }

  // Per-niche buy prices, which is what a sensitive-topic rate produces.
  const nicheCosts = sensitiveNicheSlugs.flatMap((slug) => {
    const terms = listing.niches[slug];
    if (!terms) return [];
    const rows: Record<string, unknown>[] = [];
    if (terms.guest_post_cost != null) {
      rows.push({
        website_id: websiteId,
        niche: slug,
        link_type: 'guest-post',
        cost_minor: toMinor(terms.guest_post_cost),
        updated_by: reviewer ?? null,
      });
    }
    if (terms.link_insertion_cost != null) {
      rows.push({
        website_id: websiteId,
        niche: slug,
        link_type: 'niche-edit',
        cost_minor: toMinor(terms.link_insertion_cost),
        updated_by: reviewer ?? null,
      });
    }
    return rows;
  });

  if (nicheCosts.length > 0) {
    await supabase
      .from('website_niche_costs')
      .upsert(nicheCosts, { onConflict: 'website_id,niche,link_type' });
  }
}

export { applyGeneralPriceToNiches } from '@/lib/sourcing/review';
