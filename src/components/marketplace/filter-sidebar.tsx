'use client';

import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { RangeFilter } from './range-filter';
import { categories } from '@/lib/data/categories';
import { countries } from '@/lib/data/countries';
import { languageLabels, linkTypeLabels } from '@/lib/utils/labels';
import { currencySymbol } from '@/lib/utils/format';
import type { MarketplaceFilters } from '@/lib/hooks/use-marketplace-filters';
import type {
  CountryCode,
  LanguageCode,
  LinkAttribute,
  LinkTypeSlug,
  NicheSlug,
} from '@/lib/types';

const linkTypes: LinkTypeSlug[] = ['guest-post', 'niche-edit', 'digital-pr'];
const turnaroundOptions = [
  { value: 3, label: 'Up to 3 days' },
  { value: 5, label: 'Up to 5 days' },
  { value: 7, label: 'Up to 7 days' },
  { value: 14, label: 'Up to 14 days' },
];

function toggleValue<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export function FilterSidebar({
  filters,
  onChange,
  onReset,
  activeFilterCount,
  availableLanguages,
}: {
  filters: MarketplaceFilters;
  onChange: (next: Partial<MarketplaceFilters>) => void;
  onReset: () => void;
  activeFilterCount: number;
  availableLanguages: LanguageCode[];
}) {
  const symbol = currencySymbol();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">Filters</h2>
        {activeFilterCount > 0 ? (
          <Button variant="ghost" size="sm" onClick={onReset} className="h-7 px-2 text-[13px]">
            <X className="h-3.5 w-3.5" />
            Clear all ({activeFilterCount})
          </Button>
        ) : null}
      </div>

      <Section title="Search domains" htmlFor="filter-search">
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <Input
            id="filter-search"
            type="search"
            value={filters.search}
            placeholder="Domain or keyword"
            onChange={(event) => onChange({ search: event.target.value })}
            className="h-9 pr-3 pl-9 text-[13px]"
          />
        </div>
      </Section>

      <Section title="Niche">
        <div className="hide-scrollbar max-h-56 space-y-1.5 overflow-y-auto pr-1">
          {categories.map((category) => (
            <CheckRow
              key={category.slug}
              id={`niche-${category.slug}`}
              label={category.name}
              checked={filters.niches.includes(category.slug)}
              onChange={() =>
                onChange({ niches: toggleValue<NicheSlug>(filters.niches, category.slug) })
              }
            />
          ))}
        </div>
      </Section>

      <Section title="Country">
        <div className="hide-scrollbar max-h-48 space-y-1.5 overflow-y-auto pr-1">
          {countries.map((country) => (
            <CheckRow
              key={country.code}
              id={`country-${country.code}`}
              label={country.name}
              checked={filters.countries.includes(country.code)}
              onChange={() =>
                onChange({ countries: toggleValue<CountryCode>(filters.countries, country.code) })
              }
            />
          ))}
        </div>
      </Section>

      <Section title="Link Type">
        <div className="space-y-1.5">
          {linkTypes.map((type) => (
            <CheckRow
              key={type}
              id={`service-${type}`}
              label={linkTypeLabels[type]}
              checked={filters.linkTypes.includes(type)}
              onChange={() =>
                onChange({ linkTypes: toggleValue<LinkTypeSlug>(filters.linkTypes, type) })
              }
            />
          ))}
        </div>
      </Section>

      <RangeFilter
        label="Domain Rating"
        idPrefix="dr"
        min={filters.drMin}
        max={filters.drMax}
        placeholderMin="0"
        placeholderMax="100"
        onChange={(range) => onChange({ drMin: range.min, drMax: range.max })}
      />

      <RangeFilter
        label="Organic Traffic"
        idPrefix="traffic"
        min={filters.trafficMin}
        max={filters.trafficMax}
        placeholderMin="0"
        placeholderMax="500,000"
        step={1000}
        onChange={(range) => onChange({ trafficMin: range.min, trafficMax: range.max })}
      />

      <RangeFilter
        label="Referring Domains"
        idPrefix="rd"
        min={filters.rdMin}
        max={filters.rdMax}
        placeholderMin="0"
        placeholderMax="50,000"
        step={100}
        onChange={(range) => onChange({ rdMin: range.min, rdMax: range.max })}
      />

      <RangeFilter
        label="Price"
        idPrefix="price"
        prefix={symbol}
        min={filters.priceMin}
        max={filters.priceMax}
        step={10}
        onChange={(range) => onChange({ priceMin: range.min, priceMax: range.max })}
      />

      <Section title="Language" htmlFor="filter-language">
        <Select
          id="filter-language"
          size="sm"
          value={filters.languages[0] ?? ''}
          onChange={(event) =>
            onChange({
              languages: event.target.value ? [event.target.value as LanguageCode] : [],
            })
          }
        >
          <option value="">Any language</option>
          {availableLanguages.map((language) => (
            <option key={language} value={language}>
              {languageLabels[language] ?? language}
            </option>
          ))}
        </Select>
      </Section>

      <Section title="Turnaround Time" htmlFor="filter-turnaround">
        <Select
          id="filter-turnaround"
          size="sm"
          value={filters.maxTurnaroundDays ?? ''}
          onChange={(event) =>
            onChange({
              maxTurnaroundDays: event.target.value ? Number(event.target.value) : undefined,
            })
          }
        >
          <option value="">Any turnaround</option>
          {turnaroundOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Section>

      <Section title="Link Attribute" htmlFor="filter-attribute">
        <Select
          id="filter-attribute"
          size="sm"
          value={filters.linkAttribute ?? ''}
          onChange={(event) =>
            onChange({
              linkAttribute: (event.target.value || undefined) as LinkAttribute | undefined,
            })
          }
        >
          <option value="">Dofollow and nofollow</option>
          <option value="dofollow">Dofollow only</option>
          <option value="nofollow">Nofollow only</option>
        </Select>
      </Section>

      <div className="border-t border-line pt-4">
        <CheckRow
          id="verified-only"
          label="Vetted websites only"
          checked={filters.verifiedOnly}
          onChange={() => onChange({ verifiedOnly: !filters.verifiedOnly })}
        />
      </div>
    </div>
  );
}

function Section({
  title,
  children,
  htmlFor,
}: {
  title: string;
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <div>
      {htmlFor ? (
        <label htmlFor={htmlFor} className="text-[13px] font-semibold text-ink">
          {title}
        </label>
      ) : (
        <h3 className="text-[13px] font-semibold text-ink">{title}</h3>
      )}
      <div className="mt-2">{children}</div>
    </div>
  );
}

function CheckRow({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Checkbox id={id} checked={checked} onChange={onChange} />
      <label htmlFor={id} className="cursor-pointer text-[13px] text-ink-soft hover:text-ink">
        {label}
      </label>
    </div>
  );
}
