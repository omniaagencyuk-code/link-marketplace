'use client';

import { useMemo, useState } from 'react';
import { SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Sheet } from '@/components/ui/sheet';
import { CategoryPills } from './category-pills';
import { FilterSidebar } from './filter-sidebar';
import { Pagination } from './pagination';
import { ResultsToolbar } from './results-toolbar';
import { WebsiteCard } from './website-card';
import { WebsiteTable } from './website-table';
import { SelectionBar } from './selection-bar';
import {
  toWebsiteQuery,
  useMarketplaceFilters,
  type MarketplaceFilters,
} from '@/lib/hooks/use-marketplace-filters';
import { runQuery } from '@/lib/services/query-engine';
import type { LanguageCode, NicheSlug, WebsiteListItem } from '@/lib/types';

/**
 * The marketplace.
 *
 * Filtering, sorting and pagination run against the dataset supplied by the
 * server component, so interactions are instant. When Supabase is connected,
 * swap `runQuery` for a server action that calls `websiteService.search()`.
 */
export function MarketplaceView({
  websites,
  defaultPageSize = 25,
}: {
  websites: WebsiteListItem[];
  defaultPageSize?: number;
}) {
  const {
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
    activeFilterCount,
  } = useMarketplaceFilters(defaultPageSize);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  const result = useMemo(
    () => runQuery(websites, toWebsiteQuery(filters, sort, page, pageSize)),
    [websites, filters, sort, page, pageSize],
  );

  const nicheCounts = useMemo(() => {
    const counts: Partial<Record<NicheSlug, number>> = {};
    for (const website of websites) {
      counts[website.niche] = (counts[website.niche] ?? 0) + 1;
    }
    return counts;
  }, [websites]);

  const availableLanguages = useMemo(
    () => Array.from(new Set(websites.map((website) => website.language))) as LanguageCode[],
    [websites],
  );

  function patchFilters(patch: Partial<MarketplaceFilters>) {
    setFilters((current) => ({ ...current, ...patch }));
  }

  function toggleNiche(slug: NicheSlug) {
    patchFilters({
      niches: filters.niches.includes(slug)
        ? filters.niches.filter((niche) => niche !== slug)
        : [...filters.niches, slug],
    });
  }

  const sidebar = (
    <FilterSidebar
      filters={filters}
      onChange={patchFilters}
      onReset={reset}
      activeFilterCount={activeFilterCount}
      availableLanguages={availableLanguages}
    />
  );

  return (
    <div className="space-y-5">
      <CategoryPills
        selected={filters.niches}
        onToggle={toggleNiche}
        onClear={() => patchFilters({ niches: [] })}
        counts={nicheCounts}
      />

      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] xl:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="hidden lg:block" aria-label="Marketplace filters">
          <div className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)]">
            {sidebar}
          </div>
        </aside>

        <div className="min-w-0 space-y-4">
          <ResultsToolbar
            total={result.total}
            sort={sort}
            onSortChange={setSort}
            view={view}
            onViewChange={setView}
            onOpenFilters={() => setFiltersOpen(true)}
            activeFilterCount={activeFilterCount}
          />

          {selected.length > 0 ? (
            <SelectionBar
              count={selected.length}
              onClear={() => setSelected([])}
              websites={result.items.filter((item) => selected.includes(item.id))}
            />
          ) : null}

          {result.items.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title="No websites match these filters"
              description="Try widening the domain rating or price range, or clearing a niche to see more of the marketplace."
              action={
                <Button variant="outline" onClick={reset}>
                  Clear all filters
                </Button>
              }
            />
          ) : (
            <>
              {view === 'table' ? (
                <WebsiteTable
                  websites={result.items}
                  selected={selected}
                  sort={sort}
                  onSort={setSort}
                  onToggleSelect={(id) =>
                    setSelected((current) =>
                      current.includes(id)
                        ? current.filter((value) => value !== id)
                        : [...current, id],
                    )
                  }
                  onToggleSelectAll={() =>
                    setSelected((current) => {
                      const ids = result.items.map((item) => item.id);
                      const allSelected = ids.every((id) => current.includes(id));
                      return allSelected
                        ? current.filter((id) => !ids.includes(id))
                        : Array.from(new Set([...current, ...ids]));
                    })
                  }
                />
              ) : null}

              <div
                className={
                  view === 'grid'
                    ? 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3'
                    : 'grid gap-3 lg:hidden'
                }
              >
                {result.items.map((website) => (
                  <WebsiteCard key={website.id} website={website} />
                ))}
              </div>

              <Pagination
                page={result.page}
                totalPages={result.totalPages}
                pageSize={result.pageSize}
                total={result.total}
                onPageChange={(next) => {
                  setPage(next);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                onPageSizeChange={setPageSize}
              />
            </>
          )}
        </div>
      </div>

      <Sheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filters"
        description={`${result.total.toLocaleString('en-GB')} websites match`}
        footer={
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={reset}>
              Clear all
            </Button>
            <Button variant="accent" className="flex-1" onClick={() => setFiltersOpen(false)}>
              Show {result.total.toLocaleString('en-GB')} results
            </Button>
          </div>
        }
      >
        {sidebar}
      </Sheet>
    </div>
  );
}
