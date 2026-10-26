'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils/cn';
import {
  filterOptions,
  selectedLabels,
  summariseSelection,
  toggleOption,
  type FilterOption,
} from '@/lib/marketplace/options';

/**
 * A quick filter that holds a list: pick several, and type to find them.
 *
 * ## Why it is not a `<select multiple>`
 *
 * The three things asked of this control - alphabetical, typeable, several
 * at once - are the three a native select cannot do together. `multiple`
 * renders an always-open scroll box that ctrl-clicks to add, which nobody
 * discovers and which no phone draws usefully; and nothing native filters
 * its own options as you type. So it is a button that opens a panel with a
 * search field and checkboxes, which is the shape the advanced filters
 * already use - the same `Checkbox`, the same row, the same wording.
 *
 * ## What it is, to a screen reader
 *
 * A disclosure, not a combobox. The ARIA combobox pattern with
 * `aria-multiselectable` has to own arrow keys, active descendants and its
 * own focus model, and a half-built one announces less than the plain thing
 * it replaced. This is a button that says what is selected, opening a group
 * of real checkboxes with a real search field - all of which a screen
 * reader already knows how to read, and all of which work from the keyboard
 * by tabbing.
 *
 * The button is labelled by its field name *and* its own text, so it is
 * announced as "Country, 3 countries" rather than as either half alone.
 *
 * ## The keyboard shortcuts on top of that
 *
 * Typing is the point, so the search field takes focus when the panel
 * opens. From there Enter toggles the first match, which makes
 * "united↵germany↵" a way to pick two countries without leaving the
 * keyboard, and ArrowDown steps into the list for people who would rather
 * see what they are ticking. Escape closes and gives focus back to the
 * button, because a panel that eats Escape traps whoever opened it.
 *
 * ## It never closes on a choice
 *
 * A control for picking several that shuts after the first one is a control
 * for picking one. It closes on Escape, on a click outside, or on the
 * button - and the search text is dropped each time it opens, because the
 * previous visit's query is not a filter anybody asked to keep.
 */
