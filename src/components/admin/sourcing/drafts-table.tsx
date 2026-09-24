'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { AlertTriangle, Check, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table';
import {
  approveSelectedAction,
  bulkApproveConfidentAction,
  discardDraftsAction,
} from '@/app/admin/(protected)/sourcing/actions';
import { formatDate } from '@/lib/utils/format';
import type { DraftRow } from '@/app/admin/(protected)/sourcing/page';

/** Reviewer prompts, in the words a reviewer needs rather than the slug. */
const FLAG_LABELS: Record<string, string> = {
  'single-price-confirm-niches': 'Single price - confirm niches',
  'different-site-offered': 'Different site offered',
  'price-changes-later': 'Price changes later',
  'no-contact-email': 'No contact email',
  'price-without-currency': 'Price with no currency',
  'terms-from-network': 'Terms from the network reply',
};

export function DraftsTable({ drafts }: { drafts: DraftRow[] }) {
  const [busy, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

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

  /*
    Domains waiting more than once, which means the same reply was read
    twice. Approving both is harmless - approval re-checks the domain, so the
    second is an update - but it is sixty listings to work through for
    nothing, and it is not obvious from a list this long that it is happening.
  */
  const perDomain = drafts.reduce<Record<string, number>>((all, draft) => {
    all[draft.domain] = (all[draft.domain] ?? 0) + 1;
    return all;
  }, {});
  const repeated = Object.values(perDomain).filter((count) => count > 1).length;

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
              startTransition(async () => {
                const outcome = await bulkApproveConfidentAction();
                setResult(
                  `Approved ${outcome.approved}.${
                    outcome.failures.length ? ` Could not approve: ${outcome.failures.join(', ')}.` : ''
                  }`,
                );
              })
            }
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Approve all {confident.length}
          </Button>
        </div>
      ) : null}

      {repeated > 0 ? (
        <p className="rounded-lg border border-line bg-surface-sunken px-3 py-2 text-[13px] text-ink-soft">
          {repeated} {repeated === 1 ? 'domain appears' : 'domains appear'} more than once, so the
          same reply has been read twice. Open one of the repeats and use{' '}
          <span className="font-medium text-ink">throw away this email and its drafts</span> on
          whichever copy you do not want.
        </p>
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
                startTransition(async () => {
                  const outcome = await approveSelectedAction([...selected]);
                  setSelected(new Set());
                  setResult(
                    `Approved ${outcome.approved}.${
                      outcome.failures.length
                        ? ` Could not approve: ${outcome.failures.join(', ')}.`
                        : ''
                    }`,
                  );
                });
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
                });
              }}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Delete selected
            </Button>
          </div>
        </div>
      ) : null}

      {result ? (
        <p role="status" className="text-[13px] text-ink-soft">
          {result}
        </p>
      ) : null}

      <TableWrap>
        <Table>
          <caption className="sr-only">Listing drafts awaiting review</caption>
          <thead>
            <tr>
              <Th className="w-10">
                <Checkbox
                  aria-label={allSelected ? 'Clear selection' : 'Select every draft'}
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
            {drafts.map((draft) => (
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
                  {(perDomain[draft.domain] ?? 0) > 1 ? (
                    <span
                      title="This domain is waiting in more than one draft."
                      className="ml-1.5 rounded bg-surface-sunken px-1.5 py-0.5 text-[10px] text-muted"
                    >
                      x{perDomain[draft.domain]}
                    </span>
                  ) : null}
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
      </TableWrap>
    </div>
  );
}
