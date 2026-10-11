'use client';

import { useId, useState } from 'react';
import { ChevronDown, SlidersHorizontal, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { FilterSidebar } from './filter-sidebar';
import { ActiveFilterChips, activeChips } from './active-filter-chips';
import { categories, nicheName } from '@/lib/data/categories';
import { countryName } from '@/lib/data/countries';
import { linkTypeLabels } from '@/lib/utils/labels';
import { cn } from '@/lib/utils/cn';
import type { MarketplaceFilters } from '@/lib/marketplace/filters';
import type { CountryCode, LanguageCode, LinkTypeSlug, NicheSlug } from '@/lib/types';

/**
 * The filter panel, across the top rather than down the side.
 *
 * ## The quick row is a shortcut into filters that already existed
 *
 * Nothing here is a new filter. Every control writes the same field of
 * `MarketplaceFilters` the sidebar has always written, which is the same
 * query parameter the URL has always carried and the same column the
 * database has always been asked about. So a link shared from the old
 * sidebar opens here with its filters intact, the chips describe it
 * correctly, and the back button works - because there is still exactly one
 * place the state lives.
 *
 * Seven controls, because seven is what the mockup shows and what fits a row
 * without wrapping into something that is no longer scannable. Which seven
 * is not arbitrary: they are the questions a buyer asks before any other -
 * what is it about, where is it read, how strong is it, how much is it.
 *
 * ## Everything else is still there, one click away
 *
 * `FilterSidebar` is rendered whole inside the advanced disclosure rather
 * than reimplemented. It is 447 lines of working controls - audience share,
 * languages, referring domains, link attribute, turnaround, verification -
 * and a second copy of them laid out differently would be two sets of
 * controls writing one state, drifting apart at the first change.
 *
 * Collapsed by default, because the row above answers most visits and a
 * panel that opens with everything showing is the sidebar again.
 *
 * ## On a phone, the chips stay and the controls go
 *
 * Seven inputs in a row is not a filter panel at 390px, so the controls move
 * into the sheet the toolbar's Filters button opens - which is where they
 * already were before this redesign.
 *
 * The chips do not go with them. Hiding the whole card on mobile was the
 * first version and it was wrong in a way that is hard to notice and nasty
 * to hit: a customer arriving on a shared link with four filters set would
 * see a narrowed list, no indication of why, and no way to widen it without
 * finding a button that does not say "you have filters on". The chips are
 * the only thing on the screen that says what is being excluded, so they
 * are the one part that survives the breakpoint.
 *
 * With nothing set there is nothing to say, so the card does not draw at
 * all rather than leaving an empty box above the results.
 */
export function FilterPanel({
  filters,
  onChange,
  onReset,
  activeFilterCount,
  availableLanguages,
  countryCounts,
  nicheCounts,
}: {
  filters: MarketplaceFilters;
  onChange: (patch: Partial<MarketplaceFilters>) => void;
  onReset: () => void;
  activeFilterCount: number;
  availableLanguages: LanguageCode[];
  countryCounts: { countries: [CountryCode, number][]; unstated: number };
  nicheCounts: Partial<Record<NicheSlug, number>>;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const advancedId = useId();
  const chips = activeChips(filters);

  /*
    One niche in the quick row, several in the advanced panel.

    The field is a list and stays one - a buyer narrowing to three niches is
    a thing the marketplace supports and the chips can describe. What a
    single dropdown cannot do is *show* three, so it shows the one when
    there is one and sits on "All niches" when there are more, with the
    chips below carrying the truth. Choosing from it replaces the set rather
    than adding to it, which is what picking from a dropdown means.
  */
  const singleNiche = filters.niches.length === 1 ? filters.niches[0] : '';
  const singleCountry = filters.countries.length === 1 ? filters.countries[0] : '';
  const singleType = filters.linkTypes.length === 1 ? filters.linkTypes[0] : '';

  return (
    <section
      aria-label="Marketplace filters"
      className={cn(
        'rounded-[var(--radius-card)] border border-line bg-white p-4 shadow-[var(--shadow-card)] sm:p-5',
        // Nothing set and no controls to show at this width: draw nothing.
        chips.length === 0 && 'max-lg:hidden',
      )}
    >
      <div className="hidden flex-wrap items-center justify-between gap-3 lg:flex">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-ink">
          <SlidersHorizontal className="h-4 w-4 text-accent-600" aria-hidden="true" />
          Filters
          {activeFilterCount > 0 ? (
            <span className="tabular rounded-full bg-accent-700 px-2 py-0.5 text-[11px] font-semibold text-white">
              {activeFilterCount}
            </span>
          ) : null}
        </h2>

        <button
          type="button"
          onClick={() => setAdvancedOpen((open) => !open)}
          aria-expanded={advancedOpen}
          aria-controls={advancedId}
          className={cn(
            'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors',
            advancedOpen
              ? 'bg-navy-900 text-white'
              : 'border border-line-strong bg-white text-ink-soft hover:border-muted-soft hover:text-ink',
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
          Advanced filters
          <ChevronDown
            className={cn('h-3.5 w-3.5 transition-transform', advancedOpen && 'rotate-180')}
            aria-hidden="true"
          />
        </button>
      </div>

      <p className="mt-4 mb-2 hidden text-[12px] font-medium text-muted lg:block">Quick filters</p>

      <div className="hidden gap-3 sm:grid-cols-2 lg:grid lg:grid-cols-3 xl:grid-cols-4">
        <Field label="Search websites" className="sm:col-span-2 lg:col-span-1">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <Input
              value={filters.search}
              onChange={(event) => onChange({ search: event.target.value })}
              placeholder="Domain or keyword"
              className="h-10 pl-8.5"
            />
          </div>
        </Field>

        <Field label="Niche">
          <Select
            value={singleNiche}
            onChange={(event) =>
              onChange({ niches: event.target.value ? [event.target.value as NicheSlug] : [] })
            }
          >
            <option value="">All niches</option>
            {categories.map((category) => {
              const count = nicheCounts[category.slug as NicheSlug];
              return (
                <option key={category.slug} value={category.slug}>
                  {nicheName(category.slug as NicheSlug)}
                  {count ? ` (${count.toLocaleString('en-GB')})` : ''}
                </option>
              );
            })}
          </Select>
        </Field>

        <Field label="Country">
          <Select
            value={singleCountry}
            onChange={(event) =>
              onChange({
                countries: event.target.value ? [event.target.value as CountryCode] : [],
              })
            }
          >
            <option value="">All countries</option>
            {countryCounts.countries.map(([code, count]) => (
              <option key={code} value={code}>
                {countryName(code)} ({count.toLocaleString('en-GB')})
              </option>
            ))}
          </Select>
        </Field>

        <MinMax
          label="DR"
          min={filters.drMin}
          max={filters.drMax}
          onChange={(drMin, drMax) => onChange({ drMin, drMax })}
          placeholderMin="Min"
          placeholderMax="Max"
        />

        <MinMax
          label="Organic traffic"
          min={filters.trafficMin}
          max={filters.trafficMax}
          onChange={(trafficMin, trafficMax) => onChange({ trafficMin, trafficMax })}
          placeholderMin="Min"
          placeholderMax="Max"
        />

        <MinMax
          label="Price range"
          min={filters.priceMin}
          max={filters.priceMax}
          onChange={(priceMin, priceMax) => onChange({ priceMin, priceMax })}
          placeholderMin="Min"
          placeholderMax="Max"
        />

        <Field label="Link type">
          <Select
            value={singleType}
            onChange={(event) =>
              onChange({
                linkTypes: event.target.value ? [event.target.value as LinkTypeSlug] : [],
              })
            }
          >
            <option value="">All types</option>
            {(Object.keys(linkTypeLabels) as LinkTypeSlug[]).map((slug) => (
              <option key={slug} value={slug}>
                {linkTypeLabels[slug]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {advancedOpen ? (
        <div id={advancedId} className="mt-5 border-t border-line pt-5">
          <FilterSidebar
            filters={filters}
            onChange={onChange}
            onReset={onReset}
            activeFilterCount={activeFilterCount}
            availableLanguages={availableLanguages}
            countryCounts={countryCounts}
            layout="panel"
          />
        </div>
      ) : null}

      {chips.length > 0 ? (
        <div className="border-t border-line pt-4 lg:mt-4">
          <ActiveFilterChips filters={filters} onChange={onChange} onClearAll={onReset} />
        </div>
      ) : null}
    </section>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1.5 block text-[12px] font-medium text-ink-soft">{label}</span>
      {children}
    </label>
  );
}

/**
 * A numeric band as two boxes.
 *
 * Empty means unbounded, which is why these are controlled on the string and
 * not on the number: `Number('')` is 0, and a price filter that reads an
 * emptied box as "maximum zero" returns nothing and gives no clue why.
 */
function MinMax({
  label,
  min,
  max,
  onChange,
  placeholderMin,
  placeholderMax,
}: {
  label: string;
  min?: number;
  max?: number;
  onChange: (min: number | undefined, max: number | undefined) => void;
  placeholderMin: string;
  placeholderMax: string;
}) {
  const read = (value: string): number | undefined => {
    if (value.trim() === '') return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
  };

  return (
    <fieldset className="block min-w-0">
      <legend className="mb-1.5 block text-[12px] font-medium text-ink-soft">{label}</legend>
      <div className="flex items-center gap-1.5">
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          value={min ?? ''}
          onChange={(event) => onChange(read(event.target.value), max)}
          placeholder={placeholderMin}
          aria-label={`${label} minimum`}
          className="h-10 min-w-0"
        />
        <span className="shrink-0 text-[13px] text-muted" aria-hidden="true">
          –
        </span>
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          value={max ?? ''}
          onChange={(event) => onChange(min, read(event.target.value))}
          placeholder={placeholderMax}
          aria-label={`${label} maximum`}
          className="h-10 min-w-0"
        />
      </div>
    </fieldset>
  );
}
