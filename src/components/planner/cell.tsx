'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils/cn';

/**
 * The inline-editing cells, and the save behaviour behind them.
 *
 * ## Save on blur, not on every keystroke
 *
 * A debounced save per keypress writes a dozen times while somebody types
 * an anchor, and each one is a round trip to London. Text saves when the
 * field loses focus or on Enter; a dropdown or a date saves at once,
 * because picking one is already the end of the interaction.
 *
 * ## The value the customer typed is never thrown away
 *
 * Every cell holds its own draft. A failed save keeps the draft on screen,
 * marks the cell, and offers the retry - it does not revert to the server's
 * value, which would silently delete what somebody just wrote. That is the
 * one failure mode worth more than all the others here: a planner that
 * loses a row of work is a planner somebody stops trusting, and they only
 * have to catch it once.
 *
 * ## Nothing optimistic is left showing if it did not happen
 *
 * The cell shows the draft while saving, confirms briefly, and on failure
 * keeps the draft *and* the error. There is no state in which the screen
 * shows a saved-looking value the database does not have.
 */

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const stateRing: Record<SaveState, string> = {
  idle: '',
  saving: 'ring-1 ring-accent-500/30',
  saved: 'ring-1 ring-accent-500/50',
  error: 'ring-1 ring-negative/60 bg-negative/5',
};

function useCellSave<T>(initial: T, save: (value: T) => Promise<string | null>) {
  const [draft, setDraft] = useState<T>(initial);
  const [state, setState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);

  /*
    The server's value wins only while the cell is settled.

    Without the guard, a revalidation landing mid-edit would replace what
    somebody is halfway through typing with the row as it was before they
    started.

    Adjusted during render against the last value seen, rather than in an
    effect. An effect that calls `setDraft` renders once with the stale
    draft and again with the new one, and in a table of twenty-five rows
    times seventeen cells that is a lot of wasted renders for a value that
    was already known at render time.
  */
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    if (state === 'idle') setDraft(initial);
  }

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const commit = async (value: T) => {
    if (value === draft && state === 'idle' && value === initial) return;
    setDraft(value);
    setState('saving');
    setError(null);
    const message = await save(value);
    if (message) {
      setState('error');
      setError(message);
      return;
    }
    setState('saved');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 1200);
  };

  return { draft, setDraft, state, error, commit };
}

export function TextCell({
  value,
  onSave,
  placeholder,
  type = 'text',
  align = 'left',
  className,
  ariaLabel,
}: {
  value: string;
  onSave: (value: string) => Promise<string | null>;
  placeholder?: string;
  type?: 'text' | 'url' | 'number';
  align?: 'left' | 'right';
  className?: string;
  ariaLabel: string;
}) {
  const { draft, setDraft, state, error, commit } = useCellSave(value, onSave);

  return (
    <div className="relative">
      <input
        type={type}
        inputMode={type === 'number' ? 'numeric' : undefined}
        value={draft}
        aria-label={ariaLabel}
        aria-invalid={state === 'error'}
        title={error ?? undefined}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => { if (draft !== value) void commit(draft); }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') { setDraft(value); event.currentTarget.blur(); }
        }}
        className={cn(
          'w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-[13px] text-ink',
          'hover:border-line-strong focus:border-accent-500 focus:bg-white focus:outline-none',
          'placeholder:text-muted-soft',
          align === 'right' && 'text-right tabular',
          stateRing[state],
          className,
        )}
      />
      {state === 'error' ? (
        <button
          type="button"
          onClick={() => void commit(draft)}
          className="absolute -bottom-4 left-2 text-[10px] font-medium text-negative hover:underline"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}

export function SelectCell({
  value,
  options,
  onSave,
  ariaLabel,
  placeholder = '—',
  className,
}: {
  value: string;
  options: { value: string; label: string }[];
  onSave: (value: string) => Promise<string | null>;
  ariaLabel: string;
  placeholder?: string;
  className?: string;
}) {
  const { draft, state, error, commit } = useCellSave(value, onSave);

  return (
    <select
      value={draft}
      aria-label={ariaLabel}
      aria-invalid={state === 'error'}
      title={error ?? undefined}
      onChange={(event) => void commit(event.target.value)}
      className={cn(
        'w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 text-[13px] text-ink',
        'hover:border-line-strong focus:border-accent-500 focus:bg-white focus:outline-none',
        stateRing[state],
        className,
      )}
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/**
 * A date, through the browser's own picker.
 *
 * `type="date"` rather than a calendar library: it is a real picker on
 * every platform, it is the native one on touch, it respects the device
 * locale for display while giving us an unambiguous `YYYY-MM-DD`, and it
 * weighs nothing. The brief asks not to add dependencies unnecessarily and
 * this is the clearest case of that in the whole feature.
 */
export function DateCell({
  value,
  onSave,
  ariaLabel,
}: {
  value: string | null;
  onSave: (value: string | null) => Promise<string | null>;
  ariaLabel: string;
}) {
  const { draft, state, error, commit } = useCellSave(value ?? '', async (next) =>
    onSave(next === '' ? null : next),
  );

  return (
    <input
      type="date"
      value={draft}
      aria-label={ariaLabel}
      aria-invalid={state === 'error'}
      title={error ?? undefined}
      onChange={(event) => void commit(event.target.value)}
      className={cn(
        'w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 text-[13px] text-ink',
        'hover:border-line-strong focus:border-accent-500 focus:bg-white focus:outline-none',
        stateRing[state],
      )}
    />
  );
}

/**
 * Money, typed in whole units and stored in minor ones.
 *
 * The customer types 150; the column holds 15000. Converting at the edge
 * rather than storing a float is what keeps a total of forty placements
 * from drifting a penny, which is the kind of error an agency notices and
 * cannot explain.
 */
export function PriceCell({
  minor,
  currency,
  onSave,
  ariaLabel,
}: {
  minor: number | null;
  currency: string;
  onSave: (minor: number | null) => Promise<string | null>;
  ariaLabel: string;
}) {
  const asMajor = minor === null ? '' : String(minor / 100);
  const { draft, setDraft, state, error, commit } = useCellSave(asMajor, async (next) => {
    if (next.trim() === '') return onSave(null);
    const parsed = Number(next);
    if (!Number.isFinite(parsed) || parsed < 0) return 'Enter an amount.';
    return onSave(Math.round(parsed * 100));
  });

  return (
    <div className="relative flex items-center gap-1">
      <span className="shrink-0 text-[11px] text-muted">{currency}</span>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step="0.01"
        value={draft}
        aria-label={ariaLabel}
        aria-invalid={state === 'error'}
        title={error ?? undefined}
        placeholder="—"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => { if (draft !== asMajor) void commit(draft); }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') { setDraft(asMajor); event.currentTarget.blur(); }
        }}
        className={cn(
          'tabular w-full rounded-md border border-transparent bg-transparent px-1 py-1 text-right text-[13px] text-ink',
          'hover:border-line-strong focus:border-accent-500 focus:bg-white focus:outline-none',
          'placeholder:text-muted-soft',
          stateRing[state],
        )}
      />
      {state === 'error' ? (
        <button
          type="button"
          onClick={() => void commit(draft)}
          className="absolute -bottom-4 right-0 text-[10px] font-medium text-negative hover:underline"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}
