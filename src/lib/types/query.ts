import type { CountryCode } from './country';
import type { NicheSlug } from './category';
import type { LanguageCode, LinkAttribute, LinkTypeSlug } from './website';

/**
 * How the marketplace is ordered.
 *
 * Every measure a buyer sorts on reads both ways. A shortlist is built by
 * looking from one end or the other - the strongest sites, or the cheapest -
 * and which end depends on whether somebody is spending a budget or filling
 * one. DR, traffic and referring domains offered only "highest" until a buyer
 * asked for the other end of each.
 *
 * The suffix is the direction, and it is read rather than listed: `sortedBoth`
 * flips a key, the table header derives its arrow from it, and `sortItems` is
 * the only place that has to know what a field means. A column added without
 * its opposite is a column that silently does nothing on a second click, which
 * is what DR and traffic did.
 */
export type SortKey =
  | 'relevance'
  | 'price-asc'
  | 'price-desc'
  | 'dr-asc'
  | 'dr-desc'
  | 'traffic-asc'
  | 'traffic-desc'
  | 'rd-asc'
  | 'rd-desc'
  | 'kw-asc'
  | 'kw-desc'
  | 'turnaround-asc'
  | 'turnaround-desc'
  | 'newest';

/** The same measure, the other way round. Undefined where there is no pair. */
export function flipSort(sort: SortKey): SortKey | undefined {
  if (sort.endsWith('-asc')) return sort.replace(/-asc$/, '-desc') as SortKey;
  if (sort.endsWith('-desc')) return sort.replace(/-desc$/, '-asc') as SortKey;
  return undefined;
}

/** Which way a key reads, for the header arrow and for `aria-sort`. */
export function sortDirection(sort: SortKey): 'ascending' | 'descending' | undefined {
  if (sort.endsWith('-asc')) return 'ascending';
  if (sort.endsWith('-desc')) return 'descending';
  return undefined;
}

export interface NumericRange {
  min?: number;
  max?: number;
}

/** Everything the marketplace can filter on. Also used by the service layer. */
export interface WebsiteQuery {
  search?: string;
  niches?: NicheSlug[];
  countries?: CountryCode[];
  languages?: LanguageCode[];
  linkTypes?: LinkTypeSlug[];
  linkAttribute?: LinkAttribute;
  domainRating?: NumericRange;
  organicTraffic?: NumericRange;
  referringDomains?: NumericRange;
  /** Price range in minor units. */
  price?: NumericRange;
  /** Maximum acceptable turnaround in business days. */
  maxTurnaroundDays?: number;
  verifiedOnly?: boolean;
  sort?: SortKey;
  page?: number;
  pageSize?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * What the marketplace sidebar may offer, and how much of it.
 *
 * Counted in the database since filtering moved there: the page no longer
 * holds the inventory, so it cannot count it. The shape mirrors what the
 * sidebar renders - niche counts over every active listing, country counts
 * over the topic being bought for, plus the listings with no stated market,
 * which the sidebar shows as a line of its own rather than hiding.
 */
export interface MarketplaceFacets {
  niches: Record<string, number>;
  /** Biggest first, as the sidebar shows them. */
  countries: [string, number][];
  unstated: number;
  languages: string[];
}
