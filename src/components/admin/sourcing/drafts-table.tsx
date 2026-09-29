'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { AlertTriangle, Check, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { TableScroll } from '@/components/ui/table-scroll';
import { Pagination } from '@/components/ui/pagination';
import { DEFAULT_PAGE_SIZE, paginate, type PageSize } from '@/lib/admin/paging';
import {
  approveSelectedAction,
  bulkApproveConfidentAction,
  discardDraftsAction,
} from '@/app/admin/(protected)/sourcing/actions';
import { formatDate } from '@/lib/utils/format';
import { APPROVE_CHUNK_SIZE, chunk, progressText } from '@/lib/sourcing/approving';
import { ProgressBar } from '@/components/ui/progress-bar';
import type { DraftRow } from '@/app/admin/(protected)/sourcing/page';

/** Reviewer prompts, in the words a reviewer needs rather than the slug. */
const FLAG_LABELS: Record<string, string> = {
  'single-price-confirm-niches': 'Single price - confirm niches',
  'different-site-offered': 'Different site offered',
  'price-changes-later': 'Price changes later',
  'no-contact-email': 'No contact email',
  'price-without-currency': 'Price with no currency',
  'terms-from-network': 'Terms from the network reply',
  'replied-again': 'They replied again - re-read',
};

