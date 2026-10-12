'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import {
  ArrowDown,
  ArrowUp,
  Download,
  ExternalLink,
  Search,
  Settings2,
  ShoppingBag,
  StickyNote,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select } from '@/components/ui/select';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { TextCell, SelectCell, DateCell, PriceCell } from './cell';
import { ManageStatuses } from './manage-statuses';
import { LinkCards } from './link-cards';
import {
  updateLinkAction,
  deleteLinksAction,
  findMetricsAction,
  bulkUpdateAction,
  exportLinksAction,
} from '@/app/dashboard/planner/actions';
import { linksToCsv } from '@/lib/planner/csv';
import { downloadCsv } from '@/lib/import/csv';
import { monthLabel, monthStart } from '@/lib/planner/domain-key';
import type { PlannerProject } from '@/lib/types/planner';
import type { PlannerSort, PlannerSortKey } from '@/lib/planner/filter';
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
  listings,
  projects,
  month,
  sort,
  onSort,
  onChanged,
}: {
  links: PlannerLink[];
  statuses: PlannerStatus[];
  sources: string[];
  currency: string;
  /** Domain key to marketplace slug, for the rows we happen to sell. */
  listings: Record<string, string>;
  /** Every project of theirs, so a selection can be moved to one. */
  projects: PlannerProject[];
  /** The month in view, or null across the whole project. */
  month: string | null;
  sort: PlannerSort;
  onSort: (key: PlannerSortKey) => void;
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

  const bulk = (patch: Parameters<typeof bulkUpdateAction>[1]) => {
    startTransition(async () => {
      const outcome = await bulkUpdateAction(selected, patch);
      if ('error' in outcome && outcome.error) {
        setLookupNote(outcome.error);
        return;
      }
      setLookupNote(null);
      /* The selection is kept. Somebody setting a status on twelve rows
         very often sets a source on the same twelve next, and clearing it
         would make them pick all twelve again. */
      onChanged();
    });
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
          {/*
            Five things a bulk change can mean, and no more. Price and
            anchor are deliberately absent: a price is what one publisher
            charged and an anchor is what one page says, so writing either
            over forty rows destroys the record this tool exists to keep.
            `bulkUpdateAction` is the allowlist; this is the half of it
            somebody can see.
          */}
          <BulkSelect
            label="Set status"
            options={statuses
              .filter((status) => !status.archivedAt)
              .map((status) => ({ value: status.id, label: status.name }))}
            disabled={pending}
            onPick={(statusId) => bulk({ statusId })}
          />
          <BulkSelect
            label="Set source"
            options={[...new Set([...DEFAULT_SOURCES, ...sources])].map((name) => ({
              value: name,
              label: name,
            }))}
            disabled={pending}
            onPick={(source) => bulk({ source })}
          />
          <BulkSelect
            label="Set type"
            options={DEFAULT_LINK_TYPES.map((type) => ({ value: type, label: type }))}
            disabled={pending}
            onPick={(linkType) => bulk({ linkType })}
          />
          <BulkSelect
            label="Move to month"
            options={monthChoices(month).map((value) => ({ value, label: monthLabel(value) }))}
            disabled={pending}
            onPick={(planMonth) => bulk({ planMonth })}
          />
          {projects.length > 1 ? (
            <BulkSelect
              label="Move to project"
              options={projects.map((project) => ({
                value: project.id,
                label: `${project.name} · ${project.domain}`,
              }))}
              disabled={pending}
              onPick={(projectId) => bulk({ projectId })}
            />
          ) : null}
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => {
              /* The selection, read back from the server rather than taken
                 from the rows on screen - the same reason the month export
                 is a server read. A file built from what the browser
                 happens to be holding is a file that silently stops at the
                 page boundary. */
              startTransition(async () => {
                const { links: chosen, statuses: every } = await exportLinksAction(selected);
                downloadCsv(`press-parrot-planner-selection.csv`, linksToCsv(chosen, every));
              });
            }}
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Export selected
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

      {/* Cards below `lg`, the table at `lg` and up. Both render and CSS
          picks: a width measured in JavaScript is not known while the
          server renders, so the alternative is a flash of the wrong one.
          A `display: none` subtree is not focusable and not in the
          accessibility tree, so the duplicate inputs are not a second tab
          order. */}
      <div className="lg:hidden">
        <LinkCards
          links={links}
          statuses={statuses}
          sources={sourceOptions}
          currency={currency}
          listings={listings}
          selected={selected}
          expanded={notesFor}
          onToggleSelect={(id) =>
            setSelected((current) =>
              current.includes(id) ? current.filter((other) => other !== id) : [...current, id],
            )
          }
          onToggleExpand={(id) => setNotesFor(notesFor === id ? null : id)}
          save={save}
        />
      </div>

      <TableWrap className="hidden lg:block">
        <Table className="min-w-[1750px]">
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
              {/* Wider than the rest of the text columns: the badge shares
                  the cell, and a truncated domain is the one value in the
                  row nobody can work out from the others. */}
              <Th className="w-64">
                <SortButton label="Domain" sortKey="domain" sort={sort} onSort={onSort} />
              </Th>
              <Th className="w-36">Source</Th>
              <Th className="w-16">
                <SortButton label="DR" sortKey="domainRating" sort={sort} onSort={onSort} />
              </Th>
              <Th className="w-24">
                <SortButton label="Traffic" sortKey="organicTraffic" sort={sort} onSort={onSort} />
              </Th>
              <Th className="w-24">Keywords</Th>
              <Th className="w-24">Ref. domains</Th>
              <Th className="w-36">Link type</Th>
              <Th className="w-52">Target page</Th>
              <Th className="w-44">Anchor text</Th>
              <Th className="w-32">Anchor type</Th>
              <Th className="w-40">
                <span className="flex items-center gap-1">
                  <SortButton label="Status" sortKey="status" sort={sort} onSort={onSort} />
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
              <Th className="w-36">
                <SortButton label="Planned" sortKey="plannedDate" sort={sort} onSort={onSort} />
              </Th>
              <Th className="w-36">
                <SortButton label="Live date" sortKey="liveDate" sort={sort} onSort={onSort} />
              </Th>
              <Th className="w-48">Live link</Th>
              <Th className="w-28 text-right">
                <SortButton
                  label="Price"
                  sortKey="priceMinor"
                  sort={sort}
                  onSort={onSort}
                  className="justify-end"
                />
              </Th>
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
                    <div className="flex items-center gap-1.5">
                      <TextCell
                        value={link.domain}
                        ariaLabel="Domain"
                        placeholder="forbes.com"
                        className="font-semibold"
                        onSave={(domain) => save(link.id)({ domain })}
                      />
                      {/*
                        We sell this one. A link to the listing and nothing
                        else: the customer's supplier, their price and their
                        status are left exactly as they are, because an
                        agency with a direct arrangement on a publisher is
                        very often paying less than our rate card, and a
                        planner that overwrites that is a planner they stop
                        trusting. Nothing is fetched to work this out - it
                        is a read of our own listings table.
                      */}
                      {listings[link.domainKey] ? (
                        <Link
                          href={`/websites/${listings[link.domainKey]}`}
                          target="_blank"
                          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent-50 px-1.5 py-0.5 text-[10px] font-semibold text-accent-700 ring-1 ring-accent-200 ring-inset hover:bg-accent-100"
                          title={`${link.domain} is available on the Press Parrot marketplace`}
                        >
                          <ShoppingBag className="h-2.5 w-2.5" aria-hidden="true" />
                          <span className="sr-only">Available on Press Parrot: </span>
                          PP
                        </Link>
                      ) : null}
                    </div>
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

/**
 * Twelve months to move a selection into: six back and five forward.
 *
 * A bounded list rather than a date picker, because "move these to a
 * month" is always a month near this one - and a free date field invites
 * somebody to type a day, which a plan month cannot be (0081 refuses it).
 */
function monthChoices(month: string | null): string[] {
  const from = monthStart(month ?? new Date().toISOString());
  const year = Number(from.slice(0, 4));
  const index = Number(from.slice(5, 7)) - 1;
  return Array.from({ length: 12 }, (_, step) => {
    const date = new Date(Date.UTC(year, index - 6 + step, 1));
    return date.toISOString().slice(0, 10);
  });
}

/**
 * A bulk change, as a dropdown that does not keep its answer.
 *
 * It resets to its label after each pick. A select left showing "Live" is
 * a select that looks like a filter - and the next person to look at the
 * bar would read it as a statement about the selection rather than as the
 * last thing somebody did to it.
 */
function BulkSelect({
  label,
  options,
  disabled,
  onPick,
}: {
  label: string;
  options: { value: string; label: string }[];
  disabled: boolean;
  onPick: (value: string) => void;
}) {
  return (
    <label>
      <span className="sr-only">{label}</span>
      <Select
        value=""
        disabled={disabled}
        aria-label={label}
        className="h-8 w-auto text-[12px]"
        onChange={(event) => {
          if (!event.target.value) return;
          onPick(event.target.value);
          event.target.value = '';
        }}
      >
        <option value="">{label}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </label>
  );
}

/**
 * A column heading that sorts.
 *
 * The arrow is drawn only on the column actually sorting, so the header
 * row says what the order is rather than offering eight arrows and
 * leaving somebody to guess which one is on. `aria-sort` on the cell would
 * be better still, but `Th` is shared with four other tables and widening
 * it for this is a change to screens this stage is not touching.
 */
function SortButton({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string;
  sortKey: PlannerSortKey;
  sort: PlannerSort;
  onSort: (key: PlannerSortKey) => void;
  className?: string;
}) {
  const on = sort.key === sortKey;
  const Arrow = sort.ascending ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={cn(
        'inline-flex items-center gap-1 hover:text-ink',
        on && 'text-ink',
        className,
      )}
      title={
        on
          ? `Sorted by ${label.toLowerCase()}, ${sort.ascending ? 'ascending' : 'descending'}. Click to reverse.`
          : `Sort by ${label.toLowerCase()}`
      }
    >
      {label}
      {on ? <Arrow className="h-3 w-3" aria-hidden="true" /> : null}
      <span className="sr-only">
        {on ? `, sorted ${sort.ascending ? 'ascending' : 'descending'}` : ', sortable'}
      </span>
    </button>
  );
}
