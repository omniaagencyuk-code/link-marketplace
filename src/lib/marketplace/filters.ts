/**
 * The marketplace's filters, and how they live in the URL.
 *
 * Extracted from the hook that used to hold them because the server now needs
 * them too. The page reads `searchParams` and the browser writes them back, so
 * a second parser would be two readings of one URL - and the first filter
 * whose spelling drifted would show the customer a different list from the one
 * their own address bar describes.
 *
 * Pure: no hooks, no router, nothing that needs a browser. `use-marketplace-filters`
 * is the client half and imports everything here.
 */
import { isBuyableTopic } from '@/lib/config/accepted-niches';
import type {
  CountryCode,
  LanguageCode,
  LinkAttribute,
  LinkTypeSlug,
  NicheSlug,
  SortKey,
  WebsiteQuery,
  AcceptedNicheSlug,
} from '@/lib/types';

export type MarketplaceView = 'table' | 'grid';

export interface MarketplaceFilters {
  search: string;
  /**
   * What the buyer is buying for.
   *
   * Not a filter like the others: it is the campaign's subject, set once, and
   * it decides both which publishers appear and what they cost. Kept in the
   * URL like everything else so a shortlist can be shared or bookmarked with
   * the topic it was built for.
   */
  topic?: AcceptedNicheSlug;
  niches: NicheSlug[];
  countries: CountryCode[];
  /**
   * Where the readers are, rather than where the publisher is.
   *
   * Separate from `countries` on purpose: that one is the publisher's own
   * market, this is a share of the measured audience, and a US publication
   * can be read mostly in the UK. Folding them together would change what
   * the older filter means for anybody who has it set.
   */
  audienceCountry?: CountryCode;
  audienceShareMin?: number;
  audienceTrafficMin?: number;
  languages: LanguageCode[];
  linkTypes: LinkTypeSlug[];
  linkAttribute?: LinkAttribute;
  drMin?: number;
  drMax?: number;
  trafficMin?: number;
  trafficMax?: number;
  rdMin?: number;
  rdMax?: number;
  /** Price bounds in whole pounds, converted to minor units for the query. */
  priceMin?: number;
  priceMax?: number;
  maxTurnaroundDays?: number;
  verifiedOnly: boolean;
}

export const emptyFilters: MarketplaceFilters = {
  search: '',
  niches: [],
  countries: [],
  languages: [],
  linkTypes: [],
  verifiedOnly: false,
};

function csv(value: string | null): string[] {
  return value ? value.split(',').filter(Boolean) : [];
}

