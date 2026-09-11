'use client';

import { useCallback, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type {
  CountryCode,
  LanguageCode,
  LinkAttribute,
  LinkTypeSlug,
  NicheSlug,
  SortKey,
  WebsiteQuery,
} from '@/lib/types';

export type MarketplaceView = 'table' | 'grid';

export interface MarketplaceFilters {
  search: string;
  niches: NicheSlug[];
  countries: CountryCode[];
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

function parseFilters(params: URLSearchParams): MarketplaceFilters {
  return {
    search: params.get('q') ?? '',
    niches: csv(params.get('niche')) as NicheSlug[],
    countries: csv(params.get('country')) as CountryCode[],
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

function serialise(
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
  if (filters.niches.length) set('niche', filters.niches.join(','));
  if (filters.countries.length) set('country', filters.countries.join(','));
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
  count += filters.niches.length;
  count += filters.countries.length;
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
export function useMarketplaceFilters(defaultPageSize = 25) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const initial = useMemo(
    () => parseFilters(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const [filters, setFiltersState] = useState<MarketplaceFilters>(initial);
  const [sort, setSortState] = useState<SortKey>(
    (searchParams.get('sort') as SortKey | null) ?? 'relevance',
  );
  const [page, setPageState] = useState(Number(searchParams.get('page') ?? '1') || 1);
  const [pageSize, setPageSizeState] = useState(
    Number(searchParams.get('size') ?? String(defaultPageSize)) || defaultPageSize,
  );
  const [view, setViewState] = useState<MarketplaceView>(
    (searchParams.get('view') as MarketplaceView | null) ?? 'table',
  );

  const sync = useCallback(
    (
      nextFilters: MarketplaceFilters,
      nextSort: SortKey,
      nextPage: number,
      nextPageSize: number,
      nextView: MarketplaceView,
    ) => {
      const query = serialise(nextFilters, nextSort, nextPage, nextPageSize, nextView);
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router],
  );

  // The URL is updated outside the state updater: writing to the router from
  // inside one would update the Router while this component is rendering.
  const setFilters = useCallback(
    (updater: MarketplaceFilters | ((current: MarketplaceFilters) => MarketplaceFilters)) => {
      const next = typeof updater === 'function' ? updater(filters) : updater;
      setFiltersState(next);
      setPageState(1);
      sync(next, sort, 1, pageSize, view);
    },
    [filters, sort, pageSize, view, sync],
  );

  const setSort = useCallback(
    (next: SortKey) => {
      setSortState(next);
      setPageState(1);
      sync(filters, next, 1, pageSize, view);
    },
    [filters, pageSize, view, sync],
  );

  const setPage = useCallback(
    (next: number) => {
      setPageState(next);
      sync(filters, sort, next, pageSize, view);
    },
    [filters, sort, pageSize, view, sync],
  );

  const setPageSize = useCallback(
    (next: number) => {
      setPageSizeState(next);
      setPageState(1);
      sync(filters, sort, 1, next, view);
    },
    [filters, sort, view, sync],
  );

  const setView = useCallback(
    (next: MarketplaceView) => {
      setViewState(next);
      sync(filters, sort, page, pageSize, next);
    },
    [filters, sort, page, pageSize, sync],
  );

  const reset = useCallback(() => {
    setFiltersState(emptyFilters);
    setSortState('relevance');
    setPageState(1);
    sync(emptyFilters, 'relevance', 1, pageSize, view);
  }, [pageSize, view, sync]);

  return {
    filters,
    setFilters,
    sort,
    setSort,
    page,
    setPage,
    pageSize,
    setPageSize,
    view,
    setView,
    reset,
    activeFilterCount: countActiveFilters(filters),
  } as const;
}
