import { sensitiveNicheSlugs } from '@/lib/config/accepted-niches';
import { normaliseDomain } from '@/lib/import/normalise';
import type { ExtractedListing } from './schema';

/**
 * The judgements made about an extraction, with nothing else attached.
 *
 * Deliberately free of any database or API import: these are the rules that
 * decide what a reviewer is shown and what a bulk action may touch, and they
 * are worth being able to test on their own, without a key or a connection.
 */

/**
 * Does this look like a domain at all?
 *
 * `normaliseDomain` is permissive on purpose - it serves the CSV importer,
 * where a human has already said "this column is domains", so "not a domain"
 * comes back as "not a domain". Here the text came from a model reading free
 * prose, and "Our other sites" must not become a listing. The check belongs
 * at this boundary rather than in the shared helper, which the importer
 * relies on being forgiving.
 */
function looksLikeDomain(value: string): boolean {
  return /^(?=.{4,253}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,24}$/.test(
    value,
  );
}

/** A domain from the model, or null when it is not one. */
function toDomain(raw: string): string | null {
  const normalised = normaliseDomain(raw);
  return normalised && looksLikeDomain(normalised) ? normalised : null;
}

export interface ExpandedDraft {
  domain: string;
  listing: ExtractedListing;
  /** The domain whose terms these are, when they were carried from another. */
  inheritedFrom?: string;
}

/**
 * One listing per domain, from a reply that answered for a network.
 *
 * The model states shared terms once and names the domains they cover; this
 * turns that into the rows a reviewer actually works through. Doing it here
 * rather than asking the model to repeat itself keeps the output small, the
 * copies identical, and the expansion inspectable.
 *
 * A domain that has its own entry always wins. "All ten take gambling except
 * lochside" arrives as a network listing plus a lochside listing, and
 * lochside must not then be overwritten by the network's terms - which is
 * exactly what would happen if these were merged in the order they arrived.
 */
export function expandListings(listings: ExtractedListing[]): ExpandedDraft[] {
  const byDomain = new Map<string, ExpandedDraft>();

  // Explicit entries first, so an exception cannot be clobbered by the
  // network it is an exception to.
  for (const listing of listings) {
    const domain = toDomain(listing.domain);
    if (!domain) continue;
    // The network list is dropped from every draft: the expansion has already
    // happened, and a draft that still carried it would claim to speak for
    // domains that now have drafts of their own.
    byDomain.set(domain, { domain, listing: { ...listing, domain, also_applies_to: [] } });
  }

  for (const listing of listings) {
    const source = toDomain(listing.domain);
    for (const raw of listing.also_applies_to) {
      const domain = toDomain(raw);
      if (!domain || byDomain.has(domain)) continue;
      byDomain.set(domain, {
        domain,
        // The same terms, carried across. `also_applies_to` is cleared so a
        // draft never claims to speak for domains other than its own.
        listing: { ...listing, domain, also_applies_to: [] },
        inheritedFrom: source ?? undefined,
      });
    }
  }

  return [...byDomain.values()];
}

/**
 * Reviewer prompts. Not field data - things a human has to decide.
 *
 * `single-price-confirm-niches` is the one the brief asks for: the model is
 * forbidden from spreading a lone price across the sensitive topics, so the
 * draft arrives with them all unknown and somebody has to say.
 */
export function flagsFor(listing: ExtractedListing): string[] {
  const flags: string[] = [];

  const everyNicheUnknown = sensitiveNicheSlugs.every((slug) => {
    const terms = listing.niches[slug];
    return !terms || (terms.accepted === 'unknown' && terms.guest_post_cost == null);
  });

  if (listing.guest_post_cost != null && everyNicheUnknown) {
    flags.push('single-price-confirm-niches');
  }
  if (listing.relationship) flags.push('different-site-offered');
  if (listing.price_valid_until || listing.future_price_notes) flags.push('price-changes-later');
  if (!listing.contact_email) flags.push('no-contact-email');

  return flags;
}

/**
 * The niches a listing is sellable for.
 *
 * Everything the publisher did not explicitly refuse - so an email that never
 * mentions gambling produces a listing that accepts gambling. That is a
 * deliberate commercial choice: most publishers who take regulated content
 * never say so unprompted, and the cost of asking one extra question is lower
 * than the cost of a site sitting invisible in every filter that matters.
 *
 * It is applied here, at approval, and not in extraction. The draft keeps
 * recording what the email actually said, so "they told us yes" and "nobody
 * asked" stay distinguishable - which is the first thing anyone will want if
 * a publisher ever turns an order down.
 */
export function sellableNiches(listing: ExtractedListing): string[] {
  return sensitiveNicheSlugs.filter((slug) => listing.niches[slug]?.accepted !== 'no');
}

/** Topics nobody mentioned, which will be sold as accepted anyway. */
export function assumedNiches(listing: ExtractedListing): string[] {
  return sensitiveNicheSlugs.filter((slug) => listing.niches[slug]?.accepted === 'unknown');
}

export function countLowConfidence(listing: ExtractedListing): number {
  return listing.confidence.filter((entry) => entry.level === 'low').length;
}

/**
 * Spread the general price across every sensitive niche.
 *
 * The button behind a single-price draft. A reviewer's decision made
 * explicit - and it never overrides an explicit refusal, because a publisher
 * who said "no gambling" has not been talked round by a button.
 */
export function applyGeneralPriceToNiches(listing: ExtractedListing): ExtractedListing {
  const niches = { ...listing.niches };

  for (const slug of sensitiveNicheSlugs) {
    const terms = niches[slug];
    if (!terms || terms.accepted === 'no') continue;
    niches[slug] = {
      accepted: 'yes',
      guest_post_cost: terms.guest_post_cost ?? listing.guest_post_cost,
      link_insertion_cost: terms.link_insertion_cost ?? listing.link_insertion_cost,
    };
  }

  return { ...listing, niches };
}