export function DraftsTable({ drafts }: { drafts: DraftRow[] }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /** How far through a run is, so the bar moves on real counts. */
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);

  /*
    Paging is display only. Both approve buttons work on the whole queue, not
    on the page - approving two hundred drafts is the job, and making it four
    page-loads of ticking would be a page break getting in the way of the
    thing it was added to help with.
  */
  const paged = paginate(drafts, page, pageSize);

  /**
   * Approve these, a chunk at a time, and show the page the outcome.
   *
   * One request for two hundred drafts never came back: it ran past the
   * function ceiling with the browser still waiting, so no count appeared, no
   * rows left the table, and the only way to find out it had worked was to
   * reload by hand. Chunking makes every request short enough to answer, and
   * the refresh at the end is what the reload used to be - the table and the
   * marketplace both re-read from the database without anybody pressing
   * anything.
   *
   * The refresh is last rather than per chunk: re-reading a two-hundred-row
   * page ten times would cost more than the approvals.
   */
  function approveInChunks(
    ids: string[],
    run: (part: string[]) => Promise<{ approved: number; failures: string[]; skipped?: number }>,
  ) {
    startTransition(async () => {
      const chunks = chunk(ids, APPROVE_CHUNK_SIZE);
      let approved = 0;
      let skipped = 0;
      let done = 0;
      const failures: string[] = [];

      for (const part of chunks) {
        setProgress({ done, total: ids.length });
        setResult(
          progressText({ done, total: ids.length, approved, failures, skipped, finished: false }),
        );
        try {
          const outcome = await run(part);
          approved += outcome.approved;
          skipped += outcome.skipped ?? 0;
          failures.push(...outcome.failures);
        } catch {
          // A chunk that never answered is not a chunk that did nothing, so
          // its domains are not claimed as failed. The refresh below shows
          // which of them actually left the queue.
          failures.push(`${part.length} in one batch did not answer`);
        }
        done += part.length;
      }

      setSelected(new Set());
      setProgress(null);
      setResult(
        progressText({ done, total: ids.length, approved, failures, skipped, finished: true }),
      );
      router.refresh();
    });
  }

  const allSelected = drafts.length > 0 && selected.size === drafts.length;
  const someSelected = selected.size > 0 && !allSelected;

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const confident = drafts.filter(
    (draft) => draft.lowConfidenceCount === 0 && draft.flags.length === 0,
  );

  return (
    <div className="space-y-3">
      {confident.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface-sunken px-3 py-2">
          <p className="text-[13px] text-ink-soft">
            {confident.length} {confident.length === 1 ? 'draft has' : 'drafts have'} no
            low-confidence field and nothing flagged.
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() =>
              approveInChunks(
                confident.map((draft) => draft.id),
                bulkApproveConfidentAction,
              )
            }
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Approve all {confident.length}
          </Button>
        </div>
      ) : null}

      {selected.size > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface-sunken px-3 py-2">
          <p className="text-[13px] text-ink-soft">
            {selected.size} {selected.size === 1 ? 'draft' : 'drafts'} selected
          </p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              Clear selection
            </Button>
            <Button
              variant="accent"
              size="sm"
              disabled={busy}
              onClick={() => {
                // The count of flagged ones goes in the question, because
                // approving a draft nobody has opened is the easiest way for
                // this queue to put a wrong price into the database.
                const chosen = drafts.filter((draft) => selected.has(draft.id));
                const needsALook = chosen.filter(
                  (draft) => draft.lowConfidenceCount > 0 || draft.flags.length > 0,
                ).length;
                const warning = needsALook
                  ? ` ${needsALook} of them ${needsALook === 1 ? 'has something' : 'have something'} flagged for a human.`
                  : '';
                if (
                  !window.confirm(
                    `Approve ${chosen.length} ${chosen.length === 1 ? 'draft' : 'drafts'}?${warning} Each is approved with its own values, creating or updating a listing.`,
                  )
                ) {
                  return;
                }
                approveInChunks([...selected], approveSelectedAction);
              }}
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              Approve selected
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => {
                if (
                  !window.confirm(
                    `Delete ${selected.size} ${selected.size === 1 ? 'draft' : 'drafts'}? They are gone for good. Listings you have already approved are not affected, and the emails stay, so you can read them again.`,
                  )
                ) {
                  return;
                }
                startTransition(async () => {
                  const outcome = await discardDraftsAction([...selected]);
                  setSelected(new Set());
                  setResult(
                    outcome.ok
                      ? `Deleted ${outcome.discarded} ${outcome.discarded === 1 ? 'draft' : 'drafts'}.`
                      : (outcome.error ?? 'Could not delete those.'),
                  );
                  router.refresh();
                });
              }}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Delete selected
            </Button>
          </div>
        </div>
      ) : null}

      {progress ? (
        <ProgressBar
          done={progress.done}
          total={progress.total}
          label={result ?? ''}
          className="rounded-lg border border-line bg-surface-sunken px-3 py-2.5"
        />
      ) : result ? (
        <p role="status" className="text-[13px] text-ink-soft">
          {result}
        </p>
      ) : null}

      <TableScroll>
        <Table>
          <caption className="sr-only">Listing drafts awaiting review</caption>
          <thead>
            <tr>
              <Th className="w-10">
                <Checkbox
                  aria-label={
                    allSelected ? 'Clear selection' : `Select all ${drafts.length} drafts`
                  }
                  checked={allSelected}
                  indeterminate={someSelected}
                  onChange={() =>
                    setSelected(allSelected ? new Set() : new Set(drafts.map((draft) => draft.id)))
                  }
                />
              </Th>
              <Th>Domain</Th>
              <Th className="hidden md:table-cell">From</Th>
              <Th className="hidden lg:table-cell">Received</Th>
              <Th>New or update</Th>
              <Th>Needs a look</Th>
              <Th className="w-20 text-right">
                <span className="sr-only">Review</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {paged.rows.map((draft) => (
              <Tr key={draft.id}>
                <Td>
                  <Checkbox
                    aria-label={`Select ${draft.domain}`}
                    checked={selected.has(draft.id)}
                    onChange={() => toggle(draft.id)}
                  />
                </Td>
                <Td className="text-[13px] font-medium">
                  <Link
                    href={`/admin/sourcing/drafts/${draft.id}`}
                    className="text-ink hover:text-accent-700"
                  >
                    {draft.domain}
                  </Link>
                </Td>
                <Td className="hidden truncate text-[12px] text-muted md:table-cell">
                  {draft.fromAddress}
                </Td>
                <Td className="tabular hidden text-[12px] whitespace-nowrap text-muted lg:table-cell">
                  {draft.sentAt ? formatDate(draft.sentAt) : '—'}
                </Td>
                <Td>
                  <Badge tone={draft.matched ? 'neutral' : 'accent'}>
                    {draft.matched ? 'Update' : 'New'}
                  </Badge>
                </Td>
                <Td>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {draft.lowConfidenceCount > 0 ? (
                      <span className="inline-flex items-center gap-1 text-[12px] text-negative">
                        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                        {draft.lowConfidenceCount} low
                      </span>
                    ) : null}
                    {draft.flags.map((flag) => (
                      <span
                        key={flag}
                        className="rounded border border-line bg-surface px-1.5 py-0.5 text-[11px] text-ink-soft"
                      >
                        {FLAG_LABELS[flag] ?? flag}
                      </span>
                    ))}
                    {draft.lowConfidenceCount === 0 && draft.flags.length === 0 ? (
                      <span className="text-[12px] text-muted">Nothing flagged</span>
                    ) : null}
                  </div>
                </Td>
                <Td className="text-right">
                  <Link
                    href={`/admin/sourcing/drafts/${draft.id}`}
                    className="text-[13px] font-medium text-accent-700 hover:underline"
                  >
                    Review
                  </Link>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </TableScroll>

      <Pagination
        paged={paged}
        size={pageSize}
        noun="drafts"
        onPage={setPage}
        onSize={(next) => {
          setPageSize(next);
          setPage(1);
        }}
      />
    </div>
  );
}
