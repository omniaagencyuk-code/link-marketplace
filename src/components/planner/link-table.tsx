'use client';

import { useState, useTransition } from 'react';
import { ExternalLink, Search, Settings2, StickyNote, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { TextCell, SelectCell, DateCell, PriceCell } from './cell';
import { ManageStatuses } from './manage-statuses';
import {
  updateLinkAction,
  deleteLinksAction,
  findMetricsAction,
} from '@/app/dashboard/planner/actions';
import { cn } from '@/lib/utils/cn';
import {
  ANCHOR_TYPES,
  DEFAULT_LINK_TYPES,
  DEFAULT_SOURCES,
  type PlannerLink,
  type PlannerLinkPatch,
  type PlannerStatus,
} from '@/lib/types/planner';

/**
 * The planner's spreadsheet.
 *
 * Every field a customer would otherwise keep in Excel is editable where
 * it sits. There is no edit page: opening one to change an anchor is the
 * thing that makes people keep using Excel.
 *
 * ## It scrolls, the page does not
 *
 * Seventeen columns do not fit a laptop, so the table scrolls inside its
 * own container. `TableWrap` already does that, and the row of cells is
 * sized in pixels so the horizontal scroll is the table's rather than the
 * document's - a page that scrolls sideways is the one responsive failure
 * that makes a tool feel broken.
 *
 * ## Saving
 *
 * Each cell owns its own save. A failure marks that cell and keeps what was
 * typed; it does not roll the row back, and it does not stop the cell next
 * to it from saving. See `cell.tsx` for why.
 */
/**
 * Where a row's metrics came from, in words.
 *
 * Shown as a tooltip rather than a column, because seventeen columns is
 * already the limit and this is a question somebody asks about one row at
 * a time. The date is the listing's last measurement, not the moment it
 * was copied into the planner - an hour-old copy of a three-month-old
 * reading is three months old.
 */
function provenance(link: PlannerLink): string | undefined {
  if (link.metricsSource === null) return undefined;
  if (link.metricsSource === 'manual') return 'Entered by hand. Not verified by Press Parrot.';
  if (link.metricsSource === 'csv') return 'Imported from your CSV. Not verified by Press Parrot.';
  const measured = link.metricsUpdatedAt
    ? new Date(link.metricsUpdatedAt).toLocaleDateString('en-GB', {
        month: 'long',
        year: 'numeric',
      })
    : 'an unrecorded date';
  return `From Press Parrot's listing, measured ${measured}.`;
}

export function LinkTable({
  links,
  statuses,
  sources,
  currency,
  onChanged,
}: {
  links: PlannerLink[];
  statuses: PlannerStatus[];
  sources: string[];
  currency: string;
  onChanged: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [managingStatuses, setManagingStatuses] = useState(false);
  const [notesFor, setNotesFor] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [lookupNote, setLookupNote] = useState<string | null>(null);

  const byId = new Map(statuses.map((status) => [status.id, status]));

  /*
    Archived statuses stay available to the rows already wearing one, and
    leave the list for everybody else. Dropping them outright would make a
    row's own status unselectable in its own dropdown, which reads as the
    value having been lost.
  */
  const statusOptions = (current: string) =>
    statuses
      .filter((status) => !status.archivedAt || status.id === current)
      .map((status) => ({ value: status.id, label: status.name }));

  const sourceOptions = [...DEFAULT_SOURCES, ...sources].map((name) => ({
    value: name,
    label: name,
  }));

  const save = (id: string) => async (patch: PlannerLinkPatch): Promise<string | null> => {
    const result = await updateLinkAction(id, patch);
    return 'error' in result && result.error ? result.error : null;
  };

  const allSelected = links.length > 0 && links.every((link) => selected.includes(link.id));

  return (
    <>
      {selected.length > 0 ? (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] border border-accent-200 bg-accent-50 px-4 py-2.5">
          <span className="text-[13px] font-medium text-accent-800">
            {selected.length} selected
          </span>
          <Button variant="outline" size="sm" onClick={() => setSelected([])}>
            Clear
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => {
              /* Our own table, not Ahrefs. It fills blanks only, so it can
                 never overwrite a figure somebody typed - which is the
                 brief's "do not overwrite without confirmation" made
                 impossible rather than merely asked for. */
              startTransition(async () => {
                const outcome = await findMetricsAction(selected);
                if ('error' in outcome && outcome.error) {
                  setLookupNote(outcome.error);
                  return;
                }
                const parts = [`${outcome.filled} filled from Press Parrot`];
                if (outcome.kept) parts.push(`${outcome.kept} left as you entered them`);
                if (outcome.missing) parts.push(`${outcome.missing} not in our data`);
                setLookupNote(`${parts.join(', ')}.`);
                onChanged();
              });
            }}
          >
            <Search className="h-3.5 w-3.5" aria-hidden="true" />
            Find metrics
          </Button>
          <Button
            variant="danger"
            size="sm"
            disabled={pending}
            onClick={() => {
              // Destructive and plural, so it asks. The brief's rule, and
              // the one place in the planner where a misclick loses work
              // that cannot be typed back from memory.
              if (!window.confirm(`Delete ${selected.length} link${selected.length === 1 ? '' : 's'}? This cannot be undone.`)) return;
              startTransition(async () => {
                await deleteLinksAction(selected);
                setSelected([]);
                onChanged();
              });
            }}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Delete
          </Button>
        </div>
      ) : null}

      {lookupNote ? (
        <p
          role="status"
          className="mb-3 rounded-[var(--radius-card)] border border-line bg-surface px-4 py-2 text-[12px] text-ink-soft"
        >
          {lookupNote}
        </p>
      ) : null}

      <TableWrap>
        <Table className="min-w-[1700px]">
          <caption className="sr-only">
            Your planned links, with every field editable in place
          </caption>
          <thead>
            <tr>
              <Th className="w-9 pr-0">
                <Checkbox
                  checked={allSelected}
                  indeterminate={!allSelected && selected.length > 0}
                  onChange={() =>
                    setSelected(allSelected ? [] : links.map((link) => link.id))
                  }
                  aria-label="Select every link on this page"
                />
              </Th>
              <Th className="w-52">Domain</Th>
              <Th className="w-36">Source</Th>
              <Th className="w-16">DR</Th>
              <Th className="w-24">Traffic</Th>
              <Th className="w-24">Keywords</Th>
              <Th className="w-24">Ref. domains</Th>
              <Th className="w-36">Link type</Th>
              <Th className="w-52">Target page</Th>
              <Th className="w-44">Anchor text</Th>
              <Th className="w-32">Anchor type</Th>
              <Th className="w-40">
                <span className="flex items-center gap-1">
                  Status
                  <button
                    type="button"
                    onClick={() => setManagingStatuses(true)}
                    className="text-muted hover:text-ink"
                    aria-label="Manage statuses"
                    title="Manage statuses"
                  >
                    <Settings2 className="h-3 w-3" aria-hidden="true" />
                  </button>
                </span>
              </Th>
              <Th className="w-36">Planned</Th>
              <Th className="w-36">Live date</Th>
              <Th className="w-48">Live link</Th>
              <Th className="w-28 text-right">Price</Th>
              <Th className="w-16 text-right">
                <span className="sr-only">Notes</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {links.map((link) => {
              const status = byId.get(link.statusId);
              const isSelected = selected.includes(link.id);
              return (
                <Tr key={link.id} className={cn(isSelected && 'bg-accent-50')}>
                  <Td className="pr-0">
                    <Checkbox
                      checked={isSelected}
                      onChange={() =>
                        setSelected((current) =>
                          current.includes(link.id)
                            ? current.filter((id) => id !== link.id)
                            : [...current, link.id],
                        )
                      }
                      aria-label={`Select ${link.domain}`}
                    />
                  </Td>

                  <Td>
                    <TextCell
                      value={link.domain}
                      ariaLabel="Domain"
                      placeholder="forbes.com"
                      className="font-semibold"
                      onSave={(domain) => save(link.id)({ domain })}
                    />
                  </Td>

                  <Td>
                    <SelectCell
                      value={link.source}
                      options={sourceOptions}
                      ariaLabel="Where this link came from"
                      onSave={(source) => save(link.id)({ source })}
                    />
                  </Td>

                  {/*
                    Four metrics, and all of them blank until somebody says
                    otherwise. A placeholder dash rather than a zero: the
                    column is empty because nobody has looked it up.
                  */}
                  <Td>
                    <div
                      /*
                        Where the four figures came from, as a tooltip on
                        the first of them. Never a claim that a typed
                        number was checked: "manual" says a person entered
                        it, and a Press Parrot figure carries the date the
                        listing was last measured rather than the date it
                        was copied here.
                      */
                      title={provenance(link)}
                      className={cn(
                        link.metricsSource === 'press-parrot' &&
                          'rounded-md ring-1 ring-accent-200',
                      )}
                    >
                      <TextCell
                        value={link.domainRating === null ? '' : String(link.domainRating)}
                        type="number"
                        align="right"
                        placeholder="—"
                        ariaLabel="Domain rating"
                        onSave={(value) =>
                          save(link.id)({
                            domainRating: value === '' ? null : Number(value),
                            metricsSource: 'manual',
                          })
                        }
                      />
                    </div>
                  </Td>
                  <Td>
                    <TextCell
                      value={link.organicTraffic === null ? '' : String(link.organicTraffic)}
                      type="number"
                      align="right"
                      placeholder="—"
                      ariaLabel="Organic traffic"
                      onSave={(value) =>
                        save(link.id)({
                          organicTraffic: value === '' ? null : Number(value),
                          metricsSource: 'manual',
                        })
                      }
                    />
                  </Td>
                  <Td>
                    <TextCell
                      value={link.organicKeywords === null ? '' : String(link.organicKeywords)}
                      type="number"
                      align="right"
                      placeholder="—"
                      ariaLabel="Organic keywords"
                      onSave={(value) =>
                        save(link.id)({
                          organicKeywords: value === '' ? null : Number(value),
                          metricsSource: 'manual',
                        })
                      }
                    />
                  </Td>
                  <Td>
                    <TextCell
                      value={link.referringDomains === null ? '' : String(link.referringDomains)}
                      type="number"
                      align="right"
                      placeholder="—"
                      ariaLabel="Referring domains"
                      onSave={(value) =>
                        save(link.id)({
                          referringDomains: value === '' ? null : Number(value),
                          metricsSource: 'manual',
                        })
                      }
                    />
                  </Td>

                  <Td>
                    <SelectCell
                      value={link.linkType}
                      options={DEFAULT_LINK_TYPES.map((type) => ({ value: type, label: type }))}
                      ariaLabel="Link type"
                      onSave={(linkType) => save(link.id)({ linkType })}
                    />
                  </Td>

                  <Td>
                    <TextCell
                      value={link.targetUrl ?? ''}
                      type="url"
                      placeholder="https://example.com/page"
                      ariaLabel="The page receiving the link"
                      onSave={(targetUrl) => save(link.id)({ targetUrl })}
                    />
                  </Td>

                  <Td>
                    <TextCell
                      value={link.anchorText}
                      placeholder="anchor text"
                      ariaLabel="Anchor text"
                      onSave={(anchorText) => save(link.id)({ anchorText })}
                    />
                  </Td>

                  <Td>
                    <SelectCell
                      value={link.anchorType}
                      options={ANCHOR_TYPES.map((type) => ({ value: type, label: type }))}
                      ariaLabel="Anchor type"
                      onSave={(anchorType) => save(link.id)({ anchorType })}
                    />
                  </Td>

                  <Td>
                    <div className="flex items-center gap-1.5">
                      <span
                        aria-hidden="true"
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: status?.colour ?? '#cbd5e1' }}
                      />
                      <SelectCell
                        value={link.statusId}
                        options={statusOptions(link.statusId)}
                        placeholder="Status"
                        ariaLabel="Status"
                        onSave={(statusId) => save(link.id)({ statusId })}
                      />
                    </div>
                  </Td>

                  <Td>
                    <DateCell
                      value={link.plannedDate}
                      ariaLabel="Planned date"
                      onSave={(plannedDate) => save(link.id)({ plannedDate })}
                    />
                  </Td>
                  <Td>
                    {/* Separate from the planned date, and never derived from
                        it. A link going live on the day it was planned is a
                        coincidence, not a rule. */}
                    <DateCell
                      value={link.liveDate}
                      ariaLabel="Date it went live"
                      onSave={(liveDate) => save(link.id)({ liveDate })}
                    />
                  </Td>

                  <Td>
                    <div className="flex items-center gap-1">
                      <TextCell
                        value={link.liveUrl ?? ''}
                        type="url"
                        placeholder="Enter live link..."
                        ariaLabel="The published article"
                        onSave={(liveUrl) => save(link.id)({ liveUrl })}
                      />
                      {link.liveUrl ? (
                        /* Opens it. Nothing fetches it: this planner never
                           visits a publisher's site, so a link here is one
                           a person recorded, not one we checked. */
                        <a
                          href={link.liveUrl}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          className="shrink-0 text-muted hover:text-accent-700"
                          aria-label={`Open ${link.domain}'s live link in a new tab`}
                        >
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        </a>
                      ) : null}
                    </div>
                  </Td>

                  <Td>
                    <PriceCell
                      minor={link.priceMinor}
                      currency={link.currency ?? currency}
                      ariaLabel="Price"
                      onSave={(priceMinor) =>
                        save(link.id)({ priceMinor, currency: link.currency ?? currency })
                      }
                    />
                  </Td>

                  <Td className="text-right">
                    <button
                      type="button"
                      onClick={() => setNotesFor(notesFor === link.id ? null : link.id)}
                      aria-expanded={notesFor === link.id}
                      aria-label={`Notes for ${link.domain}`}
                      className={cn(
                        'inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors',
                        link.notes
                          ? 'bg-accent-50 text-accent-700'
                          : 'text-muted hover:bg-surface-sunken hover:text-ink',
                      )}
                    >
                      <StickyNote className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </Td>
                </Tr>
              );
            })}

            {/* Notes live in their own row rather than a column, so one long
                note cannot push the other sixteen columns off the screen. */}
            {notesFor
              ? links
                  .filter((link) => link.id === notesFor)
                  .map((link) => (
                    <tr key={`${link.id}-notes`} className="bg-surface/60">
                      <td colSpan={18} className="px-4 py-3">
                        <label className="block">
                          <span className="mb-1 block text-[11px] font-semibold tracking-[0.04em] text-muted uppercase">
                            Notes on {link.domain}
                          </span>
                          <TextCell
                            value={link.notes}
                            placeholder="Publisher wants 800 words. Invoice due next week."
                            ariaLabel={`Notes for ${link.domain}`}
                            className="border-line-strong bg-white"
                            onSave={(notes) => save(link.id)({ notes })}
                          />
                        </label>
                      </td>
                    </tr>
                  ))
              : null}
          </tbody>
        </Table>
      </TableWrap>

      <ManageStatuses
        statuses={statuses}
        open={managingStatuses}
        onClose={() => {
          setManagingStatuses(false);
          onChanged();
        }}
      />
    </>
  );
}
