'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
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
import { ProgressBar } from '@/components/ui/progress-bar';
import { chunk } from '@/lib/utils/chunk';
import {
  BULK_CHUNK_SIZE,
  bulkProgressText,
  groupSkipped,
  type BulkProgress,
} from '@/lib/admin/bulk';
import { nicheName } from '@/lib/data/categories';
import { countryShortName } from '@/lib/data/countries';
import { formatCompactNumber, formatPrice, formatTurnaround } from '@/lib/utils/format';
import {
  servicesInForeignCurrency,
  servicesMissingCost,
  websiteMargin,
  websiteMarginConverted,
} from '@/lib/utils/margin';
import type { WebsiteListItem, WebsiteStatus } from '@/lib/types';

const statusFilters: { value: WebsiteStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'draft', label: 'Draft' },
  { value: 'paused', label: 'Paused' },
  { value: 'archived', label: 'Archived' },
];

export function AdminWebsitesTable({
  websites,
  trueCosts = {},
}: {
  websites: WebsiteListItem[];
  /**
   * What each listing costs us in GBP, by placement type, from the pricing
   * engine. Without it a publisher quoting in dollars can only be shown as
   * "not priced" - the raw number is not comparable with a sterling price.
   */
  trueCosts?: Record<string, Record<string, number>>;
}) {
  const router = useRouter();
  const [term, setTerm] = useState('');
  const [status, setStatus] = useState<WebsiteStatus | 'all'>('all');
  const [pending, startTransition] = useTransition();
  /** Live counts while a bulk action is running, so the bar means something. */
  const [progress, setProgress] = useState<BulkProgress | null>(null);

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

  /**
   * Run a bulk action over the selection, a chunk at a time.
   *
   * Three hundred listings in one request is close to a thousand database
   * round trips made one after another - it runs past the function ceiling
   * and answers nothing, so the page sits there looking broken while the work
   * actually happens. In pieces, every request returns, the bar moves on real
   * counts rather than an animation, and a run that dies half way has still
   * done exactly what it says it has.
   *
   * The refresh at the end is what the manual reload used to be: the table
   * re-reads from the database so the statuses on screen are the ones in it.
   */
  function runBulk(action: (ids: string[]) => Promise<BulkResult>, verb: string) {
    const ids = [...selected];
    if (ids.length === 0) return;

    setResult(null);
    setConfirmingDelete(false);

    startTransition(async () => {
      const chunks = chunk(ids, BULK_CHUNK_SIZE);
      let changed = 0;
      let done = 0;
      const skipped: BulkResult['skipped'] = [];
      let error: string | undefined;

      for (const part of chunks) {
        setProgress({ done, total: ids.length, changed, skipped, verb, finished: false });
        try {
          const outcome = await action(part);
          changed += outcome.changed;
          skipped.push(...outcome.skipped);
          // A refusal of the whole request - "nothing selected", an unknown
          // status - is about the action rather than the rows, so it stops
          // the run instead of being repeated thirteen times.
          if (outcome.error) {
            error = outcome.error;
            done += part.length;
            break;
          }
        } catch {
          // A chunk that never answered is not a chunk that did nothing, so
          // its rows are not claimed as skipped. The refresh below shows
          // which of them actually changed.
          skipped.push({
            domain: `${part.length} in one batch`,
            reason: 'That request did not answer. Check the statuses below before retrying.',
          });
        }
        done += part.length;
      }

      setProgress(null);
      setResult({ changed, skipped, error, verb });

      // Rows that were skipped stay selected, so the admin can see which ones
      // still need a decision rather than losing them from the selection.
      if (changed > 0) {
        const stillSkipped = new Set(skipped.map((entry) => entry.domain));
        setSelected(
          new Set(
            ids.filter((id) => {
              const row = websites.find((website) => website.id === id);
              return row ? stillSkipped.has(row.domain) || stillSkipped.has(id) : false;
            }),
          ),
        );
      }

      router.refresh();
    });
  }

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
  /**
   * The converted figure where the engine has one, the native one otherwise.
   *
   * A publisher quoting in dollars has no sterling cost until the engine has
   * converted it, so the engine's answer is preferred for every listing, not
   * only the foreign ones - otherwise a site would change which arithmetic it
   * was displayed with depending on where its publisher banks.
   */
  function marginOf(website: WebsiteListItem) {
    const converted = websiteMarginConverted(website, trueCosts[website.id]);
    if (converted) return { margin: converted, converted: true };

    const native = websiteMargin(website);
    return native ? { margin: native, converted: false } : null;
  }

  function costOf(website: WebsiteListItem) {
    const result = marginOf(website);
    if (!result) return <span className="text-muted">&mdash;</span>;

    return (
      <span
        title={
          result.converted
            ? 'What the placement costs us in GBP: the publisher\u2019s price converted at the stored rate, plus the FX buffer, the payment fee and any VAT they add.'
            : 'What we pay the publisher.'
        }
      >
        {formatPrice(result.margin.costMinor)}
      </span>
    );
  }

  function profitOf(website: WebsiteListItem) {
    const result = marginOf(website);
    const foreign = servicesInForeignCurrency(website);

    if (!result) {
      return (
        <span
          className="text-muted"
          title={
            foreign > 0
              ? 'Priced in another currency and not yet run through the engine. Recalculate on the Pricing screen and the GBP cost and profit appear here.'
              : 'No cost recorded.'
          }
        >
          &mdash;
        </span>
      );
    }

    const margin = result.margin;
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
                  onClick={() => runBulk((ids) => bulkDeleteWebsitesAction(ids), 'deleted')}
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
                  onClick={() => runBulk((ids) => bulkSetWebsiteStatusAction(ids, 'active'), 'published')}
                >
                  Publish
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => runBulk((ids) => bulkSetWebsiteStatusAction(ids, 'draft'), 'moved to draft')}
                >
                  Draft
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => runBulk((ids) => bulkSetWebsiteStatusAction(ids, 'paused'), 'paused')}
                >
                  Pause
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => runBulk((ids) => bulkSetWebsiteStatusAction(ids, 'archived'), 'archived')}
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

      {progress ? (
        <div className="rounded-[var(--radius-card)] border border-line bg-surface px-4 py-3">
          <ProgressBar
            done={progress.done}
            total={progress.total}
            label={bulkProgressText(progress)}
          />
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

          {/*
            Grouped by reason. Publishing a page of drafts usually fails the
            same way for all of them - approving a publisher's email records
            what they charge us and deliberately not what we charge - and
            three hundred identical sentences is a wall nobody reads, with
            the one row that failed differently lost in the middle of it.
          */}
          {result.skipped.length > 0 ? (
            <ul className="mt-2 space-y-1.5 text-muted">
              {groupSkipped(result.skipped).map((group) => (
                <li key={group.reason}>
                  <span className="font-medium text-ink">
                    {group.count} {group.count === 1 ? 'website' : 'websites'}
                  </span>{' '}
                  - {group.reason}
                  <span className="block text-[12px] text-muted">
                    {group.domains.join(', ')}
                    {group.count > group.domains.length
                      ? ` and ${group.count - group.domains.length} more`
                      : ''}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {/*
            The way out of the commonest refusal. Every listing sourced from
            an email arrives unpriced on purpose, so the first bulk publish
            after a batch of approvals skips all of them, and the fix is one
            screen away rather than on each listing.
          */}
          {result.skipped.some((entry) => entry.reason.includes('no sell price')) ? (
            <p className="mt-2 text-[13px]">
              <Link href="/admin/pricing" className="font-medium text-accent-700 hover:underline">
                Price them on the Pricing screen
              </Link>{' '}
              and publish again.
            </p>
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
