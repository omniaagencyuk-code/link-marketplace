'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Archive, Copy, MoreHorizontal, Pencil, Search, Eye, Trash2, X } from 'lucide-react';
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
import { acceptedNicheLabel } from '@/lib/config/accepted-niches';
import { nicheName } from '@/lib/data/categories';
import { countryShortName } from '@/lib/data/countries';
import { formatCompactNumber, formatPrice, formatTurnaround } from '@/lib/utils/format';
import {
  losingPlacements,
  placementLabel,
  placementMargins,
  servicesInForeignCurrency,
  worstPlacement,
  type PlacementMargin,
  type TrueCostIndex,
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
   * What each listing costs us in our own currency, by niche and then
   * placement, from the pricing engine. Without it a publisher quoting in
   * another currency can only be shown as "not priced" - their raw number is
   * not comparable with our price.
   */
  trueCosts?: Record<string, TrueCostIndex>;
}) {
  const router = useRouter();
  const [term, setTerm] = useState('');
  const [status, setStatus] = useState<WebsiteStatus | 'all'>('all');
  const [pending, startTransition] = useTransition();
  /** Live counts while a bulk action is running, so the bar means something. */
  const [progress, setProgress] = useState<BulkProgress | null>(null);
  const [onlyLosing, setOnlyLosing] = useState(false);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // The verb belongs with the result: "3 websites updated" is wrong after a
  // delete, and quietly misreports what just happened to the data.
  const [result, setResult] = useState<(BulkResult & { verb: string }) | null>(null);

  /**
   * Listings selling a placement at or below what it costs us.
   *
   * The engine cannot produce one - it adds the band's markup, lifts it to
   * the minimum margin and rounds up - so these come from a price set by
   * hand, or from a publisher raising their price after we priced them, which
   * moves the cost and leaves the sell price where it was. Nothing shouts
   * when that happens, so it is counted here and the count is a filter.
   */
  const losing = useMemo(
    () =>
      new Set(
        websites
          .filter(
            (website) => losingPlacements(placementMargins(website, trueCosts[website.id])).length > 0,
          )
          .map((website) => website.id),
      ),
    [websites, trueCosts],
  );

  const rows = useMemo(() => {
    const needle = term.trim().toLowerCase();
    return websites.filter((website) => {
      if (onlyLosing && !losing.has(website.id)) return false;
      if (status !== 'all' && website.status !== status) return false;
      if (!needle) return true;
      return `${website.domain} ${website.title} ${website.niche}`.toLowerCase().includes(needle);
    });
  }, [websites, term, status, onlyLosing, losing]);

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
   * What each placement on this listing makes us.
   *
   * Per placement, never summed. The row used to add both prices together and
   * both costs together and print one profit underneath, which describes a
   * sale nobody makes: a customer buys a guest post or a niche edit, not
   * both. It also hid the thing this table exists to show - a fat guest post
   * margin covers a niche edit sold below cost, and the total still reads
   * healthy.
   */
  function marginsFor(website: WebsiteListItem): PlacementMargin[] {
    return placementMargins(website, trueCosts[website.id]);
  }

  /**
   * One placement's price, with what it costs us and what it leaves.
   *
   * The cost sits under the price it belongs to rather than in a column of
   * its own, because there is no single cost for a listing - only a cost per
   * thing somebody can buy.
   */
  function placementCell(website: WebsiteListItem, type: string) {
    const service = website.services.find((candidate) => candidate.type === type);
    if (!service) return <span className="text-muted">&mdash;</span>;

    const margin = marginsFor(website).find((entry) => entry.type === type);

    return (
      <>
        <span className="block text-ink-soft">{formatPrice(service.priceMinor)}</span>
        {!margin ? (
          <span
            className="block text-[11px] text-muted"
            title={
              servicesInForeignCurrency(website) > 0
                ? 'Priced in another currency and not yet run through the engine. Recalculate on the Pricing screen and the cost appears here.'
                : 'No cost recorded for this placement.'
            }
          >
            no cost
          </span>
        ) : margin.unpriced ? (
          <span
            className="block text-[11px] text-muted"
            title="Costs us this much, with no sell price set yet. Nothing can be bought until it is priced."
          >
            costs {formatPrice(margin.costMinor)}
          </span>
        ) : (
          <span
            className={`block text-[11px] ${margin.profitMinor > 0 ? 'text-muted' : 'text-coral-700'}`}
            title={
              margin.converted
                ? 'The publisher\u2019s price converted at the stored rate, plus the FX buffer, the payment fee and any VAT they add.'
                : 'What we pay the publisher.'
            }
          >
            {/* Labelled, because a bare pair of numbers under a price reads
                as a range. */}
            cost {formatPrice(margin.costMinor)} &middot;{' '}
            {margin.profitMinor > 0 ? '+' : ''}
            {formatPrice(margin.profitMinor)}
          </span>
        )}
      </>
    );
  }

  /**
   * The thinnest margin on the listing, across everything sellable.
   *
   * Including the rate card: a gambling guest post is a different thing at a
   * different price against a different cost, and it is the one most likely
   * to be under water - the publisher charges more for it, and until this
   * looked at it a site could sell gambling at the general price while paying
   * the sensitive rate.
   *
   * The worst case is the one worth knowing in a column somebody scans three
   * hundred rows of, because the best case is never the one losing money.
   */
  function marginCell(website: WebsiteListItem) {
    const margins = marginsFor(website);
    const worst = worstPlacement(margins);

    if (!worst) {
      const unpriced = margins.filter((margin) => margin.unpriced).length;
      return (
        <span
          className="text-muted"
          title={
            unpriced > 0
              ? 'Nothing has a sell price yet, so there is no margin to show. Price it on the Pricing screen.'
              : 'No cost recorded, so no margin can be worked out.'
          }
        >
          &mdash;
        </span>
      );
    }

    const priced = margins.filter((margin) => !margin.unpriced).length;
    const rateCard = margins.filter((margin) => margin.niche !== null).length;
    return (
      <span
        className={worst.profitMinor > 0 ? 'text-accent-700' : 'text-coral-700'}
        title={
          priced > 1
            ? `The thinnest of ${priced} rates${rateCard > 0 ? ` (${rateCard} of them per topic)` : ''}: ${placementLabel(worst)} at ${worst.marginPct}%.`
            : `${placementLabel(worst)} at ${worst.marginPct}%.`
        }
      >
        {worst.marginPct}%
        {/* A listing whose worst rate is a topic rate rather than the general
            one, marked so the column is not read as being about guest posts
            and niche edits alone. */}
        {worst.niche ? (
          <span className="block text-[11px] text-muted">{acceptedNicheLabel(worst.niche)}</span>
        ) : null}
      </span>
    );
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

      {losing.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-coral-200 bg-coral-50 px-4 py-3 text-[13px]">
          <AlertTriangle className="h-4 w-4 shrink-0 text-coral-700" aria-hidden="true" />
          <p className="text-coral-700">
            <span className="font-medium">
              {losing.size} {losing.size === 1 ? 'listing sells' : 'listings sell'} something at or
              below cost.
            </span>{' '}
            Counted across the topic rates as well as the general ones, since a publisher charges
            more for gambling than for anything else. The engine never prices below the minimum
            margin, so either the price was set by hand or the publisher has put theirs up since.
          </p>
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setOnlyLosing((on) => !on)}>
              {onlyLosing ? 'Show all' : 'Show only these'}
            </Button>
            <Button asChild size="sm" variant="accent">
              <Link href="/admin/pricing">Reprice</Link>
            </Button>
          </div>
        </div>
      ) : null}

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
              {/* Price, then what it costs us and what it leaves, per
                  placement. There is no single cost for a listing - only a
                  cost per thing somebody can buy - so the old Cost and Profit
                  columns, which summed both, have gone. */}
              <Th className="text-right">Guest post</Th>
              <Th className="text-right">Niche edit</Th>
              <Th className="text-right">Margin</Th>
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
                <Td className="tabular text-right text-[13px] whitespace-nowrap">
                  {placementCell(website, 'guest-post')}
                </Td>
                <Td className="tabular text-right text-[13px] whitespace-nowrap">
                  {placementCell(website, 'niche-edit')}
                </Td>
                <Td className="tabular text-right text-[13px]">{marginCell(website)}</Td>
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
