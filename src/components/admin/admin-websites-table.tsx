'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { Archive, Copy, MoreHorizontal, Pencil, Search, Eye } from 'lucide-react';
import { Dropdown, DropdownItem } from '@/components/ui/dropdown';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { WebsiteStatusBadge } from '@/components/shared/status-badge';
import { duplicateWebsiteAction, setWebsiteStatusAction } from '@/app/admin/actions';
import { nicheName } from '@/lib/data/categories';
import { countryShortName } from '@/lib/data/countries';
import { formatCompactNumber, formatPrice, formatTurnaround } from '@/lib/utils/format';
import { servicesMissingCost, websiteMargin } from '@/lib/utils/margin';
import type { WebsiteListItem, WebsiteStatus } from '@/lib/types';

const statusFilters: { value: WebsiteStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'draft', label: 'Draft' },
  { value: 'paused', label: 'Paused' },
  { value: 'archived', label: 'Archived' },
];

export function AdminWebsitesTable({ websites }: { websites: WebsiteListItem[] }) {
  const [term, setTerm] = useState('');
  const [status, setStatus] = useState<WebsiteStatus | 'all'>('all');
  const [pending, startTransition] = useTransition();

  const rows = useMemo(() => {
    const needle = term.trim().toLowerCase();
    return websites.filter((website) => {
      if (status !== 'all' && website.status !== status) return false;
      if (!needle) return true;
      return `${website.domain} ${website.title} ${website.niche}`.toLowerCase().includes(needle);
    });
  }, [websites, term, status]);

  /**
   * Our position on a listing.
   *
   * A dash means no cost has been recorded, which is not the same as breaking
   * even - showing a zero there would read as "this costs us nothing" and
   * quietly overstate the margin on every site nobody has priced yet.
   */
  function costOf(website: WebsiteListItem) {
    const margin = websiteMargin(website);
    return margin ? formatPrice(margin.costMinor) : '\u2014';
  }

  function profitOf(website: WebsiteListItem) {
    const margin = websiteMargin(website);
    if (!margin) return <span className="text-muted">&mdash;</span>;

    const missing = servicesMissingCost(website);
    return (
      <span className={margin.profitMinor >= 0 ? 'text-accent-700' : 'text-coral-700'}>
        {formatPrice(margin.profitMinor)}
        <span className="ml-1 text-muted">({margin.marginPct}%)</span>
        {missing > 0 ? (
          <span
            className="ml-1 text-muted"
            title={`${missing} service${missing === 1 ? '' : 's'} with no cost recorded, left out of this figure`}
          >
            *
          </span>
        ) : null}
      </span>
    );
  }

  function priceFor(website: WebsiteListItem, type: string) {
    const service = website.services.find((candidate) => candidate.type === type);
    return service ? formatPrice(service.priceMinor) : '—';
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <label htmlFor="admin-website-search" className="sr-only">
            Search websites
          </label>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <Input
            id="admin-website-search"
            type="search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search domain, title or niche"
            className="h-9 pl-9 text-[13px]"
          />
        </div>
        <div className="w-40">
          <label htmlFor="admin-status-filter" className="sr-only">
            Filter by status
          </label>
          <Select
            id="admin-status-filter"
            size="sm"
            value={status}
            onChange={(event) => setStatus(event.target.value as WebsiteStatus | 'all')}
          >
            {statusFilters.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
        <p className="tabular text-[13px] text-muted">{rows.length} websites</p>
      </div>

      <TableWrap>
        <Table>
          <caption className="sr-only">Website database</caption>
          <thead>
            <tr>
              <Th className="min-w-52">Domain</Th>
              <Th>Niche</Th>
              <Th>Country</Th>
              <Th>DR</Th>
              <Th>Traffic</Th>
              <Th>Ref. domains</Th>
              <Th className="text-right">Guest post</Th>
              <Th className="text-right">Niche edit</Th>
              <Th className="text-right">Cost</Th>
              <Th className="text-right">Profit</Th>
              <Th>Turnaround</Th>
              <Th>Status</Th>
              <Th className="w-12 text-right">
                <span className="sr-only">Actions</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((website) => (
              <Tr key={website.id}>
                <Td>
                  <Link
                    href={`/admin/websites/${website.id}`}
                    className="text-[13px] font-semibold text-ink hover:text-accent-700"
                  >
                    {website.domain}
                  </Link>
                  <p className="truncate text-[11px] text-muted">{website.title}</p>
                </Td>
                <Td className="text-[13px] text-ink-soft">{nicheName(website.niche)}</Td>
                <Td className="text-[13px] text-ink-soft">{countryShortName(website.country)}</Td>
                <Td className="tabular text-[13px] text-ink-soft">
                  {website.metrics.domainRating}
                </Td>
                <Td className="tabular text-[13px] text-ink-soft">
                  {formatCompactNumber(website.metrics.organicTraffic)}
                </Td>
                <Td className="tabular text-[13px] text-ink-soft">
                  {formatCompactNumber(website.metrics.referringDomains)}
                </Td>
                <Td className="tabular text-right text-[13px] text-ink-soft">
                  {priceFor(website, 'guest-post')}
                </Td>
                <Td className="tabular text-right text-[13px] text-ink-soft">
                  {priceFor(website, 'niche-edit')}
                </Td>
                <Td className="tabular text-right text-[13px] text-muted">
                  {costOf(website)}
                </Td>
                <Td className="tabular text-right text-[13px]">{profitOf(website)}</Td>
                <Td className="tabular text-[13px] whitespace-nowrap text-ink-soft">
                  {website.headlineService
                    ? formatTurnaround(
                        website.headlineService.turnaroundMinDays,
                        website.headlineService.turnaroundMaxDays,
                      )
                    : '—'}
                </Td>
                <Td>
                  <WebsiteStatusBadge status={website.status} />
                </Td>
                <Td className="text-right">
                  <Dropdown
                    label={`Actions for ${website.domain}`}
                    triggerClassName="h-8 w-8 px-0 justify-center"
                    trigger={<MoreHorizontal className="h-4 w-4" aria-hidden="true" />}
                  >
                    {(close) => (
                      <>
                        <DropdownItem asChild>
                          <Link href={`/websites/${website.slug}`}>
                            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                            View listing
                          </Link>
                        </DropdownItem>
                        <DropdownItem asChild>
                          <Link href={`/admin/websites/${website.id}`}>
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                            Edit
                          </Link>
                        </DropdownItem>
                        <DropdownItem
                          disabled={pending}
                          onClick={() => {
                            startTransition(() => duplicateWebsiteAction(website.id));
                            close();
                          }}
                        >
                          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                          Duplicate
                        </DropdownItem>
                        <DropdownItem
                          disabled={pending}
                          onClick={() => {
                            startTransition(() =>
                              setWebsiteStatusAction(
                                website.id,
                                website.status === 'archived' ? 'active' : 'archived',
                              ),
                            );
                            close();
                          }}
                        >
                          <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                          {website.status === 'archived' ? 'Restore' : 'Archive'}
                        </DropdownItem>
                      </>
                    )}
                  </Dropdown>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>
    </div>
  );
}
