import { serialise, toWebsiteQuery } from '@/lib/marketplace/filters';
import type { MarketplaceFilters } from '@/lib/marketplace/filters';
import { servicePriority } from '@/lib/services/query-engine';
import type { LinkTypeSlug, Service, SortKey, WebsiteListItem, WebsiteQuery } from '@/lib/types';

/**
 * What a link building package is, and what one costs.
 *
 * Pure: listings in, lines and a total out. No database, no network, no
 * pricing table - so the arithmetic can be checked against the cases that
 * matter, and those cases are money.
 *
 * ## A package is a saved search and a count
 *
 * Not a product with a price. The marketplace already knows how to find
 * "ten sites, DR 40-60, in business, sorted by rating"; a package is that
 * question written down, given a name, and run. So there is no second filter
 * vocabulary here and no second idea of what a listing costs - `filters` is
 * the marketplace's own `MarketplaceFilters`, and the same struct serialises
 * back into a marketplace URL for the "browse all of them" link. One
 * definition, two uses, nothing to keep in step.
 *
 * ## There is deliberately no price field
 *
 * `LinkPackage` cannot hold a price, which is the point. A package quoting a
 * figure typed into a config file would be quoting one the checkout does not
 * charge the moment a publisher repriced or paused - the failure
 * `verify:content-writing` exists to catch on /content-writing, where "the
 * page cannot quote a figure the checkout does not charge". It would also
 * bake in a currency, and `brand.ts` settled that: publishers quote in
 * dollars and we charge in dollars, so that no conversion sits between the
 * number we are given and the number we take.
 *
 * Every figure a package page shows is computed from the listings the basket
 * would actually hold. A type with nowhere to put a stale price cannot carry
 * one - the same move as 0082 making "import twice, get one" a unique index
 * rather than a check the caller remembers.
 */
export interface LinkPackage {
  slug: string;
  name: string;
  /** One sentence, shown on the card. Words only - never a figure. */
  blurb: string;
  /** What the package buys, in the marketplace's own filter shape. */
  filters: MarketplaceFilters;
  /** How many placements go in the basket. */
  count: number;
  /**
   * Which `count` of the matches, and therefore what the package costs.
   *
   * One ordering decides both the basket and the price. If the page priced
   * the cheapest ten and the basket took the strongest ten, the page would
   * quote a figure the checkout does not charge.
   */
  sort: SortKey;
}

/**
 * One placement in a package.
 *
 * The *service*, not just a price. `priceBasket` re-prices a basket from the
 * database by `(websiteId, serviceType)`, so a package that chose only a
 * number would be handing checkout a line it had to guess the service for -
 * and a guess that landed on a different service is a page quoting one
 * figure and a card charged another.
 */
export interface PackageLine {
  item: WebsiteListItem;
  /** Exactly what the basket orders, so checkout prices the same thing. */
  service: Service;
}

/**
 * The search behind a package.
 *
 * `price.min` is forced to at least one minor unit, which is how "buyable"
 * is said in this query language: the price filter counts only services that
 * are `available`, so a floor of 1 excludes both the unpriced listing and
 * the one whose every service is paused. Without it a package could fill a
 * basket with rows checkout would reject - `priceBasket` drops a line whose
 * listing has been paused or repriced rather than charging the old price,
 * and a package that routinely handed it such lines would deliver short.
 *
 * The floor is doing real work rather than restating a default, and it is
 * the SQL that makes it so. `marketplace_search` reads
 *
 *   and ((p_price_min is null and p_price_max is null) or pl.price_in_window)
 *
 * so a query with neither bound skips the price test altogether and a
 * listing with nothing buyable comes back - while `matchesQuery` on the
 * in-memory side asks `prices.some(...)` over an empty array and drops it.
 * The two paths disagree exactly where a package would notice. Naming a
 * minimum puts both of them on the same side of it.
 *
 * A package that sets its own `priceMin` keeps it; the floor only ever
 * raises zero.
 */