function num(value: string | null): number | undefined {
  if (value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * A topic from the URL, or nothing.
 *
 * The picker only offers topics a publisher ever states a position on, but a
 * link shared before that - `?topic=sports` - still exists. Honouring it would
 * filter the marketplace down to nobody while the dropdown showed blank,
 * because no option matches: an empty screen with no visible cause. Dropping
 * it shows the whole marketplace, which is what "any topic" means anyway.
 */
function buyableTopic(value: string | null): AcceptedNicheSlug | undefined {
  if (!value || !isBuyableTopic(value)) return undefined;
  return value as AcceptedNicheSlug;
}

export function parseFilters(params: URLSearchParams): MarketplaceFilters {
  return {
    search: params.get('q') ?? '',
    topic: buyableTopic(params.get('topic')),
    niches: csv(params.get('niche')) as NicheSlug[],
    countries: csv(params.get('country')) as CountryCode[],
    audienceCountry: (params.get('audCountry') as CountryCode | null) ?? undefined,
    audienceShareMin: num(params.get('audShare')),
    audienceTrafficMin: num(params.get('audTraffic')),
    languages: csv(params.get('lang')) as LanguageCode[],
    linkTypes: csv(params.get('service')) as LinkTypeSlug[],
    linkAttribute: (params.get('attr') as LinkAttribute | null) ?? undefined,
    drMin: num(params.get('drMin')),
    drMax: num(params.get('drMax')),
    trafficMin: num(params.get('trMin')),
    trafficMax: num(params.get('trMax')),
    rdMin: num(params.get('rdMin')),
    rdMax: num(params.get('rdMax')),
    priceMin: num(params.get('priceMin')),
    priceMax: num(params.get('priceMax')),
    maxTurnaroundDays: num(params.get('turnaround')),
    verifiedOnly: params.get('verified') === '1',
  };
}

export function serialise(
  filters: MarketplaceFilters,
  sort: SortKey,
  page: number,
  pageSize: number,
  view: MarketplaceView,
) {
  const params = new URLSearchParams();
  const set = (key: string, value: string | number | undefined | null) => {
    if (value === undefined || value === null || value === '') return;
    params.set(key, String(value));
  };

  set('q', filters.search.trim());
  if (filters.topic) set('topic', filters.topic);
  if (filters.niches.length) set('niche', filters.niches.join(','));
  if (filters.countries.length) set('country', filters.countries.join(','));
  /*
    The thresholds only mean anything alongside a country, so they are not
    written without one. A URL carrying `audShare=30` and no country would
    restore as a filter that reads as set and narrows nothing.
  */
  if (filters.audienceCountry) {
    set('audCountry', filters.audienceCountry);
    set('audShare', filters.audienceShareMin);
    set('audTraffic', filters.audienceTrafficMin);
  }
  if (filters.languages.length) set('lang', filters.languages.join(','));
  if (filters.linkTypes.length) set('service', filters.linkTypes.join(','));
  set('attr', filters.linkAttribute);
  set('drMin', filters.drMin);
  set('drMax', filters.drMax);
  set('trMin', filters.trafficMin);
  set('trMax', filters.trafficMax);
  set('rdMin', filters.rdMin);
  set('rdMax', filters.rdMax);
  set('priceMin', filters.priceMin);
  set('priceMax', filters.priceMax);
  set('turnaround', filters.maxTurnaroundDays);
  if (filters.verifiedOnly) set('verified', '1');
  if (sort !== 'relevance') set('sort', sort);
  if (page > 1) set('page', page);
  if (pageSize !== 25) set('size', pageSize);
  if (view !== 'table') set('view', view);

  return params.toString();
}

/** Count of filters the user has actively applied (drives "Clear all"). */
export function countActiveFilters(filters: MarketplaceFilters) {
  let count = 0;
  if (filters.search.trim()) count += 1;
  // The topic is not counted as a filter. It is the question being asked,
  // not a narrowing of the answer, and showing "1 filter" beside it invites
  // somebody to clear it without noticing what it was doing.
  count += filters.niches.length;
  count += filters.countries.length;
  // One, whatever thresholds are on it: the country is the filter and the
  // two numbers are how tight it is, so counting them separately would read
  // as three filters where somebody set one.
  if (filters.audienceCountry) count += 1;
  count += filters.languages.length;
  count += filters.linkTypes.length;
  if (filters.linkAttribute) count += 1;
  if (filters.drMin !== undefined || filters.drMax !== undefined) count += 1;
  if (filters.trafficMin !== undefined || filters.trafficMax !== undefined) count += 1;
  if (filters.rdMin !== undefined || filters.rdMax !== undefined) count += 1;
  if (filters.priceMin !== undefined || filters.priceMax !== undefined) count += 1;
  if (filters.maxTurnaroundDays !== undefined) count += 1;
  if (filters.verifiedOnly) count += 1;
  return count;
}

/** Convert UI filter state into the service-layer query shape. */
export function toWebsiteQuery(
  filters: MarketplaceFilters,
  sort: SortKey,
  page: number,
  pageSize: number,
): WebsiteQuery {
  return {
    search: filters.search,
    niches: filters.niches.length ? filters.niches : undefined,
    countries: filters.countries.length ? filters.countries : undefined,
    // Without a country the thresholds are not a filter, so they are not sent.
    audienceCountry: filters.audienceCountry,
    audienceShareMin: filters.audienceCountry ? filters.audienceShareMin : undefined,
    audienceTrafficMin: filters.audienceCountry ? filters.audienceTrafficMin : undefined,
    languages: filters.languages.length ? filters.languages : undefined,
    linkTypes: filters.linkTypes.length ? filters.linkTypes : undefined,
    linkAttribute: filters.linkAttribute,
    domainRating: { min: filters.drMin, max: filters.drMax },
    organicTraffic: { min: filters.trafficMin, max: filters.trafficMax },
    referringDomains: { min: filters.rdMin, max: filters.rdMax },
    price: {
      min: filters.priceMin !== undefined ? filters.priceMin * 100 : undefined,
      max: filters.priceMax !== undefined ? filters.priceMax * 100 : undefined,
    },
    maxTurnaroundDays: filters.maxTurnaroundDays,
    verifiedOnly: filters.verifiedOnly || undefined,
    sort,
    page,
    pageSize,
  };
}

/**
 * Marketplace filter, sort and pagination state, mirrored into the URL so
 * results stay shareable and the back button works.
 */
