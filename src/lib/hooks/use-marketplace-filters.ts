'use client'

import { useCallback, useMemo, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { sortOptions } from '@/lib/utils/labels';
import {
  countActiveFilters,
  emptyFilters,
  parseFilters,
  serialise,
  type MarketplaceFilters,
  type MarketplaceView,
} from '@/lib/marketplace/filters';
import type { SortKey } from '@/lib/types';

export type { MarketplaceFilters, MarketplaceView } from '@/lib/marketplace/filters';
export { countActiveFilters, emptyFilters, toWebsiteQuery } from '@/lib/marketplace/filters';

export function useMarketplaceFilters(defaultPageSize = 25) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const initial = useMemo(
    () => parseFilters(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const [filters, setFiltersState] = useState<MarketplaceFilters>(initial);
  // Same reasoning as the topic: a sort in the URL is honoured only if it is one
  // the dropdown offers. An order that no longer exists would otherwise leave
  // the control blank while the list was ordered by something unnameable.
  const [sort, setSortState] = useState<SortKey>(() => {
    const asked = searchParams.get('sort');
    return sortOptions.some((option) => option.value === asked)
      ? (asked as SortKey)
      : 'relevance';
  });
  const [page, setPageState] = useState(Number(searchParams.get('page') ?? '1') || 1);
  const [pageSize, setPageSizeState] = useState(
    Number(searchParams.get('size') ?? String(defaultPageSize)) || defaultPageSize,
  );
  const [view, setViewState] = useState<MarketplaceView>(
    (searchParams.get('view') as MarketplaceView | null) ?? 'table',
  );

  /*
    Filter changes are a server round trip now, so the page has to be able to
    say so.

    The search runs in the database since the marketplace stopped shipping the
    whole inventory to the browser, which means a click is a request rather
    than an array filter. Wrapping the navigation in a transition keeps the
    current results on screen while the next ones are fetched - the alternative
    is the list blanking on every tick of a checkbox - and hands the page a
    `pending` flag to dim them with.
  */
  const [pending, startTransition] = useTransition();

  const sync = useCallback(
    (
      nextFilters: MarketplaceFilters,
      nextSort: SortKey,
      nextPage: number,
      nextPageSize: number,
      nextView: MarketplaceView,
    ) => {
      const query = serialise(nextFilters, nextSort, nextPage, nextPageSize, nextView);
      startTransition(() => {
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
      });
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
    /** True while the next page of results is being fetched. */
    pending,
  } as const;
}
