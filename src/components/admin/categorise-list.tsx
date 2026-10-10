'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Check, ExternalLink, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { nicheName } from '@/lib/data/categories';
import {
  applyCategoryAction,
  readHomepageAction,
  readHomepagesAction,
} from '@/app/admin/(protected)/categorise/actions';
import { bulkProgressPercent, bulkProgressText, type BulkProgress } from '@/lib/admin/bulk';
import type { CategoryRead } from '@/lib/services/category-read-service';

/**
 * The uncategorised backlog, one homepage at a time.
 *
 * Two things this screen is built around.
 *
 * The quote is shown, not hidden behind the category. What is being reviewed
 * is whether the page says what the model claims it says, and a category on
 * its own is something to agree with rather than something to check -
 * `readNiche` has already confirmed the sentence is really in the page, so
 * what is left for a person is whether it means what the model took it to
 * mean.
 *
 * A declined read is shown as plainly as a proposal. "The model could not
 * tell" and "nobody has looked yet" are different states, and a screen that
 * showed only successes would offer the same empty row for both - so the
 * same site would be read again and again at the same cost.
 */

/**
 * How many sites go in one request.
 *
 * The action caps at the same figure; this is the client's half of that
 * agreement, and it is what keeps the bar moving - one request for the whole
 * selection would be a single silence however long it took.
 */
const BATCH = 24;

/** What each refusal means, in words a reviewer can act on. */
const WHY: Record<string, string> = {
  'model-said-unknown': 'The homepage does not say what the site is about.',
  'below-the-floor': 'Too unsure to be worth your time.',
  'no-quote': 'No sentence was offered as evidence.',
  'quote-not-on-the-page': 'It quoted a sentence the page does not contain.',
  'could-not-read-the-page': 'The page could not be fetched or had nothing to read.',
  'the-model-call-failed': 'The model call failed.',
};

