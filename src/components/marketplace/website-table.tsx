'use client';

import { Fragment } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { DomainRating } from '@/components/shared/metric';
import { LinkTypeList } from '@/components/shared/link-type-badge';
import { VerifiedBadge } from '@/components/shared/verified-badge';
import { FavouriteButton } from './favourite-button';
import { AddToOrderButton } from './add-to-order-button';
import { WebsiteSnippet } from './website-snippet';
import { AudienceBars } from './audience-bars';
import { nicheName } from '@/lib/data/categories';
import { Flag } from '@/components/shared/flag';
import {
  formatCompactNumber,
  formatNumber,
  formatPrice,
  formatTurnaround,
} from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import { flipSort, sortDirection } from '@/lib/types/query';
import type { SortKey, WebsiteListItem } from '@/lib/types';

interface SortableColumn {
  key: SortKey;
  label: string;
  className?: string;
  align?: 'left' | 'right';
}

/*
  `key` is the order a first click gives. The second click gives its opposite,
  worked out from the key rather than listed anywhere - so a column cannot be
  added half-wired, which is what DR and traffic were: clickable, but with no
  pair recorded, so a second click silently re-applied the same order.

  Which end a column starts at is what a buyer means by clicking it. Strongest
  first for a metric; cheapest and fastest first for a cost.
*/
const sortableColumns: Record<string, SortableColumn> = {
  dr: { key: 'dr-desc', label: 'DR' },
  traffic: { key: 'traffic-desc', label: 'Organic Traffic' },
  kw: { key: 'kw-desc', label: 'Keywords' },
  rd: { key: 'rd-desc', label: 'Ref. Domains' },
  turnaround: { key: 'turnaround-asc', label: 'Turnaround' },
  price: { key: 'price-asc', label: 'Price', align: 'right' },
};

/** Columns in the row, which the snippet row has to span. */
const COLUMN_COUNT = 13;

/**
 * Clicks that belong to something else.
 *
 * The row toggles the snippet, but the row also contains a checkbox, two
 * links and two buttons, and every one of them was there first. A click that
 * started inside one of those is that control's click, not the row's.
 */
function isOwnClick(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('a, button, input, label') !== null;
}

