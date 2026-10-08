'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { RANGE_LABELS, type RangeKey } from '@/lib/admin/date-range';

/**
 * Which window the figures are counted over.
 *
 * Written into the URL rather than held here, because the counting happens on
 * the server: the page is a server component that reads the range and asks the
 * database. That also makes a range linkable and reloadable, which a dropdown
 * holding its own state is not.
 *
 * Every option listed is one the queries support. There is no "last hour"
 * because `placed_at` is the only time an order carries and an hour of it is
 * a window the series would draw as a single point.
 */
const PRESETS: RangeKey[] = ['today', '7d', '30d', '90d', 'year', 'all'];

export function RangePicker({
  current,
  from,
  to,
}: {
  current: RangeKey;
  from: string;
  to: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [custom, setCustom] = useState({ from, to });

  function go(next: Record<string, string | null>) {
    const query = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === null) query.delete(key);
      else query.set(key, value);
    }
    router.push(`/admin?${query.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor="admin-range" className="sr-only">
        Date range
      </label>
      <div className="relative">
        <CalendarDays
          className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted"
          aria-hidden="true"
        />
        <select
          id="admin-range"
          value={current}
          onChange={(event) => {
            const key = event.target.value as RangeKey;
            // Switching away from a custom range drops its dates, so the URL
            // never carries a window that is not the one being shown.
            go(key === 'custom' ? { range: key } : { range: key, from: null, to: null });
          }}
          className="h-10 appearance-none rounded-lg border border-line bg-white pr-8 pl-9 text-[13px] font-medium text-ink transition-colors hover:border-muted-soft focus:border-accent-500 focus:outline-none"
        >
          {PRESETS.map((key) => (
            <option key={key} value={key}>
              {RANGE_LABELS[key]}
            </option>
          ))}
          <option value="custom">{RANGE_LABELS.custom}</option>
        </select>
      </div>

      {current === 'custom' ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            go({ range: 'custom', from: custom.from, to: custom.to });
          }}
        >
          <label htmlFor="range-from" className="sr-only">
            From
          </label>
          <input
            id="range-from"
            type="date"
            required
            value={custom.from}
            onChange={(event) => setCustom((was) => ({ ...was, from: event.target.value }))}
            className="h-10 rounded-lg border border-line bg-white px-2.5 text-[13px] text-ink focus:border-accent-500 focus:outline-none"
          />
          <span className="text-[13px] text-muted">to</span>
          <label htmlFor="range-to" className="sr-only">
            To
          </label>
          <input
            id="range-to"
            type="date"
            required
            value={custom.to}
            onChange={(event) => setCustom((was) => ({ ...was, to: event.target.value }))}
            className="h-10 rounded-lg border border-line bg-white px-2.5 text-[13px] text-ink focus:border-accent-500 focus:outline-none"
          />
          <button
            type="submit"
            className="h-10 rounded-lg bg-navy-900 px-3 text-[13px] font-medium text-white transition-colors hover:bg-navy-800"
          >
            Apply
          </button>
        </form>
      ) : null}
    </div>
  );
}
