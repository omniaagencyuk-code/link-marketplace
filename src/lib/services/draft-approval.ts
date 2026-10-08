import { getAdminScopedClient } from '@/lib/supabase/server';
import { websiteService } from './website-service';
import { sensitiveNicheSlugs, legacyAcceptanceFlags } from '@/lib/config/accepted-niches';
import { assumedNicheCosts, fillGeneralFromNiches, sellableNiches } from '@/lib/sourcing/review';
import { commercialTerms } from '@/lib/sourcing/commercial-terms';
import { pricingService } from './pricing-service';
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

  // Everything not explicitly refused. The policy table below keeps the
  // stated answer; this array is what the marketplace sells, and it is kept
  // in step with the five legacy booleans the same way it always was.
  const acceptedNow = sellableNiches(listing);
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

  /*
    Look the domain up again rather than trusting the match recorded when the
    email was read. Between extraction and approval the site may have arrived
    another way - a CSV import, a second reply about the same network, the
    duplicate sitting next to this one in the queue - and `websites.domain` is
    unique, so a stale "this is new" turns into a failed insert with nothing
    useful to say. Re-checking turns the second of two duplicates into an
    ordinary update, which is what it is.
  */
  const { data: existing } = await supabase
    .from('websites')
    .select('id')
    .eq('domain', options.domain)
    .maybeSingle();

  let websiteId = (existing as { id: string } | null)?.id ?? options.matchedWebsiteId;
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

  // -------------------------------------------------------- commercial terms
  /*
    Built through `commercialTerms`, which drops a field the column would
    refuse instead of letting it fail the statement.

    One row carries fifteen answers and five constrained columns. A banner
    price of zero or a `price_valid_until` the model wrote as "end of the
    year" used to fail the whole upsert - and the upsert that failed carried
    `cost_currency`, the unit for a cost written a few lines above. That is
    how 410 listings came to hold a figure with no money attached.
  */
  const terms = commercialTerms(listing);

  const { error: commercialsError } = await supabase.from('website_commercials').upsert(
    {
      website_id: websiteId,
      ...terms.row,
      source_email_id: options.emailId,
      last_quoted_at: new Date().toISOString(),
      updated_by: options.reviewer ?? null,
      ...(terms.dropped.length > 0
        ? {
            // Named in the row itself, so a dropped answer is visible to
            // whoever reads the terms rather than only to a log nobody opens.
            notes: [listing.notes, `Not recorded, unreadable: ${terms.dropped.join(', ')}.`]
              .filter(Boolean)
              .join(' '),
          }
        : {}),
    },
    { onConflict: 'website_id' },
  );

  if (commercialsError) {
    throw new Error(`Failed to record the commercial terms: ${commercialsError.message}`);
  }

  /*
    The costs, after the currency they are quoted in.

    Deliberately this way round: if the terms above cannot be written, this
    throws before any number is stored, and the draft stays pending for
    somebody to approve again. The other order stores a cost whose currency
    never arrived, which nothing downstream can use and nothing reports.
  */
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

  // ---------------------------------------------------------- close the draft
  await supabase
    .from('listing_drafts')
    .update({
      status: created ? 'approved' : 'merged',
      reviewed_by: options.reviewer ?? null,
      reviewed_at: new Date().toISOString(),
      proposed: listing as unknown as Record<string, unknown>,
    })
    .eq('id', draftId);

  /*
    Price it now that the costs are in.

    Scoped to this listing, so approving one draft does not push the whole
    marketplace through the engine. A failure here must not lose the
    approval: the listing and its costs are already written and correct, and
    a price can be recalculated at any time from the pricing screen.
  */
  try {
    await pricingService.apply([websiteId]);
  } catch (error) {
    console.error(`Could not price ${options.domain} after approval`, error);
  }

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
  extracted: ExtractedListing,
  reviewer?: string,
): Promise<void> {
  const supabase = getAdminScopedClient();

  /*
    A publisher who only quoted a sensitive rate still needs a general one.

    Otherwise the engine has no general cost, the ordinary guest post prices
    at zero, and zero does not read as "not priced yet" to a buyer - it reads
    as free. The cheapest quoted niche rate is the assumption, because a
    sensitive topic is what a publisher charges more for: their standard rate
    is at most the lowest of those.
  */
  const listing = fillGeneralFromNiches(extracted);

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
      .upsert(
        nicheCosts.map((row) => ({ ...row, assumed: false })),
        { onConflict: 'website_id,niche,link_type' },
      );
  }

  /*
    The topics nobody mentioned, priced at what this publisher charges for the
    topics they did mention.

    Read back first: a second reply that goes quiet about a niche must not
    downgrade a price the first one quoted. The upsert cannot express "only if
    it is not already real", so the check is a query - the rows are few and
    the alternative is losing a known cost to an assumption.
  */
  const assumed = assumedNicheCosts(listing);
  if (assumed.length > 0) {
    const { data: existing } = await supabase
      .from('website_niche_costs')
      .select('niche, link_type, assumed')
      .eq('website_id', websiteId)
      .eq('assumed', false);

    const quoted = new Set(
      ((existing ?? []) as { niche: string; link_type: string }[]).map(
        (row) => `${row.niche}:${row.link_type}`,
      ),
    );

    const rows = assumed
      .filter((entry) => !quoted.has(`${entry.niche}:${entry.linkType}`))
      .map((entry) => ({
        website_id: websiteId,
        niche: entry.niche,
        link_type: entry.linkType,
        cost_minor: toMinor(entry.cost),
        assumed: true,
        updated_by: reviewer ?? null,
      }));

    if (rows.length > 0) {
      await supabase
        .from('website_niche_costs')
        .upsert(rows, { onConflict: 'website_id,niche,link_type' });
    }
  }
}

export { applyGeneralPriceToNiches } from '@/lib/sourcing/review';