export function WebsiteTable({
  websites,
  selected,
  onToggleSelect,
  onToggleSelectAll,
  sort,
  onSort,
  expandedId,
  onToggleExpand,
}: {
  websites: WebsiteListItem[];
  selected: string[];
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  sort: SortKey;
  onSort: (sort: SortKey) => void;
  /** The one row showing its snippet, or null. */
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
}) {
  const allSelected = websites.length > 0 && websites.every((site) => selected.includes(site.id));
  const someSelected = !allSelected && websites.some((site) => selected.includes(site.id));

  return (
    <TableWrap className="hidden lg:block">
      <Table className="table-fixed">
        <caption className="sr-only">
          Marketplace websites with metrics, link types, turnaround and price
        </caption>
        {/* Fixed widths keep every column, including the row actions, inside a
            1440px viewport without the table scrolling sideways. */}
        {/*
          Thirteen columns in about 1,100px, which is what a 1440 screen
          leaves once the filter rail is out. Every width below is measured
          against that rather than chosen: the header labels are short words
          that cannot wrap, so a column narrower than its own heading clips
          it, and the sum has to come in under the space or the table
          scrolls sideways inside the page.
        */}
        <colgroup>
          <col className="w-[32px]" />
          {/*
            Website. Narrow, because the row no longer carries the
            description under the domain - the mockup has none, it was the
            widest thing in the table, and what it bought was a sentence
            nobody reads while scanning for a domain. Long domains truncate
            with the full name in the title attribute.
          */}
          <col className="w-[158px]" />
          {/* Niche */}
          <col className="w-[74px]" />
          {/* Country. Sized by the word "Country", not by a flag. */}
          <col className="w-[72px]" />
          {/* DR - the ring is 36px and the cell padding is 20. */}
          <col className="w-[56px]" />
          {/* Organic traffic */}
          <col className="w-[74px]" />
          {/*
            Country traffic. The widest of the metric columns because it is
            two rows of flag, code, bar and figure - and because it is the
            one a buyer is actually scanning for: domain rating says how
            strong a site is, this says whether its readers are theirs.
          */}
          <col className="w-[98px]" />
          {/* Keywords */}
          <col className="w-[72px]" />
          {/* Referring domains */}
          <col className="w-[70px]" />
          {/* Link type */}
          <col className="w-[78px]" />
          {/* Turnaround */}
          <col className="w-[92px]" />
          {/* Price */}
          <col className="w-[90px]" />
          {/* Actions: bookmark, Add and View, which is what sets this width. */}
          <col className="w-[150px]" />
        </colgroup>
        <thead>
          <tr>
            <Th className="pr-0">
              <Checkbox
                checked={allSelected}
                indeterminate={someSelected}
                onChange={onToggleSelectAll}
                aria-label="Select all websites on this page"
              />
            </Th>
            <Th>Website</Th>
            <Th>Niche</Th>
            <Th>Country</Th>
            <SortableTh column={sortableColumns.dr!} sort={sort} onSort={onSort} />
            <SortableTh column={sortableColumns.traffic!} sort={sort} onSort={onSort} />
            {/* Not sortable: there is no single figure to sort a distribution
                by, and sorting by the leading country's share would rank a
                site with one measured country above a better-matched one
                with three. The filters are where this gets narrowed. */}
            <Th>Country split</Th>
            <SortableTh column={sortableColumns.kw!} sort={sort} onSort={onSort} />
            <SortableTh column={sortableColumns.rd!} sort={sort} onSort={onSort} />
            <Th>Link Type</Th>
            <SortableTh column={sortableColumns.turnaround!} sort={sort} onSort={onSort} />
            <SortableTh column={sortableColumns.price!} sort={sort} onSort={onSort} align="right" />
            <Th className="text-right">
              <span className="sr-only">Actions</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {websites.map((website) => {
            const isSelected = selected.includes(website.id);
            const isExpanded = expandedId === website.id;
            const snippetId = `snippet-${website.id}`;
            return (
              <Fragment key={website.id}>
                <Tr
                  className={cn('cursor-pointer', isSelected && 'bg-accent-50/40')}
                  onClick={(event) => {
                    if (!isOwnClick(event.target)) onToggleExpand(website.id);
                  }}
                >
                  <Td className="pr-0">
                    <Checkbox
                      checked={isSelected}
                      onChange={() => onToggleSelect(website.id)}
                      aria-label={`Select ${website.domain}`}
                    />
                  </Td>
                  <Td>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onToggleExpand(website.id)}
                        aria-expanded={isExpanded}
                        aria-controls={snippetId}
                        className="flex min-w-0 items-center gap-0.5 text-left text-[14px] font-semibold text-ink hover:text-accent-700"
                        title={website.domain}
                      >
                        <ChevronDown
                          className={cn(
                            'h-3 w-3 shrink-0 text-muted transition-transform',
                            isExpanded && 'rotate-180',
                          )}
                          aria-hidden="true"
                        />
                        <span className="truncate">{website.domain}</span>
                      </button>
                      {website.verified ? <VerifiedBadge /> : null}
                    </div>
                  </Td>
                  <Td>
                    <span
                      className="inline-block max-w-full truncate rounded-md bg-surface-sunken px-1.5 py-0.5 text-[11px] font-medium text-ink-soft"
                      title={nicheName(website.niche)}
                    >
                      {nicheName(website.niche)}
                    </span>
                  </Td>
                  <Td className="text-[13px] text-ink-soft">
                    {website.country ? (
                      <Flag country={website.country} label />
                    ) : (
                      <span className="text-muted" title="Country not known">
                        —
                      </span>
                    )}
                  </Td>
                  <Td>
                    <DomainRating value={website.metrics.domainRating} />
                  </Td>
                  <Td className="tabular text-[13px] text-ink-soft">
                    <span title={formatNumber(website.metrics.organicTraffic)}>
                      {formatCompactNumber(website.metrics.organicTraffic)}
                    </span>
                  </Td>
                  <Td>
                    <AudienceBars split={website.metrics.audienceSplit} />
                  </Td>
                  <Td className="tabular text-[13px] text-ink-soft">
                    {typeof website.metrics.organicKeywords === 'number' ? (
                      <span title={formatNumber(website.metrics.organicKeywords)}>
                        {formatCompactNumber(website.metrics.organicKeywords)}
                      </span>
                    ) : (
                      // Never measured. A zero here would say the site ranks
                      // for nothing, which is a claim about the publisher.
                      <span title="Not measured yet">—</span>
                    )}
                  </Td>
                  <Td className="tabular text-[13px] text-ink-soft">
                    <span title={formatNumber(website.metrics.referringDomains)}>
                      {formatCompactNumber(website.metrics.referringDomains)}
                    </span>
                  </Td>
                  <Td className="overflow-hidden">
                    <LinkTypeList types={website.availableLinkTypes} max={1} nowrap />
                  </Td>
                  <Td className="tabular text-[13px] whitespace-nowrap text-ink-soft">
                    {website.headlineService
                      ? formatTurnaround(
                          website.headlineService.turnaroundMinDays,
                          website.headlineService.turnaroundMaxDays,
                        )
                      : '—'}
                  </Td>
                  <Td className="tabular text-right text-[14px] font-semibold text-ink">
                    {formatPrice(website.headlinePriceMinor)}
                  </Td>
                  <Td>
                    <div className="flex items-center justify-end gap-1.5 pl-3">
                      <FavouriteButton websiteId={website.id} domain={website.domain} />
                      <AddToOrderButton website={website} />
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/websites/${website.slug}`}>View</Link>
                      </Button>
                    </div>
                  </Td>
                </Tr>

                {/* Its own row rather than a positioned overlay, so the table
                    keeps doing the layout and nothing below it moves. */}
                {isExpanded ? (
                  <tr className="border-b border-line bg-surface/60 last:border-b-0">
                    <td colSpan={COLUMN_COUNT} className="px-4 py-4">
                      <WebsiteSnippet id={snippetId} website={website} />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </Table>
    </TableWrap>
  );
}

function SortableTh({
  column,
  sort,
  onSort,
  className,
  align,
}: {
  column: SortableColumn;
  sort: SortKey;
  onSort: (sort: SortKey) => void;
  className?: string;
  align?: 'left' | 'right';
}) {
  /*
    Every column reads both ways, and both halves come from the key.

    This was a map with price in it and nothing else, plus a ternary naming two
    keys for the arrow. Both had to be remembered when a column was added, and
    neither was: DR and traffic were clickable columns whose second click did
    nothing, and Ref. Domains was not clickable at all.
  */
  const opposite = flipSort(column.key);
  const isActive = sort === column.key || sort === opposite;
  const next = (isActive ? flipSort(sort) : undefined) ?? column.key;
  const ariaSort = isActive ? (sortDirection(sort) ?? 'none') : 'none';

  const alignment = align ?? column.align;

  return (
    <Th className={cn(alignment === 'right' && 'text-right', className)} aria-sort={ariaSort}>
      <button
        type="button"
        onClick={() => onSort(next)}
        /*
          `items-start` and a wrapping label, not `items-center` and one
          line. Four of these headings are two words - Organic Traffic, Ref.
          Domains - and the columns under them are sized for the figures
          rather than for the words. Held on one line they were cut off
          mid-word, which is the one thing a column heading cannot be.
        */
        className={cn(
          'flex w-full items-start gap-1 text-left text-[10px] leading-[1.2] font-semibold tracking-[0.04em] uppercase transition-colors hover:text-ink',
          alignment === 'right' && 'justify-end text-right',
          isActive ? 'text-ink' : 'text-muted',
        )}
      >
        <span className="min-w-0">{column.label}</span>
        {!isActive ? (
          <ChevronsUpDown className="h-3 w-3 shrink-0 translate-y-px opacity-60" aria-hidden="true" />
        ) : ariaSort === 'ascending' ? (
          <ArrowUp className="h-3 w-3 shrink-0 translate-y-px" aria-hidden="true" />
        ) : (
          <ArrowDown className="h-3 w-3 shrink-0 translate-y-px" aria-hidden="true" />
        )}
      </button>
    </Th>
  );
}
