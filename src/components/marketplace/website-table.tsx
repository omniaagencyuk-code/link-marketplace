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
import { nicheName } from '@/lib/data/categories';
import { countryShortName } from '@/lib/data/countries';
import { formatCompactNumber, formatPrice, formatTurnaround } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import type { SortKey, WebsiteListItem } from '@/lib/types';

interface SortableColumn {
  key: SortKey;
  label: string;
  className?: string;
  align?: 'left' | 'right';
}

const sortableColumns: Record<string, SortableColumn> = {
  dr: { key: 'dr-desc', label: 'DR' },
  traffic: { key: 'traffic-desc', label: 'Organic Traffic' },
  turnaround: { key: 'turnaround-asc', label: 'Turnaround' },
  price: { key: 'price-asc', label: 'Price', align: 'right' },
};

/** Columns in the row, which the snippet row has to span. */
const COLUMN_COUNT = 11;

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
        <colgroup>
          <col className="w-[34px]" />
          <col className="w-[170px]" />
          <col className="w-[96px]" />
          <col className="w-[64px]" />
          <col className="w-[56px]" />
          <col className="w-[88px]" />
          <col className="w-[88px]" />
          <col className="w-[113px]" />
          <col className="w-[96px]" />
          <col className="w-[72px]" />
          <col className="w-[183px]" />
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
            <Th>Ref. Domains</Th>
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
                    <p className="mt-0.5 truncate text-[12px] text-muted" title={website.description}>
                      {website.description}
                    </p>
                  </Td>
                  <Td className="truncate text-[13px] text-ink-soft" title={nicheName(website.niche)}>
                    {nicheName(website.niche)}
                  </Td>
                  <Td className="text-[13px] text-ink-soft">{countryShortName(website.country)}</Td>
                  <Td>
                    <DomainRating value={website.metrics.domainRating} />
                  </Td>
                  <Td className="tabular text-[13px] text-ink-soft">
                    {formatCompactNumber(website.metrics.organicTraffic)}
                  </Td>
                  <Td className="tabular text-[13px] text-ink-soft">
                    {formatCompactNumber(website.metrics.referringDomains)}
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
                    <div className="flex items-center justify-end gap-1">
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
  // Price toggles between ascending and descending; the others are descending.
  const alternate: Partial<Record<SortKey, SortKey>> = {
    'price-asc': 'price-desc',
    'price-desc': 'price-asc',
  };
  const isActive = sort === column.key || sort === alternate[column.key];
  const next = isActive && alternate[sort] ? (alternate[sort] as SortKey) : column.key;
  const ariaSort = !isActive
    ? 'none'
    : sort === 'price-asc' || sort === 'turnaround-asc'
      ? 'ascending'
      : 'descending';

  const alignment = align ?? column.align;

  return (
    <Th className={cn(alignment === 'right' && 'text-right', className)} aria-sort={ariaSort}>
      <button
        type="button"
        onClick={() => onSort(next)}
        className={cn(
          'inline-flex items-center gap-1 text-[11px] font-semibold tracking-wide uppercase transition-colors hover:text-ink',
          alignment === 'right' && 'w-full justify-end',
          isActive ? 'text-ink' : 'text-muted',
        )}
      >
        {column.label}
        {!isActive ? (
          <ChevronsUpDown className="h-3 w-3 opacity-60" aria-hidden="true" />
        ) : ariaSort === 'ascending' ? (
          <ArrowUp className="h-3 w-3" aria-hidden="true" />
        ) : (
          <ArrowDown className="h-3 w-3" aria-hidden="true" />
        )}
      </button>
    </Th>
  );
}
