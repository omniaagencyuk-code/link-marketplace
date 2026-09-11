'use client';

import { Input } from '@/components/ui/input';

/** Paired min/max numeric inputs used across the filter sidebar. */
export function RangeFilter({
  label,
  idPrefix,
  min,
  max,
  onChange,
  prefix,
  placeholderMin = 'Min',
  placeholderMax = 'Max',
  step,
}: {
  label: string;
  idPrefix: string;
  min?: number;
  max?: number;
  onChange: (next: { min?: number; max?: number }) => void;
  prefix?: string;
  placeholderMin?: string;
  placeholderMax?: string;
  step?: number;
}) {
  function parse(value: string) {
    if (value === '') return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return (
    <fieldset>
      <legend className="text-[13px] font-semibold text-ink">{label}</legend>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="relative">
          <label htmlFor={`${idPrefix}-min`} className="sr-only">
            {label} minimum
          </label>
          {prefix ? (
            <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[13px] text-muted">
              {prefix}
            </span>
          ) : null}
          <Input
            id={`${idPrefix}-min`}
            type="number"
            inputMode="numeric"
            step={step}
            min={0}
            value={min ?? ''}
            placeholder={placeholderMin}
            onChange={(event) => onChange({ min: parse(event.target.value), max })}
            className={prefix ? 'h-9 pl-6 text-[13px]' : 'h-9 text-[13px]'}
          />
        </div>
        <div className="relative">
          <label htmlFor={`${idPrefix}-max`} className="sr-only">
            {label} maximum
          </label>
          {prefix ? (
            <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[13px] text-muted">
              {prefix}
            </span>
          ) : null}
          <Input
            id={`${idPrefix}-max`}
            type="number"
            inputMode="numeric"
            step={step}
            min={0}
            value={max ?? ''}
            placeholder={placeholderMax}
            onChange={(event) => onChange({ min, max: parse(event.target.value) })}
            className={prefix ? 'h-9 pl-6 text-[13px]' : 'h-9 text-[13px]'}
          />
        </div>
      </div>
    </fieldset>
  );
}
