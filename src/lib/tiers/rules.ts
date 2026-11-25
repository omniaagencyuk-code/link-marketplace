import { serialise, toWebsiteQuery } from '@/lib/marketplace/filters';
import type { MarketplaceFilters } from '@/lib/marketplace/filters';
import { emptyFilters } from '@/lib/marketplace/filters';
import type { LinkTier } from '@/lib/config/link-tiers';
import type { WebsiteQuery } from '@/lib/types';

/**
 * What a domain rating tier costs, and whether it is worth offering.
 *
 * Pure: a tier in, a query and a link out. The figures themselves come from
 * the inventory, because a tier is a question about stock rather than a
 * product with a price.
 */

/**
 * The fewest listings a tier may be published on.
 *
 * A tier advertising a price we can fill twice is a row that disappoints
 * whoever clicks it, and the marketplace behind it would show them almost
 * nothing. The same judgement `MIN_LISTINGS_FOR_A_PAGE` makes about a niche
 * too thin to have a page.
 */
export const MIN_SITES_FOR_A_TIER = 10;

/** The filters a tier stands for - also what its link carries. */
export function tierFilters(tier: LinkTier): MarketplaceFilters {
  return { ...emptyFilters, drMin: tier.drMin };
}

/**
 * The read behind one tier's row.
 *
 * One listing and a count, which is everything the row prints. Sorted by
 * price ascending and capped at a single row, so the answer is the cheapest
 * listing at this rating rather than a page of them to pick through - the
 * mistake that put a statement timeout on /guest-posts was a page reading
 * the whole inventory to describe part of it.
 *
 * `price.min` is forced to one minor unit, which is how "buyable" is said in
 * this query language: the price filter counts only services that are
 * `available`, so a floor of 1 drops both the unpriced listing and the one
 * whose every service is paused. It is load bearing rather than a
 * restatement of the default - `marketplace_search` reads
 * `((p_price_min is null and p_price_max is null) or pl.price_in_window)`,
 * so a query naming neither bound skips the price test altogether and
 * returns listings with nothing to sell, while the in-memory engine asks
 * `prices.some(...)` over an empty array and drops them.
 */
export function tierQuery(tier: LinkTier): WebsiteQuery {
  const query = toWebsiteQuery(tierFilters(tier), TIER_SORT, 1, 1);

  return {
    ...query,
    price: { min: Math.max(1, query.price?.min ?? 0), max: query.price?.max },
  };
}

/**
 * Cheapest first, and the same sort the link carries.
 *
 * This is the whole of the pricing rule. `price-asc` orders by
 * `headlinePriceMinor` - the service a marketplace row actually displays -
 * so the figure this page prints as "from" is literally the first row the
 * buyer lands on when they follow it. Any other basis, however defensible on
 * its own, would let the page and its own destination quote different
 * numbers, and the buyer would be reading the page while looking at the
 * marketplace.
 */
export const TIER_SORT = 'price-asc' as const;

/** The marketplace, filtered to this tier and sorted the way it was priced. */
export function tierHref(tier: LinkTier): string {
  const query = serialise(tierFilters(tier), TIER_SORT, 1, 25, 'table');

  return query ? `/marketplace?${query}` : '/marketplace';
}

/** Whether there is enough stock at this rating to quote a price on. */
export function isOffered(total: number): boolean {
  return total >= MIN_SITES_FOR_A_TIER;
}

/** e.g. "DR30+". The label is derived, never typed beside the number. */
export function tierLabel(tier: LinkTier): string {
  return `DR${tier.drMin}+`;
}