export function MultiSelectFilter<T extends string>({
  label,
  options,
  selected,
  onChange,
  allLabel,
  noun,
  searchPlaceholder,
  emptyText,
  note,
  className,
}: {
  label: string;
  options: FilterOption<T>[];
  selected: readonly T[];
  onChange: (next: T[]) => void;
  /** What the closed control says with nothing picked - "All niches". */
  allLabel: string;
  /** Plural for the count, when more than one is picked - "countries". */
  noun: string;
  searchPlaceholder: string;
  /** Shown when the list itself is empty, before anybody has typed. */
  emptyText: string;
  /** A caveat about what picking any of these does, drawn under the list. */
  note?: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const labelId = useId();
  const buttonId = useId();
  const panelId = useId();

  const chosen = useMemo(() => new Set<string>(selected), [selected]);
  const shown = useMemo(() => filterOptions(options, query), [options, query]);
  const summary = summariseSelection(selectedLabels(options, selected), {
    all: allLabel,
    noun,
  });

  /*
    Closing on a click outside, on `pointerdown` rather than `click`: a
    mousedown that starts in the panel and ends outside it is a drag of the
    scrollbar, and closing on that loses the list mid-scroll.
  */
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  // Opening is a request to type, so that is where the cursor goes.
  useEffect(() => {
    if (open) search.current?.focus();
  }, [open]);

  const toggle = (value: T) => onChange(toggleOption(selected, value));

  const close = () => {
    setOpen(false);
    button.current?.focus();
  };

  const stepInto = () => {
    const first = list.current?.querySelector<HTMLInputElement>('input[type="checkbox"]');
    first?.focus();
  };

  return (
    <div ref={wrapper} className={cn('relative block min-w-0', className)}>
      <span id={labelId} className="mb-1.5 block text-[12px] font-medium text-ink-soft">
        {label}
      </span>

      <button
        ref={button}
        id={buttonId}
        type="button"
        /* Both halves: the field's name, then what this one says. */
        aria-labelledby={`${labelId} ${buttonId}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setQuery('');
          setOpen((was) => !was);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault();
            setQuery('');
            setOpen(true);
          }
        }}
        className={cn(
          'flex h-10 w-full items-center justify-between gap-2 rounded-md border bg-white px-3 text-left text-sm font-medium transition-colors',
          'hover:border-muted-soft focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 focus:outline-none',
          selected.length > 0 ? 'border-accent-500 text-ink' : 'border-line-strong text-ink',
        )}
      >
        <span className="truncate" title={selected.length > 1 ? selectedLabels(options, selected).join(', ') : undefined}>
          {summary}
        </span>
        <ChevronDown
          className={cn('h-3.5 w-3.5 shrink-0 text-muted transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div
          id={panelId}
          role="group"
          aria-labelledby={labelId}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              close();
            }
          }}
          className="absolute z-30 mt-1.5 w-full min-w-[15rem] rounded-lg border border-line-strong bg-white p-2 shadow-[var(--shadow-pop)]"
        >
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <input
              ref={search}
              type="text"
              role="searchbox"
              value={query}
              aria-label={`Search ${label.toLowerCase()}`}
              placeholder={searchPlaceholder}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  // The fast path: type enough to be sure, press Enter, keep
                  // typing. Only ever the first match, so what it ticks is
                  // the row the eye is already on.
                  event.preventDefault();
                  const first = shown[0];
                  if (first) toggle(first.value);
                  return;
                }
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  stepInto();
                }
              }}
              className={cn(
                'h-9 w-full rounded-md border border-line bg-surface pr-7 pl-8 text-[13px] text-ink',
                'placeholder:text-muted-soft focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 focus:outline-none',
              )}
            />
            {query ? (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  search.current?.focus();
                }}
                aria-label="Clear the search"
                className="absolute top-1/2 right-1.5 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-muted hover:bg-surface-sunken hover:text-ink"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            ) : null}
          </div>

          <div
            ref={list}
            className="hide-scrollbar mt-2 max-h-60 space-y-0.5 overflow-y-auto pr-0.5"
          >
            {options.length === 0 ? (
              <p className="px-1.5 py-3 text-[12px] text-muted">{emptyText}</p>
            ) : shown.length === 0 ? (
              /*
                Named rather than a bare "No results": the thing somebody
                needs to know is that this list has no such entry, not that
                a search failed.
              */
              <p className="px-1.5 py-3 text-[12px] text-muted">
                Nothing here matches &ldquo;{query}&rdquo;.
              </p>
            ) : (
              shown.map((option) => {
                const id = `${panelId}-${option.value}`;
                return (
                  <div
                    key={option.value}
                    className="flex items-center gap-2.5 rounded px-1.5 py-1 hover:bg-surface"
                  >
                    <Checkbox
                      id={id}
                      checked={chosen.has(option.value)}
                      onChange={() => toggle(option.value)}
                    />
                    <label
                      htmlFor={id}
                      className="flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-2 text-[13px] text-ink-soft hover:text-ink"
                    >
                      <span className="truncate">{option.label}</span>
                      {option.count === undefined ? null : (
                        <span className="tabular shrink-0 text-[11px] text-muted">
                          {option.count.toLocaleString('en-GB')}
                        </span>
                      )}
                    </label>
                  </div>
                );
              })
            )}
          </div>

          {note ? <div className="mt-2 border-t border-line px-1.5 pt-2">{note}</div> : null}

          <div className="mt-2 flex items-center justify-between gap-2 border-t border-line px-1.5 pt-2">
            <span className="text-[11px] text-muted">
              {selected.length === 0
                ? `Any ${noun.replace(/s$/, '')}`
                : `${selected.length} selected`}
            </span>
            <div className="flex items-center gap-1">
              {selected.length > 0 ? (
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="rounded px-2 py-1 text-[12px] font-medium text-muted hover:bg-surface hover:text-ink"
                >
                  Clear
                </button>
              ) : null}
              <button
                type="button"
                onClick={close}
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-[12px] font-medium text-accent-700 hover:bg-accent-50"
              >
                <Check className="h-3 w-3" aria-hidden="true" />
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
