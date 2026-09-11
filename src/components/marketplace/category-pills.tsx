'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { featuredCategories, overflowCategories } from '@/lib/data/categories';
import { cn } from '@/lib/utils/cn';
import type { NicheSlug } from '@/lib/types';

/** Horizontal niche selector shown above the marketplace results. */
export function CategoryPills({
  selected,
  onToggle,
  onClear,
  counts,
}: {
  selected: NicheSlug[];
  onToggle: (slug: NicheSlug) => void;
  onClear: () => void;
  counts?: Partial<Record<NicheSlug, number>>;
}) {
  const [showMore, setShowMore] = useState(false);
  const visible = showMore ? [...featuredCategories, ...overflowCategories] : featuredCategories;

  return (
    // Scrolls horizontally on phones, wraps from small tablets upwards.
    <div className="hide-scrollbar -mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
      <Pill active={selected.length === 0} onClick={onClear}>
        All Niches
      </Pill>
      {visible.map((category) => (
        <Pill
          key={category.slug}
          active={selected.includes(category.slug)}
          onClick={() => onToggle(category.slug)}
        >
          {category.name}
          {counts?.[category.slug] !== undefined ? (
            <span className="tabular ml-1.5 text-[11px] opacity-60">
              {counts[category.slug]}
            </span>
          ) : null}
        </Pill>
      ))}
      {overflowCategories.length > 0 ? (
        <button
          type="button"
          onClick={() => setShowMore((value) => !value)}
          aria-expanded={showMore}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line-strong bg-white px-3 py-1.5 text-[13px] font-medium whitespace-nowrap text-ink-soft transition-colors hover:border-muted-soft hover:text-ink"
        >
          {showMore ? 'Less' : 'More'}
          <ChevronDown
            className={cn('h-3.5 w-3.5 transition-transform', showMore && 'rotate-180')}
            aria-hidden="true"
          />
        </button>
      ) : null}
    </div>
  );
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border px-3 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors',
        active
          ? 'border-navy-900 bg-navy-900 text-white'
          : 'border-line-strong bg-white text-ink-soft hover:border-muted-soft hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}
