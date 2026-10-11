'use client';

import { X } from 'lucide-react';
import { nicheName } from '@/lib/data/categories';
import { countryName } from '@/lib/data/countries';
import { languageLabels, linkTypeLabels } from '@/lib/utils/labels';
import { formatCompactNumber, formatPrice } from '@/lib/utils/format';
import type { MarketplaceFilters } from '@/lib/marketplace/filters';

/**
 * What is currently narrowing the list, as chips that can be taken off one
 * at a time.
 *
 * ## Derived from the filters, never stored beside them
 *
 * Every chip is computed from `MarketplaceFilters` on render, and removing
 * one writes the filters back. There is no second list of "what is active"
 * to fall out of step with the first - which is the failure this component
 * exists to be immune to: a chip row kept in its own state shows a filter
 * that is no longer applied, and the customer removes something that was
 * never there while the list stays narrowed by something invisible.
 *
 * Because the filters live in the URL, this is also what makes a shared link
 * legible: whatever the chips say is what the address bar says is what the
 * database was asked.
 *
 * ## The topic is not a chip
 *
 * `topic` decides what a placement costs as well as which publishers appear,
 * so removing it is not "show me more" - it reprices the whole list. It has
 * its own control, which says so. A chip with an x next to the niches would
 * make it look like one more thing to clear.
 */
interface Chip {
  key: string;
  label: string;
  /** The patch that removes this one filter and nothing else. */
  clear: Partial<MarketplaceFilters>;
}

export function activeChips(filters: MarketplaceFilters): Chip[] {
  const chips: Chip[] = [];

  if (filters.search) {
    chips.push({ key: 'search', label: `Search: ${filters.search}`, clear: { search: '' } });
  }

  for (const niche of filters.niches) {
    chips.push({
      key: `niche-${niche}`,
      label: `Niche: ${nicheName(niche)}`,
      clear: { niches: filters.niches.filter((value) => value !== niche) },
    });
  }

  for (const country of filters.countries) {
    chips.push({
      key: `country-${country}`,
      label: `Country: ${countryName(country)}`,
      clear: { countries: filters.countries.filter((value) => value !== country) },
    });
  }

  for (const language of filters.languages) {
    chips.push({
      key: `lang-${language}`,
      label: `Language: ${languageLabels[language] ?? language}`,
      clear: { languages: filters.languages.filter((value) => value !== language) },
    });
  }

  for (const type of filters.linkTypes) {
    chips.push({
      key: `type-${type}`,
      label: linkTypeLabels[type] ?? type,
      clear: { linkTypes: filters.linkTypes.filter((value) => value !== type) },
    });
  }

  if (filters.linkAttribute) {
    chips.push({
      key: 'attr',
      // The type is the two words themselves, so there is no label map to
      // keep in step with it.
      label: filters.linkAttribute === 'dofollow' ? 'Dofollow' : 'Nofollow',
      clear: { linkAttribute: undefined },
    });
  }

  /*
    One chip for a range, not two.

    "DR: 70+" is how a buyer describes what they set, and splitting it into a
    minimum chip and a maximum chip means clearing a band takes two clicks
    and leaves a half-applied range in between that nobody asked for.
  */
  const range = (
    key: string,
    name: string,
    min: number | undefined,
    max: number | undefined,
    show: (value: number) => string,
    clear: Partial<MarketplaceFilters>,
  ) => {
    if (min === undefined && max === undefined) return;
    const label =
      min !== undefined && max !== undefined
        ? `${name}: ${show(min)}–${show(max)}`
        : min !== undefined
          ? `${name}: ${show(min)}+`
          : `${name}: up to ${show(max as number)}`;
    chips.push({ key, label, clear });
  };

  range('dr', 'DR', filters.drMin, filters.drMax, String, {
    drMin: undefined,
    drMax: undefined,
  });
  range('traffic', 'Traffic', filters.trafficMin, filters.trafficMax, formatCompactNumber, {
    trafficMin: undefined,
    trafficMax: undefined,
  });
  range('rd', 'Ref. domains', filters.rdMin, filters.rdMax, formatCompactNumber, {
    rdMin: undefined,
    rdMax: undefined,
  });
  range(
    'price',
    'Price',
    filters.priceMin,
    filters.priceMax,
    // The bounds are whole units in the URL; the formatter takes minor ones.
    (value) => formatPrice(value * 100),
    { priceMin: undefined, priceMax: undefined },
  );

  if (filters.maxTurnaroundDays !== undefined) {
    chips.push({
      key: 'turnaround',
      label: `Delivered in ${filters.maxTurnaroundDays} days`,
      clear: { maxTurnaroundDays: undefined },
    });
  }

  if (filters.audienceCountry) {
    const share = filters.audienceShareMin;
    chips.push({
      key: 'audience',
      label: share
        ? `${share}%+ readers in ${countryName(filters.audienceCountry)}`
        : `Readers in ${countryName(filters.audienceCountry)}`,
      clear: {
        audienceCountry: undefined,
        audienceShareMin: undefined,
        audienceTrafficMin: undefined,
      },
    });
  }

  if (filters.verifiedOnly) {
    chips.push({ key: 'verified', label: 'Verified only', clear: { verifiedOnly: false } });
  }

  return chips;
}

export function ActiveFilterChips({
  filters,
  onChange,
  onClearAll,
}: {
  filters: MarketplaceFilters;
  onChange: (patch: Partial<MarketplaceFilters>) => void;
  onClearAll: () => void;
}) {
  const chips = activeChips(filters);
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[12px] font-medium text-muted">Active filters</span>
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={() => onChange(chip.clear)}
          className="group inline-flex items-center gap-1.5 rounded-full border border-accent-200 bg-accent-50 py-1 pr-1.5 pl-3 text-[12px] font-medium text-accent-800 transition-colors hover:border-accent-300 hover:bg-accent-100"
        >
          {chip.label}
          <X
            className="h-3 w-3 text-accent-700 transition-colors group-hover:text-accent-800"
            aria-hidden="true"
          />
          <span className="sr-only">Remove this filter</span>
        </button>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        className="ml-1 text-[12px] font-medium text-accent-700 hover:underline"
      >
        Clear all
      </button>
    </div>
  );
}
