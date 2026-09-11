import type { CountryCode } from './country';
import type { NicheSlug } from './category';
import type { LanguageCode, LinkAttribute, LinkTypeSlug } from './website';

export type SortKey =
  | 'relevance'
  | 'price-asc'
  | 'price-desc'
  | 'dr-desc'
  | 'traffic-desc'
  | 'turnaround-asc'
  | 'newest';

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
