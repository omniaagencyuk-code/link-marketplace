'use client';

import Link from 'next/link';
import { Fragment, useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Archive,
  ChevronDown,
  ClipboardList,
  Copy,
  Download,
  MoreHorizontal,
  Pencil,
  Search,
  Eye,
  Trash2,
  X,
} from 'lucide-react';
import { Dropdown, DropdownItem } from '@/components/ui/dropdown';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { TableScroll } from '@/components/ui/table-scroll';
import { Pagination } from '@/components/ui/pagination';
import { DEFAULT_PAGE_SIZE, type PageSize } from '@/lib/admin/paging';
import { WebsiteStatusBadge } from '@/components/shared/status-badge';
import { WebsiteRateCard } from '@/components/admin/website-rate-card';
import {
  adminWebsiteDomainsAction,
  adminWebsiteIdsAction,
  adminWebsitePageAction,
  adminWebsitesByIdsAction,
  bulkDeleteWebsitesAction,
  bulkSetWebsiteStatusAction,
  duplicateWebsiteAction,
  setWebsiteStatusAction,
  type BulkResult,
} from '@/app/admin/actions';
import { ProgressBar } from '@/components/ui/progress-bar';
import { chunk } from '@/lib/utils/chunk';
import { csvFilename, toCsv } from '@/lib/admin/export-csv';
import { websiteExportColumns } from '@/lib/admin/website-export';
import { copyText, downloadTextFile } from '@/lib/admin/download';
import {
  BULK_CHUNK_SIZE,
  bulkProgressText,
  groupSkipped,
  type BulkProgress,
} from '@/lib/admin/bulk';
import { acceptedNicheLabel } from '@/lib/config/accepted-niches';
import { nicheName } from '@/lib/data/categories';
import { countryShortNameOrUnknown, countrySourceLabel } from '@/lib/data/countries';
import { formatCompactNumber, formatPrice, formatTurnaround } from '@/lib/utils/format';
import {
  generalMargin,
  losingPlacements,
  placementLabel,
  placementMargins,
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

/** How long a pause counts as having finished typing. */
const SEARCH_PAUSE_MS = 300;

/**
 * Listings per request when fetching a selection.
 *
 * The selection can be a whole filter - thousands - and Export wants every
 * row. Chunked rather than asked for in one go, and the server refuses an
 * oversized batch rather than trimming it, because a trimmed export is a file
 * missing rows with nothing saying so.
 */
const SELECTION_CHUNK = 200;

/**
 * Ids per request when fetching only domains.
 *
 * Higher than the row chunk because a domain is a string: no metrics, no
 * services, no contacts, and nothing priced. Twelve thousand listings is
 * twenty-five requests rather than sixty-two, and none of them prices
 * anything.
 *
 * Deliberately under the server's own limit rather than equal to it. A
 * request that returns exactly the cap is indistinguishable from one that was
 * truncated at it, and a response truncated without saying so is the bug this
 * whole path was just fixed for.
 */
const DOMAIN_CHUNK = 500;

/**
 * Above this, a selection is a backlog rather than a batch.
 *
 * Five hundred listings is twenty requests with the tab open, which is a
 * wait somebody will sit through. Seven thousand is two hundred and ninety,
 * and that is what the publisher inbox's run is for.
 */
const BACKLOG_SIZE = 500;

/** How many columns the header has, for the full-width rate card row. */
const COLUMNS = 13;

export function AdminWebsitesTable({ initialSearch = '' }: { initialSearch?: string }) {
  const router = useRouter();
  const [term, setTerm] = useState(initialSearch);
  const [status, setStatus] = useState<WebsiteStatus | 'all'>('all');
  /*
    The backlog 0077 exposed: 1,840 of 12,190 active listings with no
    category at all. Server-side, like the status filter beside it and
    unlike "show only these" below - this set spans every page, so a filter
    applied to the rows in hand would narrow fifty and call it the answer.
  */
  const [uncategorised, setUncategorised] = useState(false);
  const [pending, startTransition] = useTransition();
  /** Live counts while a bulk action is running, so the bar means something. */
  const [progress, setProgress] = useState<BulkProgress | null>(null);
  const [onlyLosing, setOnlyLosing] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  /**
   * Listings whose full rate card is open.
   *
   * By id rather than a single open row: comparing two publishers' gambling
   * rates means having both on screen, and closing one to open the other is
   * how somebody ends up comparing a number with their memory of a number.
   */
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  /* Bumped after a bulk action so the page is re-read rather than guessed at. */
  const [reloadKey, setReloadKey] = useState(0);

  function toggleExpanded(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // The verb belongs with the result: "3 websites updated" is wrong after a
  // delete, and quietly misreports what just happened to the data.
  const [result, setResult] = useState<(BulkResult & { verb: string }) | null>(null);

  /*
    One page, fetched.

    This component used to be handed every non-archived listing - 11,042 of
    them, with costs, contacts and commercials joined on - and filter, sort
    and page them here. That cost about a minute to open a table showing
    fifty rows, and no amount of server grew out of it: the read was
    twenty-three sequential round trips before any of it was mapped.

    The filters are unchanged, and so is what they mean. They are answered by
    the database now.
  */
  interface Answer {
    /** The query this answer is for. Anything else on screen is stale. */
    key: string;
    items: WebsiteListItem[];
    total: number;
    trueCosts: Record<string, TrueCostIndex>;
  }

  const [answer, setAnswer] = useState<Answer | null>(null);

  /*
    Debounced, because typing is not searching.

    Every keystroke used to be an array filter and free. It is a query now,
    and a domain typed in full would be a dozen of them with only the last
    answer wanted.
  */
  const [typed, setTyped] = useState(initialSearch);
  useEffect(() => {
    const timer = setTimeout(() => setTerm(typed), SEARCH_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [typed]);

  const queryKey = JSON.stringify([term, status, uncategorised, page, pageSize, reloadKey]);
  const current = answer?.key === queryKey ? answer : null;

  /*
    `loading` is derived from whether the answer matches what is being asked
    for, rather than being a flag the effect sets. Setting state synchronously
    inside an effect renders twice for every change, which React's own lint
    rule refuses - and the marketplace's fetch hook had to be rewritten for
    exactly this.
  */
  const loading = current === null;
  const total = current?.total ?? 0;
  /*
    Memoised, not just defaulted.

    `current?.items ?? []` is a fresh empty array on every render while the
    answer is stale, and everything downstream of it - the losing set, the
    visible rows, the selection - is a `useMemo` that would then recompute
    every time anything else on this screen changed.
  */
  const rows = useMemo(() => current?.items ?? [], [current]);
  const trueCosts = useMemo<Record<string, TrueCostIndex>>(() => current?.trueCosts ?? {}, [current]);

  useEffect(() => {
    let live = true;
    adminWebsitePageAction({ search: term, status, uncategorised, page, pageSize })
      .then((found) => {
        if (!live) return;
        setAnswer({
          key: queryKey,
          items: found.items as WebsiteListItem[],
          total: found.total,
          trueCosts: found.trueCosts as Record<string, TrueCostIndex>,
        });
      })
      .catch(() => {
        if (!live) return;
        setAnswer({ key: queryKey, items: [], total: 0, trueCosts: {} });
        setResult({ changed: 0, skipped: [], error: 'Could not load the website list.', verb: 'loaded' });
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);

  /**
   * Listings on this page selling a placement at or below what it costs us.
   *
   * The engine cannot produce one - it adds the band's markup, lifts it to
   * the minimum margin and rounds up - so these come from a price set by
   * hand, or from a publisher raising their price after we priced them.
   *
   * Computed over the page rather than the inventory, which is the one thing
   * this change costs: "only losing" now narrows what is on screen rather
   * than searching all of it. Doing it across the inventory means pricing
   * every listing on every page load, which is the minute this removed.
   */
  const losing = useMemo(
    () =>
      new Set(
        rows
          .filter(
            (website) => losingPlacements(placementMargins(website, trueCosts[website.id])).length > 0,
          )
          .map((website) => website.id),
      ),
    [rows, trueCosts],
  );

  const visible = useMemo(
    () => (onlyLosing ? rows.filter((website) => losing.has(website.id)) : rows),
    [rows, onlyLosing, losing],
  );

  /*
    Already one page, so the shape is built rather than sliced.

    `paginate` did the arithmetic when the whole list was here. The numbers it
    produced are what the footer renders - which row to which row, of how many
    - and they have to keep meaning the same thing now the slicing happens in
    the database. The off-by-ones here are the kind that look right and are
    not, which is why that module says so in its own header.
  */
  const size = pageSize || DEFAULT_PAGE_SIZE;
  const pages = Math.max(1, Math.ceil(total / size));
  const paged = {
    rows: visible,
    page: Math.min(page, pages),
    pages,
    total,
    from: total === 0 ? 0 : (Math.min(page, pages) - 1) * size + 1,
    to: (Math.min(page, pages) - 1) * size + visible.length,
  };

  /*
    Back to the first page whenever the set changes underneath.

    Done where the filter changes rather than in an effect watching it.
    Clamping alone would leave somebody on page 3 of a list that just became
    one row, and an effect that calls setState is a second render for
    something the click already knew.
  */
  function filterTo(change: () => void) {
    change();
    setPage(1);
  }

  // Select-all applies to what the filter matches, not to the whole database.
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

  /*
    The whole filter, not the page.

    This checkbox has always meant "everything these filters match" - ticking
    it after filtering to "draft" is how a couple of hundred listings get
    status-changed in one go - and paging the table in the database would
    quietly have turned it into "these fifty".

    So the ids are fetched. Ids only: eleven thousand uuids is a few hundred
    kilobytes, and none of the data a row renders comes with them.
  */
  function toggleAllVisible(on: boolean) {
    setResult(null);
    setConfirmingDelete(false);

    if (!on) {
      setSelected(new Set());
      return;
    }

    startTransition(async () => {
      try {
        const ids = await adminWebsiteIdsAction({ search: term, status, uncategorised });
        setSelected(new Set(ids));

        /*
          A short selection is never allowed to look like a whole one.

          This read was capped at a thousand rows by the server for a while
          and said nothing: the box reported "1000 selected" against 12,246
          listings, and a bulk action on that selection would have reported
          success having touched the first thousand. The count is checked
          against the filter's own total now, so a selection that does not
          match the filter is visible before anything is run on it.
        */
        if (total > 0 && ids.length !== total) {
          setResult({
            changed: 0,
            skipped: [],
            error:
              `Selected ${ids.length.toLocaleString('en-GB')} listings, but the filter matches ` +
              `${total.toLocaleString('en-GB')}. Reload the page before running anything on this selection.`,
            verb: 'selected',
          });
        }
      } catch {
        setResult({
          changed: 0,
          skipped: [],
          error: 'Could not work out which listings the filter matches.',
          verb: 'selected',
        });
      }
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
      /* Listings in a request that never answered, which is not the same as
         listings that did not change. */
      const unanswered = new Set<string>();
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
          for (const id of part) unanswered.add(id);
        }
        done += part.length;
      }

      setProgress(null);
      setResult({ changed, skipped, error, verb });

      /*
        Rows that were skipped stay selected, so the admin can see which ones
        still need a decision rather than losing them from the selection.

        By id, which the action now reports. Matching the skipped domains
        against the rows on screen was right while this component held the
        whole inventory; with the database paging it, a listing skipped on page
        nine is not among the fifty here and would be dropped from the
        selection silently - exactly the row somebody needs to go and look at.
      */
      if (changed > 0) {
        const keep = new Set<string>(unanswered);
        for (const entry of skipped) {
          if (entry.id) keep.add(entry.id);
        }
        setSelected(new Set(ids.filter((id) => keep.has(id))));
      }

      setReloadKey((key) => key + 1);
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

    // By topic as well as placement: this column is the general rate, and a
    // listing with no general cost but a gambling one would otherwise print
    // the gambling cost beside the general price.
    const margin = generalMargin(marginsFor(website), service.type);

    return (
      <>
        <span className="block text-ink-soft">{formatPrice(service.priceMinor)}</span>
        {!margin ? (
          /*
            Two different states, and they used to read the same.

            A publisher quoting in another currency has a cost - we just
            cannot subtract it from our price until the engine has converted
            it, applied the buffer and the payment fee. Printing "no cost"
            against their number sent somebody looking for a price that was
            already recorded. Their figure is shown instead, in their money,
            so the row says which of the two jobs it needs.
          */
          service.costPriceMinor != null ? (
            <span
              className="block text-[11px] text-muted"
              title={`The publisher charges ${service.costCurrency ?? 'an unrecorded currency'}. Recalculate on the Pricing screen and the converted cost and margin appear here.`}
            >
              {service.costCurrency
                ? `${formatPrice(service.costPriceMinor, { currency: service.costCurrency })} · not converted`
                : 'cost in an unrecorded currency'}
            </span>
          ) : (
            <span
              className="block text-[11px] text-muted"
              title="Nothing has been recorded for what this placement costs us, so it cannot be priced."
            >
              no cost recorded
            </span>
          )
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
   * The selection as a spreadsheet.
   *
   * Fetched, not filtered. The selection can be a whole filter rather than the
   * page on screen, and the table no longer holds those rows - so they are
   * asked for in chunks when the button is pressed, which is also the only
   * moment anybody wants them.
   *
   * It carries costs and publisher contacts, which is the point - it is the
   * file you reconcile from - and it is why this button lives behind the
   * admin session like everything else on this page.
   *
   * Twelve thousand listings is sixty-two requests, so it reports progress.
   * A button that looks like it did nothing for two minutes gets pressed
   * again, and then there are two of them running.
   */
  async function selectedRows(): Promise<{
    items: WebsiteListItem[];
    costs: Record<string, TrueCostIndex>;
    /** How many were selected, so a short answer can be seen as short. */
    asked: number;
  }> {
    const ids = [...selected];
    const items: WebsiteListItem[] = [];
    let costs: Record<string, TrueCostIndex> = {};

    /*
      A chunk that fails is counted, not thrown.

      Throwing here means the button does nothing at all, and swallowing it
      means a file quietly missing rows - which is the failure the server's
      cap refuses rather than trims, for the same reason. So the loop keeps
      going and the caller is told how many of the selection it actually got.
    */
    for (const group of chunk(ids, SELECTION_CHUNK)) {
      setProgress({
        done: items.length,
        total: ids.length,
        changed: items.length,
        skipped: [],
        verb: 'read',
        finished: false,
      });
      try {
        const answer = await adminWebsitesByIdsAction(group);
        items.push(...(answer.items as WebsiteListItem[]));
        costs = { ...costs, ...(answer.trueCosts as Record<string, TrueCostIndex>) };
      } catch {
        // Nothing pushed, so the shortfall shows up in the count below.
      }
    }
    setProgress(null);
    return { items, costs, asked: ids.length };
  }

  /**
   * The domains behind the selection, and nothing else.
   *
   * What Copy domains is for: a list to paste into somebody else's tool.
   * It used to go through `selectedRows`, which reads costs, contacts and
   * commercials and prices every listing, to use one column of the answer -
   * sixty-two requests for twelve thousand domains instead of twenty-five,
   * and every one of them pricing listings nobody was going to look at.
   */
  async function selectedDomains(): Promise<{ domains: string[]; asked: number }> {
    const ids = [...selected];
    const domains: string[] = [];

    for (const group of chunk(ids, DOMAIN_CHUNK)) {
      setProgress({
        done: domains.length,
        total: ids.length,
        changed: domains.length,
        skipped: [],
        verb: 'read',
        finished: false,
      });
      try {
        const answer = await adminWebsiteDomainsAction(group);
        domains.push(...answer.map((row) => row.domain));
      } catch {
        // Counted as a shortfall rather than losing the whole list.
      }
    }
    setProgress(null);
    return { domains, asked: ids.length };
  }

  /** "1,840 of 1,900 selected" when some could not be read, and nothing when
      they all could. A file missing rows has to say that it is. */
  function shortfall(got: number, asked: number): BulkResult['skipped'] {
    if (got >= asked) return [];
    return [
      {
        domain: `${asked - got} of ${asked} selected`,
        reason: 'Could not be read, so they are not in this. Try again for the rest.',
      },
    ];
  }

  function exportSelected() {
    if (selected.size === 0) return;
    startTransition(async () => {
      const { items: chosen, costs, asked } = await selectedRows();
      if (chosen.length === 0) {
        setResult({
          changed: 0,
          skipped: [],
          error: 'Could not read the selected listings, so there is nothing to export.',
          verb: 'exported',
        });
        return;
      }

      downloadTextFile(
        csvFilename('press-parrot-websites'),
        toCsv(chosen, websiteExportColumns(costs)),
      );
      setResult({
        changed: chosen.length,
        skipped: shortfall(chosen.length, asked),
        verb: `exported to ${csvFilename('press-parrot-websites')}`,
      });
    });
  }

  /**
   * Just the domains, one per line.
   *
   * What a bulk checker's paste box wants. Downloading a spreadsheet, opening
   * it and copying a column is four steps to get a list somebody already has
   * on screen - and the spreadsheet on the way through carries what we pay
   * publishers into a third-party tool that has no business seeing it.
   */
  function copyDomains() {
    if (selected.size === 0) return;
    startTransition(async () => {
      const { domains, asked } = await selectedDomains();
      if (domains.length === 0) {
        setResult({
          changed: 0,
          skipped: [],
          error: 'Could not read the selected listings, so there are no domains to copy.',
          verb: 'copied',
        });
        return;
      }
      const copied = await copyText(domains.join('\n'));
      setResult({
        changed: copied ? domains.length : 0,
        skipped: copied
          ? shortfall(domains.length, asked)
          : [{ domain: 'Clipboard', reason: 'The browser would not allow it. Use the CSV export instead.' }],
        verb: 'copied, one per line',
      });
    });
  }

  /**
   * Is there anything the row does not already show?
   *
   * A topic the publisher prices differently, or a placement without a column
   * of its own. Everywhere else the two price cells and the margin are the
   * whole story, and an expander would open on a repeat of them.
   */
  function hasMoreToShow(website: WebsiteListItem): boolean {
    if (website.nichePrices.some((price) => price.priceMinor > 0)) return true;
    // A topic that costs differently with no price of its own - the state a
    // listing is in between approving a publisher's email and the next
    // pricing run, and the one most worth opening.
    if (Object.keys(trueCosts[website.id] ?? {}).some((niche) => niche !== '')) return true;
    return website.services.some(
      (service) => service.type !== 'guest-post' && service.type !== 'niche-edit',
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
            onChange={(event) => filterTo(() => setTyped(event.target.value))}
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
            onChange={(event) =>
              filterTo(() => setStatus(event.target.value as WebsiteStatus | 'all'))
            }
          >
            {statusFilters.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-44">
          <label htmlFor="admin-category-filter" className="sr-only">
            Filter by category
          </label>
          <Select
            id="admin-category-filter"
            size="sm"
            value={uncategorised ? 'none' : 'any'}
            onChange={(event) =>
              filterTo(() => setUncategorised(event.target.value === 'none'))
            }
          >
            <option value="any">Any category</option>
            <option value="none">Not categorised</option>
          </Select>
        </div>
        <p className="tabular text-[13px] text-muted">
          {loading
            ? 'Loading…'
            : `${total.toLocaleString('en-GB')} ${total === 1 ? 'website' : 'websites'}`}
        </p>
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
            <Button
              size="sm"
              variant="outline"
              onClick={() => filterTo(() => setOnlyLosing((on) => !on))}
            >
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
            {selected.size.toLocaleString('en-GB')} selected
          </p>

          {/*
            A backlog is not a batch.

            These buttons send twenty-five listings a request with the tab
            held open, which is right for a few hundred and is five minutes of
            waiting for seven thousand. The publisher inbox starts a run that
            cron carries on instead, with the same guard on every listing.
          */}
          {selected.size > BACKLOG_SIZE ? (
            <p className="text-[12px] text-muted">
              Publishing this many?{' '}
              <Link href="/admin/sourcing" className="underline hover:text-ink">
                Start a run from the publisher inbox
              </Link>{' '}
              and close the tab.
            </p>
          ) : null}

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {/*
              Export and copy sit before the status buttons and outside the
              delete confirmation: they change nothing, and a read-only action
              should never be one row away from a destructive one.
            */}
            {!confirmingDelete ? (
              <>
                <Button size="sm" variant="outline" disabled={pending} onClick={copyDomains}>
                  <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />
                  Copy domains
                </Button>
                <Button size="sm" variant="outline" onClick={exportSelected}>
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  Export CSV
                </Button>
                <span aria-hidden="true" className="mx-1 h-5 w-px bg-line" />
              </>
            ) : null}

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

      <TableScroll storageKey="admin.websites.height" label="website list">
        <Table>
          <caption className="sr-only">Website database</caption>
          <thead>
            <tr>
              {/* Counted in COLUMNS below, which the expanded rate card row
                  spans. A header added without touching that constant leaves
                  a gap down the side of the panel. */}
              <Th className="w-10">
                <label className="flex items-center justify-center">
                  <span className="sr-only">
                    {allVisibleSelected
                      ? 'Clear selection'
                      : `Select all ${visibleIds.length} websites the filter matches`}
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
            {paged.rows.map((website) => (
              <Fragment key={website.id}>
              <Tr>
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
                <Td className="text-[13px] text-ink-soft">
                  {/* Hover says where it came from. Added because "why does
                      this say UK?" had no answer for 1,645 listings: the
                      country was a default nothing recorded. */}
                  <span title={countrySourceLabel(website.countrySource)}>
                    {countryShortNameOrUnknown(website.country)}
                  </span>
                </Td>
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
                <Td className="tabular text-right text-[13px]">
                  {/*
                    A toggle only where there is more than the row already
                    shows - a topic rate, or a placement beyond the two with
                    columns of their own. A chevron on every row that reveals
                    nothing new is noise in three hundred of them.
                  */}
                  {hasMoreToShow(website) ? (
                    <button
                      type="button"
                      onClick={() => toggleExpanded(website.id)}
                      aria-expanded={expanded.has(website.id)}
                      className="inline-flex items-center gap-1 rounded hover:bg-surface-sunken"
                      title="Every rate this publisher charges, and what each one leaves"
                    >
                      {marginCell(website)}
                      <ChevronDown
                        className={`h-3.5 w-3.5 shrink-0 text-muted transition-transform ${
                          expanded.has(website.id) ? 'rotate-180' : ''
                        }`}
                        aria-hidden="true"
                      />
                    </button>
                  ) : (
                    marginCell(website)
                  )}
                </Td>
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

              {expanded.has(website.id) ? (
                <tr>
                  <td colSpan={COLUMNS} className="border-b border-line bg-surface-sunken p-3">
                    <WebsiteRateCard website={website} costs={trueCosts[website.id]} />
                  </td>
                </tr>
              ) : null}
              </Fragment>
            ))}
          </tbody>
        </Table>
      </TableScroll>

      <Pagination
        paged={paged}
        size={pageSize}
        noun="websites"
        allowAll={false}
        onPage={setPage}
        onSize={(next) => {
          setPageSize(next);
          // Back to the first page: staying on page 7 while the page size
          // trebles lands somewhere nobody asked to be.
          setPage(1);
        }}
      />
    </div>
  );
}
