import { sensitiveNicheSlugs } from '@/lib/config/accepted-niches';
import { normaliseDomain } from '@/lib/import/normalise';
import { usableCurrency } from '@/lib/websites/cost-currency';
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
/** Whether the reply quoted any money at all, in any of the places it can. */
export function hasAnyPrice(listing: ExtractedListing): boolean {
  if (listing.guest_post_cost != null) return true;
  if (listing.guest_post_cost_written_by_publisher != null) return true;
  if (listing.link_insertion_cost != null) return true;
  if (listing.homepage_link_cost != null) return true;
  if (listing.banner_cost != null) return true;
  return sensitiveNicheSlugs.some((slug) => {
    const terms = listing.niches[slug];
    return terms?.guest_post_cost != null || terms?.link_insertion_cost != null;
  });
}

export function flagsFor(listing: ExtractedListing): string[] {
  const flags: string[] = [];

  const everyNicheUnknown = sensitiveNicheSlugs.every((slug) => {
    const terms = listing.niches[slug];
    return !terms || (terms.accepted === 'unknown' && terms.guest_post_cost == null);
  });

  if (listing.guest_post_cost != null && everyNicheUnknown) {
    flags.push('single-price-confirm-niches');
  }
  /*
    A price with no currency is a number that means nothing. It used to be
    stored anyway and read as pounds everywhere downstream, which is how a
    publisher quoting dollars came to be shown as quoting pounds. The reply
    rarely omits it outright - more often the symbol was the only clue and
    the model would not invent a code from it, which is the right call and
    exactly when a human should be asked.

    `usableCurrency`, not a truthiness test. The two disagree on everything
    that is present and not a code - 'US$', 'Euro', '€', and the mojibake a
    rate-card CSV produces - and the disagreement had a direction. The flag
    said the currency was there, so the draft was eligible for bulk
    approval; `commercialTerms` then dropped the column, because it has
    always used `usableCurrency`, and the cost was written without it. The
    same number with no unit the flag exists to prevent, reached by the one
    route that was supposed to be safe.
  */
  if (hasAnyPrice(listing) && !usableCurrency(listing.currency)) {
    flags.push('price-without-currency');
  }
  /*
    `relationship` is not a signal that a different site was offered.

    It was flagged as one, on any non-empty value, and against a real backlog
    that fired on 7,304 drafts out of 7,307 - keeping the whole queue out of
    every bulk path and telling reviewers "They offered a different site:
    owner". What the model actually writes there is how the publisher relates
    to the domain:

      Site from the publisher's own rate card (network of ~2,000 sites)  2,708
      owner                                                             1,020
      Agency/reseller offering guest posts and link insertions             381
      Site in the Sun Media Brands network                                 242

    That is useful - reseller versus owner is worth knowing - and none of it
    means the draft is about the wrong domain. The rule it was built on says
    the opposite: "If the publisher declines for the site we asked about but
    offers another, THE OFFERED SITE IS THE LISTING." The draft's domain is
    already the offered one, so there was never a mismatch to catch.

    No flag replaces it. A field that is populated on 99.96% of rows carries
    no information as a flag, whatever it is called.
  */
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

/**
 * The rate this publisher charges for sensitive content, if they named one.
 *
 * Publishers who take regulated topics almost always price them above the
 * standard rate - this reply quoted 550 EUR generally and 700 EUR for
 * "casino / CBD / poker / gambling". The highest of the rates they actually
 * quoted is the defensive reading: we are guessing, and guessing low is the
 * guess that loses money silently.
 *
 * Null when they quoted no sensitive rate at all. A lone general price is not
 * a sensitive-topic price and nothing here will turn it into one.
 */
export function sensitiveRate(
  listing: ExtractedListing,
  linkType: 'guest-post' | 'niche-edit',
): number | null {
  const quoted = sensitiveNicheSlugs
    .map((slug) => {
      const terms = listing.niches[slug];
      if (!terms || terms.accepted === 'no') return null;
      return linkType === 'guest-post' ? terms.guest_post_cost : terms.link_insertion_cost;
    })
    .filter((cost): cost is number => typeof cost === 'number' && cost > 0);

  return quoted.length > 0 ? Math.max(...quoted) : null;
}

export interface AssumedNicheCost {
  niche: string;
  linkType: 'guest-post' | 'niche-edit';
  cost: number;
}

/**
 * What an assumed niche should cost us.
 *
 * `sellableNiches` already sells a topic nobody mentioned. The cost of that
 * topic used to fall through to the general rate, so a listing quoting 550
 * generally and 700 for sensitive content sold crypto priced off 550 - and if
 * the publisher then charged their sensitive rate, the margin was gone and
 * nothing said so, because every figure downstream agreed the cost was 550.
 *
 * Assuming acceptance and assuming the cheapest rate are two assumptions. This
 * keeps the first and drops the second. Only the niches nobody mentioned are
 * touched: a niche with its own quoted price already has a real cost, and one
 * the publisher refused is not sold at all.
 */
export function assumedNicheCosts(listing: ExtractedListing): AssumedNicheCost[] {
  const linkTypes: AssumedNicheCost['linkType'][] = ['guest-post', 'niche-edit'];
  const rates = new Map(linkTypes.map((linkType) => [linkType, sensitiveRate(listing, linkType)]));

  return sensitiveNicheSlugs.flatMap((niche) => {
    const terms = listing.niches[niche];
    if (!terms || terms.accepted !== 'unknown') return [];

    return linkTypes.flatMap((linkType) => {
      const rate = rates.get(linkType);
      if (rate == null) return [];
      // A price they actually quoted for this niche wins over the assumption,
      // even when it is lower than their other sensitive rates.
      const quoted = linkType === 'guest-post' ? terms.guest_post_cost : terms.link_insertion_cost;
      if (quoted != null) return [];
      return [{ niche, linkType, cost: rate }];
    });
  });
}

/**
 * A general price, when the publisher only quoted sensitive ones.
 *
 * Some replies never state a standard rate. They answer the question that was
 * asked - "what for gambling?" - and quote one number, and the listing ends
 * up with a price for gambling and nothing for an ordinary guest post. The
 * engine has no general cost to work from, so the general placement prices at
 * zero, and a zero price is not "unpriced" to a buyer: it is free, and it is
 * the one pricing mistake somebody acts on immediately.
 *
 * The cheapest of the quoted niche rates is the assumption, because a
 * sensitive topic is what a publisher charges *more* for. Their standard rate
 * is at most the lowest of those, so using it cannot invent a price below
 * anything they actually said - it can only be conservative.
 *
 * Nothing is invented from nothing: a reply that quotes no prices at all
 * comes back unchanged.
 */
export function fillGeneralFromNiches(listing: ExtractedListing): ExtractedListing {
  const cheapest = (pick: (terms: NonNullable<ExtractedListing['niches'][string]>) => number | null) => {
    const quoted = sensitiveNicheSlugs
      .map((slug) => {
        const terms = listing.niches[slug];
        if (!terms || terms.accepted === 'no') return null;
        return pick(terms);
      })
      .filter((cost): cost is number => typeof cost === 'number' && cost > 0);

    return quoted.length > 0 ? Math.min(...quoted) : null;
  };

  const guestPost = listing.guest_post_cost ?? cheapest((terms) => terms.guest_post_cost);
  const linkInsertion = listing.link_insertion_cost ?? cheapest((terms) => terms.link_insertion_cost);

  if (guestPost === listing.guest_post_cost && linkInsertion === listing.link_insertion_cost) {
    return listing;
  }

  return { ...listing, guest_post_cost: guestPost, link_insertion_cost: linkInsertion };
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
