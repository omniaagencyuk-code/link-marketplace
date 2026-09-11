'use client';

import { LayoutGrid, Rows3, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { sortOptions } from '@/lib/utils/labels';
import { cn } from '@/lib/utils/cn';
import type { SortKey } from '@/lib/types';
import type { MarketplaceView } from '@/lib/hooks/use-marketplace-filters';

export function ResultsToolbar({
  total,
  sort,
  onSortChange,
  view,
  onViewChange,
  onOpenFilters,
  activeFilterCount,
}: {
  total: number;
  sort: SortKey;
  onSortChange: (sort: SortKey) => void;
  view: MarketplaceView;
  onViewChange: (view: MarketplaceView) => void;
  onOpenFilters: () => void;
  activeFilterCount: number;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={onOpenFilters} className="lg:hidden">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filters
          {activeFilterCount > 0 ? (
            <span className="tabular ml-1 rounded-full bg-navy-900 px-1.5 text-[11px] text-white">
              {activeFilterCount}
            </span>
          ) : null}
        </Button>
        <p aria-live="polite" className="tabular text-[13px] text-ink-soft">
          <span className="font-semibold text-ink">{total.toLocaleString('en-GB')}</span> websites
          found
        </p>
      </div>

      <div className="flex items-center gap-2">
        <label htmlFor="sort" className="hidden text-[13px] text-muted sm:block">
          Sort by
        </label>
        <Select
          id="sort"
          size="sm"
          value={sort}
          onChange={(event) => onSortChange(event.target.value as SortKey)}
          className="w-[10.5rem]"
        >
          {sortOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>

        <div
          className="hidden items-center rounded-md border border-line-strong bg-white p-0.5 lg:flex"
          role="group"
          aria-label="Result layout"
        >
          <ViewToggle
            active={view === 'table'}
            onClick={() => onViewChange('table')}
            label="Table view"
          >
            <Rows3 className="h-3.5 w-3.5" aria-hidden="true" />
          </ViewToggle>
          <ViewToggle
            active={view === 'grid'}
            onClick={() => onViewChange('grid')}
            label="Grid view"
          >
            <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
          </ViewToggle>
        </div>
      </div>
    </div>
  );
}

function ViewToggle({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className={cn(
        'flex h-7 w-8 items-center justify-center rounded transition-colors',
        active ? 'bg-navy-900 text-white' : 'text-muted hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}
