import { segmentDefinition } from '@/lib/config/sales-segments';
import type { WebsiteListItem } from '@/lib/types/website';
import type { MatchedListing, SalesSegment } from '@/lib/types/sales';

/**
 * Which of our listings to put in front of a prospect.
 *
 * Pure: the inventory and a segment in, a handful of listings out. No
 * database, so the ranking can be checked against an inventory written for
 * the case being checked.
 *
 * The point of this module is that the email cites **real listings at real
 * prices**. Every entry it returns carries the website id, so a claim in an
 * email can be checked against the inventory rather than taken on trust - and
 * nothing downstream has to invent a number, which is the failure mode that
 * matters here. A prospect who is quoted £220 for a DR 61 site and finds £340
 * when they look has been given a reason not to come back, and we would have
 * done it to ourselves.
 *
 * ## What it refuses to return
 *
 * A listing that cannot carry their topic. An iGaming affiliate shown our
 * best travel blog has been shown nothing: they need a site that accepts
 * gambling, and `acceptedNiches` says which do. Showing them a site that will
 * refuse the content is worse than showing them fewer sites, because the
 * first reply is then a correction.
 *
 * A listing with no price. `headlinePriceMinor` of zero means nothing has
 * been priced yet, and "from £0" in an outbound email is not a selling point.
 */

export interface MatchOptions {
  /** How many to cite. Three is enough to show range; ten is a price list. */
  limit?: number;
  /**
   * Niches to require, overriding the segment's own. Used when a campaign is
   * aimed at something narrower than a whole segment.
   */
  niches?: string[];
}

export interface MatchResult {
  listings: MatchedListing[];
  /**
   * Why these, in a sentence, so the review queue can see the reasoning
   * without re-deriving it.
   */
  basis: string;
}

/**
 * Picks a spread rather than a top three.
 *
 * Sorting by domain rating alone returns our three most expensive sites,
 * which answers a question nobody asked. One strong, one mid, one affordable
 * shows that there is a range - and the range is the actual product.
 */
export function matchInventory(
  inventory: WebsiteListItem[],
  segment: SalesSegment,
  options: MatchOptions = {},
): MatchResult {
  const limit = Math.max(1, options.limit ?? 3);
  const wanted = options.niches ?? segmentDefinition(segment).niches;

  const eligible = inventory.filter((website) => canCarry(website, wanted));

  if (eligible.length === 0) {
    return {
      listings: [],
      basis: wanted.length
        ? `No priced, active listing accepts ${wanted.join(' or ')}.`
        : 'No priced, active listing is available.',
    };
  }

  const byStrength = [...eligible].sort(
    (a, b) => b.metrics.domainRating - a.metrics.domainRating ||
      b.metrics.organicTraffic - a.metrics.organicTraffic,
  );

  /*
    One from each band.

    `limit` bands across the eligible list, taking the strongest of each, so
    three picks from eighty listings are the best of the top third, the best of
    the middle and the best of the bottom - a spread, with the best of each
    band rather than the median of it.
  */
  const picked: WebsiteListItem[] = [];
  const bandSize = Math.max(1, Math.floor(byStrength.length / limit));

  for (let band = 0; band < limit && picked.length < limit; band += 1) {
    const candidate = byStrength[band * bandSize];
    if (candidate && !picked.includes(candidate)) picked.push(candidate);
  }

  // A short inventory does not divide into bands cleanly; fill from the top.
  for (const website of byStrength) {
    if (picked.length >= limit) break;
    if (!picked.includes(website)) picked.push(website);
  }

  return {
    listings: picked.map(toMatched),
    basis: wanted.length
      ? `${eligible.length} priced listings accept ${wanted.join(' or ')}; showing a spread by domain rating.`
      : `${eligible.length} priced listings; showing a spread by domain rating.`,
  };
}

/**
 * Can this listing carry that content?
 *
 * One predicate, used by both the picker and the summary, because they were
 * two copies of the same rule and only one of them needed to be wrong for an
 * email to quote a site that will refuse the work.
 *
 * ## The sensitive rule, which is the whole reason this is a function
 *
 * A listing marked `general` takes any ordinary topic. Gambling is not an
 * ordinary topic - `accepted-niches.ts` marks seven niches `sensitive`
 * precisely because a publisher who accepts anything has not thereby agreed to
 * carry them.
 *
 * So when the content is sensitive, the listing must accept **that sensitive
 * niche by name**. Not `general`, and not some other niche that happens to
 * also be on the wanted list: a gambling affiliate's wanted list may well
 * include `general` as a nice-to-have, and a DR 78 travel blog accepting
 * `general` would then match on it and be quoted to a casino. That is the
 * exact bug `verify:sales` was written to catch, and it caught it.
 */
function canCarry(website: WebsiteListItem, wanted: string[]): boolean {
  if (website.status !== 'active') return false;
  // Nothing has been priced yet, and "from £0" is not a selling point.
  if (website.headlinePriceMinor <= 0) return false;
  if (wanted.length === 0) return true;

  const accepted = website.rules.acceptedNiches ?? [];
  const sensitiveWanted = wanted.filter(isSensitive);

  if (sensitiveWanted.length > 0) {
    return sensitiveWanted.some((niche) => accepted.includes(niche));
  }

  if (accepted.includes('general')) return true;
  return wanted.some((niche) => accepted.includes(niche));
}

/** The seven marked `sensitive` in `accepted-niches.ts` - narrower than
 * `regulated`, for the reason AGENTS.md gives. */
function isSensitive(niche: string): boolean {
  return ['gambling', 'crypto', 'cbd', 'adult', 'forex', 'dating', 'loan'].includes(niche);
}

function toMatched(website: WebsiteListItem): MatchedListing {
  return {
    websiteId: website.id,
    domain: website.domain,
    domainRating: website.metrics.domainRating,
    organicTraffic: website.metrics.organicTraffic,
    priceMinor: website.headlinePriceMinor,
    niche: website.rules.acceptedNiches?.[0],
  };
}

/**
 * What our inventory looks like for this segment, in numbers.
 *
 * Used in an email as the honest alternative to a listing: "41 sites that
 * accept gambling, DR 30 to 74, from £180" is a true sentence anybody can
 * check, and it is a better opening than three domains they have to evaluate.
 * Returns nothing where there is nothing - a summary of an empty set is where
 * invented figures come from.
 */
export function inventorySummary(
  inventory: WebsiteListItem[],
  segment: SalesSegment,
  options: { niches?: string[] } = {},
): { count: number; minDr: number; maxDr: number; fromPriceMinor: number } | null {
  const wanted = options.niches ?? segmentDefinition(segment).niches;

  const eligible = inventory.filter((website) => canCarry(website, wanted));

  if (eligible.length === 0) return null;

  return {
    count: eligible.length,
    minDr: Math.min(...eligible.map((website) => website.metrics.domainRating)),
    maxDr: Math.max(...eligible.map((website) => website.metrics.domainRating)),
    fromPriceMinor: Math.min(...eligible.map((website) => website.headlinePriceMinor)),
  };
}
