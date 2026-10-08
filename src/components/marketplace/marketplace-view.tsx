'use client';

import { useState } from 'react';
import { SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Sheet } from '@/components/ui/sheet';
import { CategoryPills } from './category-pills';
import { TopicPicker } from './topic-picker';
import { FilterSidebar } from './filter-sidebar';
import { Pagination } from './pagination';
import { ResultsToolbar } from './results-toolbar';
import { WebsiteCard } from './website-card';
import { WebsiteTable } from './website-table';
import { SelectionBar } from './selection-bar';
import {
  useMarketplaceFilters,
  type MarketplaceFilters,
} from '@/lib/hooks/use-marketplace-filters';
import type { CountryCode, LanguageCode, NicheSlug, PaginatedResult, WebsiteListItem } from '@/lib/types';
import type { MarketplaceFacets } from '@/lib/types/query';

/**
 * The marketplace.
 *
 * Filtering, sorting and pagination happen in the database. This renders one
 * page of the answer and nothing else - the filters are already written to the
 * URL by `useMarketplaceFilters`, and the server component above re-runs the
 * search whenever they change.
 *
 * It used to be handed every active listing and filter it here, which was
 * instant and is why it was built that way. It stopped being tenable at 3,405
 * listings with 7,174 approved and waiting: the page carried the whole
 * inventory on every visit. What a customer gives up is the instant click;
 * what they get back is a page that loads the same whatever the inventory
 * does.
 */
export function MarketplaceView({
  result,
  facets,
  defaultPageSize = 25,
}: {
  result: PaginatedResult<WebsiteListItem>;
  facets: MarketplaceFacets;
  defaultPageSize?: number;
}) {
  const {
    filters,
    setFilters,
    sort,
    setSort,
    setPage,
    setPageSize,
    view,
    setView,
    reset,
    activeFilterCount,
    pending,
  } = useMarketplaceFilters(defaultPageSize);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  // Which row is showing its snippet. One at a time, and deliberately not in
  // the URL: it is a glance at a row, not a place someone should land on or
  // share, and putting it in the query string would mean a navigation on
  // every open and close.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const toggleExpanded = (id: string) =>
    setExpandedId((current) => (current === id ? null : id));

  const nicheCounts = facets.niches as Partial<Record<NicheSlug, number>>;
  const availableLanguages = facets.languages as LanguageCode[];

  /*
    Countries that actually have listings, biggest first, plus how many have no
    stated market at all.

    The sidebar used to offer all thirteen curated countries whether or not a
    single listing was in them, so ticking "United States" emptied the screen
    with no hint why. Counting from the listings on offer means the filter can
    only promise what it can deliver, and the number beside a country is the
    number a buyer gets.

    Counted in the database now, and still over the topic rather than over the
    whole inventory: a country with four publishers, none of whom take
    gambling, should not read "4" to somebody buying for a casino.
  */
  const countryCounts = {
    countries: facets.countries as [CountryCode, number][],
    unstated: facets.unstated,
  };

  /*
    How many publishers take this topic at all.

    The sum of the country counts and the listings with no stated market is
    exactly the topic's set, because that is the set the database counted them
    over. Derived rather than asked for separately: a second count of the same
    rows is a second chance to disagree with the first.
  */
  const matchingTopic =
    countryCounts.countries.reduce((sum, [, count]) => sum + count, 0) + countryCounts.unstated;

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
      countryCounts={countryCounts}
    />
  );

  return (
    <div className="space-y-5">
      <TopicPicker
        topic={filters.topic}
        matching={matchingTopic}
        onChange={(topic) => patchFilters({ topic })}
      />

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
              topic={filters.topic}
            />
          ) : null}

          {/*
            Dimmed, not replaced, while the next page is fetched.

            Swapping in a skeleton on every checkbox would flash the whole list
            for what is usually under a tenth of a second. Keeping the current
            results on screen and fading them says "working" without taking
            away what the customer was reading - and `aria-busy` says the same
            thing to a screen reader, which cannot see the fade.
          */}
          <div
            aria-busy={pending}
            className={pending ? 'opacity-60 transition-opacity' : 'transition-opacity'}
          >
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
                  expandedId={expandedId}
                  onToggleExpand={toggleExpanded}
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
                  <WebsiteCard
                    key={website.id}
                    website={website}
                    expanded={expandedId === website.id}
                    onToggleExpand={() => toggleExpanded(website.id)}
                  />
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
