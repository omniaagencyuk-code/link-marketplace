'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { Archive, Copy, MoreHorizontal, Pencil, Search, Eye, Trash2, X } from 'lucide-react';
import { Dropdown, DropdownItem } from '@/components/ui/dropdown';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { WebsiteStatusBadge } from '@/components/shared/status-badge';
import {
  bulkDeleteWebsitesAction,
  bulkSetWebsiteStatusAction,
  duplicateWebsiteAction,
  setWebsiteStatusAction,
  type BulkResult,
} from '@/app/admin/actions';
import { nicheName } from '@/lib/data/categories';
import { countryShortName } from '@/lib/data/countries';
import { formatCompactNumber, formatPrice, formatTurnaround } from '@/lib/utils/format';
import {
  servicesInForeignCurrency,
  servicesMissingCost,
  websiteMargin,
} from '@/lib/utils/margin';
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

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // The verb belongs with the result: "3 websites updated" is wrong after a
  // delete, and quietly misreports what just happened to the data.
  const [result, setResult] = useState<(BulkResult & { verb: string }) | null>(null);

  const rows = useMemo(() => {
    const needle = term.trim().toLowerCase();
    return websites.filter((website) => {
      if (status !== 'all' && website.status !== status) return false;
      if (!needle) return true;
      return `${website.domain} ${website.title} ${website.niche}`.toLowerCase().includes(needle);
    });
  }, [websites, term, status]);

  // Select-all applies to what is on screen, not to the whole database.
  // Filtering to "draft" and ticking the header should publish those drafts,
  // not every listing including the ones deliberately filtered out.
  const visibleIds = useMemo(() => rows.map((row) => row.id), [rows]);
  const selectedVisible = visibleIds.filter((id) => selected.has(id));
  const allVisibleSelected = visibleIds.length > 0 && selectedVisible.length === visibleIds.length;
  const someVisibleSelected = selectedVisible.length > 0 && !allVisibleSelected;

  function toggleRow(id: string, on: boolean) {
    setResult(null);
    setConfirmingDelete(false);
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAllVisible(on: boolean) {
    setResult(null);
    setConfirmingDelete(false);
    setSelected((current) => {
      const next = new Set(current);
      for (const id of visibleIds) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
    setConfirmingDelete(false);
    setResult(null);
  }

  function runBulk(action: () => Promise<BulkResult>, verb: string) {
    setResult(null);
    startTransition(async () => {
      const outcome = await action();
      setResult({ ...outcome, verb });
      setConfirmingDelete(false);
      // Rows that were skipped stay selected, so the admin can see which ones
      // still need a decision rather than losing them from the selection.
      if (outcome.changed > 0) {
        const stillSkipped = new Set(outcome.skipped.map((entry) => entry.domain));
        setSelected(
          new Set(
            [...selected].filter((id) => {
              const row = websites.find((website) => website.id === id);
              return row ? stillSkipped.has(row.domain) || stillSkipped.has(id) : false;
            }),
          ),
        );
      }
    });
  }

  const selectedIds = [...selected];

  /**
   * Our position on a listing.
   *
   * A dash means no cost has been recorded, which is not the same as breaking
   * even - showing a zero there would read as "this costs us nothing" and
   * quietly overstate the margin on every site nobody has priced yet.
   *
   * It also means a cost we cannot subtract here: a publisher quoting in
   * dollars needs the rate, the buffer and the payment fee applied before
   * their number means anything against a sterling price, and all three live
   * in the pricing engine. The dash is honest; the figure this used to print
   * was not.
   */
  function costOf(website: WebsiteListItem) {
    const margin = websiteMargin(website);
    return margin ? formatPrice(margin.costMinor) : '\u2014';
  }

  function profitOf(website: WebsiteListItem) {
    const margin = websiteMargin(website);
    const foreign = servicesInForeignCurrency(website);

    if (!margin) {
      return (
        <span
          className="text-muted"
          title={
            foreign > 0
              ? 'Priced in another currency. The real margin is on the Pricing screen, where the conversion happens.'
              : 'No cost recorded.'
          }
        >
          {foreign > 0 ? 'in FX' : '\u2014'}
        </span>
      );
    }

    const missing = servicesMissingCost(website);
    return (
      <span className={margin.profitMinor >= 0 ? 'text-accent-700' : 'text-coral-700'}>
        {formatPrice(margin.profitMinor)}
        <span className="ml-1 text-muted">({margin.marginPct}%)</span>
        {missing > 0 || foreign > 0 ? (
          <span
            className="ml-1 text-muted"
            title={[
              missing > 0
                ? `${missing} service${missing === 1 ? '' : 's'} with no cost recorded`
                : '',
              foreign > 0
                ? `${foreign} priced in another currency`
                : '',
            ]
              .filter(Boolean)
              .join(', ')
              .concat(', left out of this figure')}
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

      {selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-navy-900/15 bg-navy-900/[0.03] px-4 py-3">
          <p className="text-[13px] font-medium text-ink">
            {selected.size} selected
          </p>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {confirmingDelete ? (
              <>
                <p className="text-[13px] text-ink">
                  Delete {selected.size}{' '}
                  {selected.size === 1 ? 'website' : 'websites'} permanently?
                </p>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={pending}
                  onClick={() => runBulk(() => bulkDeleteWebsitesAction(selectedIds), 'deleted')}
                >
                  {pending ? 'Deleting...' : 'Yes, delete'}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setConfirmingDelete(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="accent"
                  disabled={pending}
                  onClick={() => runBulk(() => bulkSetWebsiteStatusAction(selectedIds, 'active'), 'published')}
                >
                  Publish
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => runBulk(() => bulkSetWebsiteStatusAction(selectedIds, 'draft'), 'moved to draft')}
                >
                  Draft
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => runBulk(() => bulkSetWebsiteStatusAction(selectedIds, 'paused'), 'paused')}
                >
                  Pause
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => runBulk(() => bulkSetWebsiteStatusAction(selectedIds, 'archived'), 'archived')}
                >
                  <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                  Archive
                </Button>
                {/* Deleting cannot be undone and a listing with orders cannot
                    be deleted at all, so it asks first and sits apart. */}
                <Button
                  size="sm"
                  variant="outline"
                  className="text-coral-700"
                  disabled={pending}
                  onClick={() => setConfirmingDelete(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Delete
                </Button>
                <Button size="sm" variant="ghost" onClick={clearSelection}>
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                  Clear
                </Button>
              </>
            )}
          </div>
        </div>
      ) : null}

      {result ? (
        <div
          role="status"
          className="rounded-[var(--radius-card)] border border-line bg-surface px-4 py-3 text-[13px]"
        >
          {result.error ? (
            <p className="text-coral-700">{result.error}</p>
          ) : (
            <p className="font-medium text-ink">
              {result.changed} {result.changed === 1 ? 'website' : 'websites'} {result.verb}
              {result.skipped.length > 0 ? `, ${result.skipped.length} skipped` : '.'}
            </p>
          )}

          {result.skipped.length > 0 ? (
            <ul className="mt-2 space-y-1 text-muted">
              {result.skipped.map((entry) => (
                <li key={entry.domain}>
                  <span className="font-medium text-ink">{entry.domain}</span> - {entry.reason}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <TableWrap>
        <Table>
          <caption className="sr-only">Website database</caption>
          <thead>
            <tr>
              <Th className="w-10">
                <label className="flex items-center justify-center">
                  <span className="sr-only">
                    {allVisibleSelected ? 'Clear selection' : 'Select all websites shown'}
                  </span>
                  <Checkbox
                    checked={allVisibleSelected}
                    indeterminate={someVisibleSelected}
                    // Nothing to select when a filter matches no rows, and a
                    // control that accepts a click and does nothing reads as
                    // broken.
                    disabled={visibleIds.length === 0}
                    onChange={(event) => toggleAllVisible(event.target.checked)}
                  />
                </label>
              </Th>
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
                  <label className="flex items-center justify-center">
                    <span className="sr-only">Select {website.domain}</span>
                    <Checkbox
                      checked={selected.has(website.id)}
                      onChange={(event) => toggleRow(website.id, event.target.checked)}
                    />
                  </label>
                </Td>
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
                            startTransition(async () => {
                              const result = await setWebsiteStatusAction(
                                website.id,
                                website.status === 'archived' ? 'active' : 'archived',
                              );
                              // Restoring a listing that was never priced is
                              // refused, and the reason is worth reading.
                              if (result?.error) window.alert(result.error);
                            });
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
