'use client';

import { cn } from '@/lib/utils/cn';
import { linkTypeLabels } from '@/lib/utils/labels';
import type { LinkTypeSlug } from '@/lib/types';

/**
 * The placement types, as tabs across the top of the marketplace.
 *
 * ## Three, not five
 *
 * The mockup draws All Websites, Guest Posts, Link Insertions, Homepage
 * Links and Digital PR. Press Parrot sells three things - `LinkTypeSlug` is
 * `guest-post | niche-edit | digital-pr` - and a tab for a product that does
 * not exist is a filter that returns nothing with no way for the customer to
 * know why. "Link Insertions" is this product's niche edit under another
 * name, so it is the same tab wearing our label; there is no homepage-link
 * service to point a fourth tab at.
 *
 * Generated from `linkTypeLabels` rather than typed, so adding a fourth
 * service adds its tab and nothing has to remember to.
 *
 * ## It is the existing filter, not a second one
 *
 * A tab writes `linkTypes` - the same field the Link Type control writes and
 * the same `service=` the URL has always carried. So a shared link keeps its
 * tab, the back button works, and the chips below show the choice like any
 * other filter rather than it being a hidden second state that can disagree
 * with them.
 *
 * Exactly one at a time, which is what a tab means. The filter itself holds
 * an array and the advanced panel can still set several; a tab row showing
 * two selected would be lying about what it does, so when the filter holds
 * more than one, none of the tabs is active and All Websites is not either.
 */
export function PlacementTabs({
  selected,
  onChange,
}: {
  selected: LinkTypeSlug[];
  onChange: (types: LinkTypeSlug[]) => void;
}) {
  const only = selected.length === 1 ? selected[0] : undefined;
  const all = selected.length === 0;

  const tabs: { key: string; label: string; active: boolean; apply: () => void }[] = [
    { key: 'all', label: 'All Websites', active: all, apply: () => onChange([]) },
    ...(Object.keys(linkTypeLabels) as LinkTypeSlug[]).map((slug) => ({
      key: slug,
      label: linkTypeLabels[slug],
      active: only === slug,
      apply: () => onChange([slug]),
    })),
  ];

  return (
    <div
      role="tablist"
      aria-label="Placement type"
      className="flex flex-wrap items-center gap-2"
    >
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={tab.active}
          onClick={tab.apply}
          className={cn(
            'rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors',
            tab.active
              ? 'bg-accent-700 text-white shadow-[var(--shadow-card)]'
              : 'border border-line-strong bg-white text-ink-soft hover:border-muted-soft hover:text-ink',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
