'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils/cn';
import {
  activeFilterCount,
  filterIsActive,
  NO_FILTER,
  type PlannerFilter,
} from '@/lib/planner/filter';
import { DEFAULT_LINK_TYPES, DEFAULT_SOURCES, type PlannerStatus } from '@/lib/types/planner';

/**
 * The filter bar.
 *
 * ## It writes to the URL, and the server does the filtering
 *
 * Nothing here filters anything. Every control sets a query parameter and
 * the page re-reads; the predicate lives in `planner/filter.ts` and runs
 * against the database. Filtering the fifty rows already on screen would be
 * a filter over a page - it would hide rows from the page it was handed and
 * never fetch the ones it should have - and a customer cannot tell the
 * difference by looking.
 *
 * It also means a filtered view is a link. An agency sending "the ones
 * still waiting on Forbes" to a colleague sends a URL.
 *
 * ## Text waits, everything else does not
 *
 * A select or a date is one decision and navigates immediately. A search
 * box is one keystroke at a time, so it is debounced - the same 400ms the
 * table's cells save on, because a page read per character is a page read
 * per character.
 */
export function LinkFilters({
  filter,
  statuses,
  sources,
  currency,
  matched,
  total,
  onChange,
}: {
  filter: PlannerFilter;
  statuses: PlannerStatus[];
  sources: string[];
  currency: string;
  /** How many the filter matched, and how many are in scope. */
  matched: number;
  total: number;
  onChange: (next: PlannerFilter) => void;
}) {
  const [open, setOpen] = useState(filterIsActive(filter));
  const active = activeFilterCount(filter);

  const set = (patch: Partial<PlannerFilter>) => onChange({ ...filter, ...patch });

  const statusOptions = statuses.filter((status) => !status.archivedAt);
  const sourceOptions = [...new Set([...DEFAULT_SOURCES, ...sources])];

  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-white shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-center gap-2 p-3">
        <DebouncedInput
          value={filter.domain}
          placeholder="Search domains..."
          ariaLabel="Search domains"
          className="h-9 w-full sm:w-56"
          onCommit={(domain) => set({ domain })}
        />

        <label className="min-w-40 flex-1 sm:flex-none">
          <span className="sr-only">Status</span>
          <Select
            value={filter.statusIds.length === 1 ? filter.statusIds[0] : ''}
            onChange={(event) =>
              set({ statusIds: event.target.value ? [event.target.value] : [] })
            }
            aria-label="Status"
            className="h-9"
          >
            <option value="">
              {filter.statusIds.length > 1 ? `${filter.statusIds.length} statuses` : 'Any status'}
            </option>
            {statusOptions.map((status) => (
              <option key={status.id} value={status.id}>
                {status.name}
              </option>
            ))}
          </Select>
        </label>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="h-9"
        >
          <Filter className="h-3.5 w-3.5" aria-hidden="true" />
          More filters
          {active > 0 ? (
            <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-600 px-1 text-[10px] font-semibold text-white">
              {active}
            </span>
          ) : null}
          <ChevronDown
            className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')}
            aria-hidden="true"
          />
        </Button>

        {filterIsActive(filter) ? (
          <>
            <Button variant="ghost" size="sm" className="h-9" onClick={() => onChange(NO_FILTER)}>
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              Clear
            </Button>
            {/*
              Both numbers, always. "12 links" next to a filtered table is
              the sentence that makes somebody think they have lost a row.
            */}
            <p role="status" className="tabular ml-auto text-[13px] text-muted">
              <span className="font-semibold text-ink">{matched}</span> of {total} shown
            </p>
          </>
        ) : null}
      </div>

      {open ? (
        <div className="grid gap-3 border-t border-line p-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Anchor text contains">
            <DebouncedInput
              value={filter.anchor}
              placeholder="best betting sites"
              ariaLabel="Anchor text contains"
              className="h-9"
              onCommit={(anchor) => set({ anchor })}
            />
          </Field>

          <Field label="Source">
            <Select
              value={filter.sources.length === 1 ? filter.sources[0] : ''}
              onChange={(event) =>
                set({ sources: event.target.value ? [event.target.value] : [] })
              }
              aria-label="Source"
              className="h-9"
            >
              <option value="">Any source</option>
              {sourceOptions.map((source) => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Link type">
            <Select
              value={filter.linkTypes.length === 1 ? filter.linkTypes[0] : ''}
              onChange={(event) =>
                set({ linkTypes: event.target.value ? [event.target.value] : [] })
              }
              aria-label="Link type"
              className="h-9"
            >
              <option value="">Any type</option>
              {DEFAULT_LINK_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </Select>
          </Field>

          {/*
            A price range only ever matches rows that have a price. A blank
            is not nothing-spent and a range that swept them in would make
            every "under £100" list mostly rows nobody has negotiated yet.
          */}
          <Field label={`Price (${currency})`}>
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                min={0}
                value={filter.priceMinMinor === null ? '' : String(filter.priceMinMinor / 100)}
                placeholder="Min"
                aria-label="Minimum price"
                className="tabular h-9"
                onChange={(event) =>
                  set({
                    priceMinMinor:
                      event.target.value === ''
                        ? null
                        : Math.round(Number(event.target.value) * 100),
                  })
                }
              />
              <span className="text-[12px] text-muted">to</span>
              <Input
                type="number"
                min={0}
                value={filter.priceMaxMinor === null ? '' : String(filter.priceMaxMinor / 100)}
                placeholder="Max"
                aria-label="Maximum price"
                className="tabular h-9"
                onChange={(event) =>
                  set({
                    priceMaxMinor:
                      event.target.value === ''
                        ? null
                        : Math.round(Number(event.target.value) * 100),
                  })
                }
              />
            </div>
          </Field>

          <Field label="Planned between">
            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                value={filter.plannedFrom ?? ''}
                aria-label="Planned from"
                className="h-9"
                onChange={(event) => set({ plannedFrom: event.target.value || null })}
              />
              <span className="text-[12px] text-muted">and</span>
              <Input
                type="date"
                value={filter.plannedTo ?? ''}
                aria-label="Planned to"
                className="h-9"
                onChange={(event) => set({ plannedTo: event.target.value || null })}
              />
            </div>
          </Field>

          {/*
            Statuses as checkboxes as well as the dropdown above, because
            "live or waiting" is a real question and a dropdown cannot ask
            it. The dropdown stays for the one-status case, which is most of
            them, and shows the count when this has been used.
          */}
          <fieldset className="sm:col-span-2 lg:col-span-2">
            <legend className="mb-1 block text-[11px] font-semibold tracking-[0.04em] text-muted uppercase">
              Or several statuses
            </legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {statusOptions.map((status) => (
                <label key={status.id} className="flex items-center gap-1.5 text-[13px] text-ink">
                  <Checkbox
                    checked={filter.statusIds.includes(status.id)}
                    onChange={() =>
                      set({
                        statusIds: filter.statusIds.includes(status.id)
                          ? filter.statusIds.filter((id) => id !== status.id)
                          : [...filter.statusIds, status.id],
                      })
                    }
                    aria-label={status.name}
                  />
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: status.colour }}
                  />
                  {status.name}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold tracking-[0.04em] text-muted uppercase">
        {label}
      </span>
      {children}
    </label>
  );
}

/**
 * A text box that navigates once somebody stops typing.
 *
 * The draft is local so the cursor stays put; the server's value wins when
 * it changes underneath, which is what makes Clear actually clear the box.
 */
function DebouncedInput({
  value,
  placeholder,
  ariaLabel,
  className,
  onCommit,
}: {
  value: string;
  placeholder: string;
  ariaLabel: string;
  className?: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setDraft(value);
  }

  useEffect(() => {
    if (draft === value) return;
    const timer = setTimeout(() => onCommit(draft), 400);
    return () => clearTimeout(timer);
    // `onCommit` is rebuilt every render by the parent; depending on it
    // would restart the timer on every keystroke's re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, value]);

  return (
    <Input
      value={draft}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={className}
      onChange={(event) => setDraft(event.target.value)}
    />
  );
}