export function CategoriseList({
  websites,
  reads,
  total,
  page,
  pageSize,
}: {
  websites: { id: string; slug: string; domain: string; title: string }[];
  reads: Record<string, CategoryRead>;
  total: number;
  page: number;
  pageSize: number;
}) {
  const [busy, startTransition] = useTransition();
  const [live, setLive] = useState<Record<string, CategoryRead>>(reads);
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [working, setWorking] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /** Live counts while a batch runs, so the bar means something. */
  const [progress, setProgress] = useState<BulkProgress | null>(null);

  const ids = websites.map((website) => website.id);
  const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));
  const someSelected = !allSelected && ids.some((id) => selected.has(id));

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /*
    Select-all is this page, not the backlog.

    Seventy-four pages of them, and a control that quietly selected 1,840
    sites would put a four-figure fetch behind one click. The count beside
    the button says which it is.
  */
  function toggleAll() {
    setSelected((current) => {
      const next = new Set(current);
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  }

  /** The selected rows that are worth reading or worth accepting. */
  const chosen = ids.filter((id) => selected.has(id));
  const readable = chosen.filter((id) => !applied.has(id) && !live[id]?.appliedAt);
  const acceptable = chosen.filter(
    (id) => live[id]?.niche && !applied.has(id) && !live[id]?.appliedAt,
  );

  /*
    In batches, with the answers landing as they arrive.

    One request for the whole selection is one long silence and, past a
    certain size, a function that never answers. The server reads eight at a
    time inside each batch, which is the politeness limit rather than a
    speed choice.
  */
  function readSelected() {
    const queue = [...readable];
    if (queue.length === 0) return;
    setProgress({ done: 0, total: queue.length, changed: 0, skipped: [], verb: 'read', finished: false });

    startTransition(async () => {
      let done = 0;
      let changed = 0;
      for (let from = 0; from < queue.length; from += BATCH) {
        const group = queue.slice(from, from + BATCH);
        try {
          const found = await readHomepagesAction(group);
          setLive((current) => ({ ...current, ...found }));
          changed += Object.values(found).filter((read) => read.niche).length;
        } catch {
          // A batch that failed is still a batch that is over. The rows stay
          // unread and can be tried again; losing the rest of the run
          // because one request died would be worse.
        }
        done += group.length;
        setProgress({ done, total: queue.length, changed, skipped: [], verb: 'read', finished: false });
      }
      setProgress({ done, total: queue.length, changed, skipped: [], verb: 'read', finished: true });
    });
  }

  function acceptSelected() {
    const queue = [...acceptable];
    if (queue.length === 0) return;
    setProgress({ done: 0, total: queue.length, changed: 0, skipped: [], verb: 'categorised', finished: false });

    startTransition(async () => {
      let done = 0;
      let changed = 0;
      for (const id of queue) {
        try {
          const { applied: ok } = await applyCategoryAction(id);
          if (ok) {
            changed += 1;
            setApplied((current) => new Set(current).add(id));
          }
        } catch {
          // Counted as done and not as changed, which is what the bar says.
        }
        done += 1;
        setProgress({ done, total: queue.length, changed, skipped: [], verb: 'categorised', finished: false });
      }
      setProgress({ done, total: queue.length, changed, skipped: [], verb: 'categorised', finished: true });
    });
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function read(websiteId: string) {
    setWorking(websiteId);
    startTransition(async () => {
      const result = await readHomepageAction(websiteId);
      if (result) setLive((current) => ({ ...current, [websiteId]: result }));
      setWorking(null);
    });
  }

  function apply(websiteId: string) {
    setWorking(websiteId);
    startTransition(async () => {
      const { applied: ok } = await applyCategoryAction(websiteId);
      if (ok) setApplied((current) => new Set(current).add(websiteId));
      setWorking(null);
    });
  }

  if (websites.length === 0) {
    return (
      <p className="text-[14px] text-muted">
        Nothing to categorise - every active listing has a category.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-muted">
        <span className="tabular font-medium text-ink">{total.toLocaleString('en-GB')}</span>{' '}
        active {total === 1 ? 'listing has' : 'listings have'} no category. Showing page{' '}
        {page} of {totalPages}.
      </p>

      {progress ? (
        <div className="rounded-[var(--radius-card)] border border-line bg-white p-4">
          <p className="text-[13px] text-ink">{bulkProgressText(progress)}</p>
          <div
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-sunken"
            role="progressbar"
            aria-valuenow={bulkProgressPercent(progress.done, progress.total)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-accent-600 transition-[width]"
              style={{ width: `${bulkProgressPercent(progress.done, progress.total)}%` }}
            />
          </div>
          {progress.finished ? (
            <Button
              size="sm"
              variant="ghost"
              className="mt-2"
              onClick={() => setProgress(null)}
            >
              Dismiss
            </Button>
          ) : null}
        </div>
      ) : null}

      {chosen.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-navy-900/15 bg-navy-900/[0.03] px-4 py-3">
          <p className="text-[13px] font-medium text-ink">
            {chosen.length} selected on this page
          </p>
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || readable.length === 0}
              onClick={readSelected}
            >
              <Search className="h-3.5 w-3.5" aria-hidden="true" />
              Read {readable.length} {readable.length === 1 ? 'homepage' : 'homepages'}
            </Button>
            {/* Only ever the ones already carrying a proposal. Accepting is
                the step that writes a category, so it cannot be the thing
                that also decides what the category is. */}
            <Button
              size="sm"
              variant="accent"
              disabled={busy || acceptable.length === 0}
              onClick={acceptSelected}
            >
              Accept {acceptable.length}
            </Button>
          </div>
        </div>
      ) : null}

      <TableWrap>
        <Table>
          <caption className="sr-only">
            Active listings with no category, and what reading their homepage found
          </caption>
          <thead>
            <tr>
              <Th className="w-8 pr-0">
                <Checkbox
                  checked={allSelected}
                  indeterminate={someSelected}
                  onChange={toggleAll}
                  aria-label="Select every listing on this page"
                />
              </Th>
              <Th>Website</Th>
              <Th>What its homepage says</Th>
              <Th className="text-right">
                <span className="sr-only">Actions</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {websites.map((website) => {
              const found = live[website.id];
              const isApplied = applied.has(website.id) || Boolean(found?.appliedAt);
              const pending = busy && working === website.id;

              return (
                <Tr key={website.id}>
                  <Td className="pr-0 align-top">
                    <Checkbox
                      checked={selected.has(website.id)}
                      onChange={() => toggle(website.id)}
                      aria-label={`Select ${website.domain}`}
                    />
                  </Td>
                  <Td className="align-top">
                    <div className="flex items-center gap-1.5">
                      <Link
                        href={`/websites/${website.slug}`}
                        className="text-[14px] font-semibold text-ink hover:text-accent-700"
                      >
                        {website.domain}
                      </Link>
                      <a
                        href={`https://${website.domain}`}
                        target="_blank"
                        rel="noreferrer noopener nofollow"
                        className="text-accent-600 hover:text-accent-700"
                        aria-label={`Open ${website.domain} in a new tab`}
                      >
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                    </div>
                    <p className="mt-0.5 text-[12px] text-muted">{website.title}</p>
                  </Td>

                  <Td className="align-top">
                    {!found ? (
                      <span className="text-[13px] text-muted">Not read yet.</span>
                    ) : found.niche ? (
                      <div className="space-y-1">
                        <p className="text-[13px] text-ink">
                          <span className="font-semibold">{nicheName(found.niche)}</span>
                          <span className="tabular ml-2 text-[12px] text-muted">
                            {found.confidence}% sure
                          </span>
                        </p>
                        {/* The sentence it was read from, which is the thing
                            actually being judged. */}
                        <p className="border-l-2 border-line pl-2 text-[12px] leading-relaxed text-ink-soft">
                          &ldquo;{found.quote}&rdquo;
                        </p>
                        {found.reason ? (
                          <p className="text-[12px] text-muted">{found.reason}</p>
                        ) : null}
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <p className="text-[13px] text-ink-soft">
                          {WHY[found.declinedBecause ?? ''] ?? 'No category was proposed.'}
                        </p>
                        {found.reason ? (
                          <p className="text-[12px] text-muted">{found.reason}</p>
                        ) : null}
                      </div>
                    )}
                  </Td>

                  <Td className="align-top text-right">
                    <div className="flex items-center justify-end gap-2">
                      {isApplied ? (
                        <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent-700">
                          <Check className="h-3.5 w-3.5" aria-hidden="true" />
                          Applied
                        </span>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={pending}
                            onClick={() => read(website.id)}
                          >
                            <Search className="h-3.5 w-3.5" aria-hidden="true" />
                            {found ? 'Read again' : 'Read homepage'}
                          </Button>
                          {found?.niche ? (
                            <Button
                              size="sm"
                              variant="accent"
                              disabled={pending}
                              onClick={() => apply(website.id)}
                            >
                              Accept
                            </Button>
                          ) : null}
                        </>
                      )}
                    </div>
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </TableWrap>

      {/*
        `disabled` on a `Button asChild` renders an anchor, and `disabled`
        does nothing to an anchor - so at the ends both controls looked
        live and navigated to the page you were already on. A real button
        where there is nowhere to go, and nothing at all on a single page.
      */}
      {totalPages > 1 ? (
        <div className="flex items-center justify-between">
          <Step to={page - 1} disabled={page <= 1}>
            Previous
          </Step>
          <Step to={page + 1} disabled={page >= totalPages}>
            Next
          </Step>
        </div>
      ) : null}
    </div>
  );
}

function Step({
  to,
  disabled,
  children,
}: {
  to: number;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <Button size="sm" variant="outline" disabled>
        {children}
      </Button>
    );
  }
  return (
    <Button asChild size="sm" variant="outline">
      <Link href={`/admin/categorise?page=${to}`}>{children}</Link>
    </Button>
  );
}
