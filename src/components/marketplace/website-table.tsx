'use client';

import Link from 'next/link';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { DomainRating } from '@/components/shared/metric';
import { LinkTypeList } from '@/components/shared/link-type-badge';
import { VerifiedBadge } from '@/components/shared/verified-badge';
import { FavouriteButton } from './favourite-button';
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

export function WebsiteTable({
  websites,
  selected,
  onToggleSelect,
  onToggleSelectAll,
  sort,
  onSort,
}: {
  websites: WebsiteListItem[];
  selected: string[];
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  sort: SortKey;
  onSort: (sort: SortKey) => void;
}) {
  const allSelected = websites.length > 0 && websites.every((site) => selected.includes(site.id));
  const someSelected = !allSelected && websites.some((site) => selected.includes(site.id));

  return (
    <TableWrap className="hidden lg:block">
      <Table>
        <caption className="sr-only">
          Marketplace websites with metrics, link types, turnaround and price
        </caption>
        <thead>
          <tr>
            <Th className="w-10 pr-0">
              <Checkbox
                checked={allSelected}
                indeterminate={someSelected}
                onChange={onToggleSelectAll}
                aria-label="Select all websites on this page"
              />
            </Th>
            <Th className="min-w-[13rem]">Website</Th>
            <Th className="w-20">Niche</Th>
            <Th className="w-14">Country</Th>
            <SortableTh column={sortableColumns.dr!} sort={sort} onSort={onSort} className="w-16" />
            <SortableTh
              column={sortableColumns.traffic!}
              sort={sort}
              onSort={onSort}
              className="w-24"
            />
            <Th className="hidden w-24 xl:table-cell">Ref. Domains</Th>
            <Th className="w-32">Link Type</Th>
            <SortableTh
              column={sortableColumns.turnaround!}
              sort={sort}
              onSort={onSort}
              className="w-24"
            />
            <SortableTh
              column={sortableColumns.price!}
              sort={sort}
              onSort={onSort}
              className="w-20 text-right"
            />
            <Th className="w-24 text-right">
              <span className="sr-only">Actions</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {websites.map((website) => {
            const isSelected = selected.includes(website.id);
            return (
              <Tr key={website.id} className={cn(isSelected && 'bg-accent-50/40')}>
                <Td className="pr-0">
                  <Checkbox
                    checked={isSelected}
                    onChange={() => onToggleSelect(website.id)}
                    aria-label={`Select ${website.domain}`}
                  />
                </Td>
                <Td>
                  <div className="flex items-center gap-1.5">
                    <Link
                      href={`/websites/${website.slug}`}
                      className="text-[14px] font-semibold text-ink hover:text-accent-700"
                    >
                      {website.domain}
                    </Link>
                    {website.verified ? <VerifiedBadge /> : null}
                  </div>
                  <p className="mt-0.5 line-clamp-1 max-w-[24rem] text-[12px] text-muted">
                    {website.description}
                  </p>
                </Td>
                <Td className="text-[13px] text-ink-soft">{nicheName(website.niche)}</Td>
                <Td className="text-[13px] text-ink-soft">{countryShortName(website.country)}</Td>
                <Td>
                  <DomainRating value={website.metrics.domainRating} />
                </Td>
                <Td className="tabular text-[13px] text-ink-soft">
                  {formatCompactNumber(website.metrics.organicTraffic)}
                </Td>
                <Td className="tabular hidden text-[13px] text-ink-soft xl:table-cell">
                  {formatCompactNumber(website.metrics.referringDomains)}
                </Td>
                <Td>
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
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/websites/${website.slug}`}>View</Link>
                    </Button>
                  </div>
                </Td>
              </Tr>
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
}: {
  column: SortableColumn;
  sort: SortKey;
  onSort: (sort: SortKey) => void;
  className?: string;
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

  return (
    <Th className={className} aria-sort={ariaSort}>
      <button
        type="button"
        onClick={() => onSort(next)}
        className={cn(
          'inline-flex items-center gap-1 text-[11px] font-semibold tracking-wide uppercase transition-colors hover:text-ink',
          column.align === 'right' && 'w-full justify-end',
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