export function packageQuery(pkg: LinkPackage): WebsiteQuery {
  const query = toWebsiteQuery(pkg.filters, pkg.sort, 1, pkg.count);

  return {
    ...query,
    price: { min: Math.max(1, query.price?.min ?? 0), max: query.price?.max },
  };
}

/**
 * The service a package would buy on one listing: the cheapest it is allowed
 * to take.
 *
 * Not the listing's `lowestPriceMinor`, and the difference is the bug this
 * exists to avoid. That figure is the minimum across `pricedServices`, which
 * spans every link type and falls back to paused services when a listing has
 * no available ones - right for a "from" price on a listing card, wrong here.
 * A guest-post package priced off it would quote a publisher's cheaper niche
 * edit and then charge the guest post.
 *
 * So: available services only, narrowed to the package's link types where it
 * names any. That is the same pair of conditions the marketplace's own price
 * filter applies, which is what makes the filter and the total agree about
 * which listings are in and what they cost.
 *
 * Ties go to `servicePriority`, the order list views already present services
 * in. Two services at one price would otherwise be separated by whatever
 * order the rows arrived in, and a basket that differs between two reads of
 * the same package is one the page cannot describe.
 *
 * Null, never zero, when nothing qualifies. A listing we cannot sell has no
 * price; it does not have a price of nothing.
 */
export function lineServiceFor(
  item: WebsiteListItem,
  linkTypes: readonly LinkTypeSlug[],
): Service | null {
  const buyable = item.services.filter(
    (service) =>
      service.available && (linkTypes.length === 0 || linkTypes.includes(service.type)),
  );

  if (buyable.length === 0) return null;

  return [...buyable].sort(
    (a, b) =>
      a.priceMinor - b.priceMinor ||
      servicePriority.indexOf(a.type) - servicePriority.indexOf(b.type),
  )[0];
}

/**
 * The listings that become basket lines, in the order the search returned them.
 *
 * Stops at `count`. A listing with no service this package may buy is skipped
 * rather than counted, because it cannot be bought and a basket line that
 * cannot be bought is a short delivery rather than a cheap one.
 */
export function packageLines(pkg: LinkPackage, items: readonly WebsiteListItem[]): PackageLine[] {
  const lines: PackageLine[] = [];

  for (const item of items) {
    if (lines.length === pkg.count) break;

    const service = lineServiceFor(item, pkg.filters.linkTypes);
    if (service === null) continue;

    lines.push({ item, service });
  }

  return lines;
}

/**
 * What the package costs, in minor units.
 *
 * Null rather than zero when there is nothing to sell. "From $0" is not a
 * price, and a total of nothing is not a cheap package - it is a package
 * with no contents, which `isOfferable` refuses separately. The same rule
 * the niche page's starting price follows.
 */
export function packageTotalMinor(lines: readonly PackageLine[]): number | null {
  if (lines.length === 0) return null;

  return lines.reduce((total, line) => total + line.service.priceMinor, 0);
}

/**
 * Whether a package may be shown at all.
 *
 * A package promising ten placements that can only fill seven is not a
 * cheaper package, it is a card that misleads before the click and
 * disappoints after it. Better to withhold it, which is the rule
 * `MIN_LISTINGS_FOR_A_PAGE` already applies to a niche thin enough that its
 * page would embarrass us.
 */
export function isOfferable(pkg: LinkPackage, lines: readonly PackageLine[]): boolean {
  return lines.length >= pkg.count;
}

/**
 * The marketplace, filtered to what this package buys.
 *
 * The same `filters` the price was computed from, so "browse all of them"
 * lands on the set the figures describe. Page size is the package's own
 * count, so the first screen is the basket it would have built.
 */
export function packageHref(pkg: LinkPackage): string {
  const query = serialise(pkg.filters, pkg.sort, 1, pkg.count, 'table');

  return query ? `/marketplace?${query}` : '/marketplace';
}
