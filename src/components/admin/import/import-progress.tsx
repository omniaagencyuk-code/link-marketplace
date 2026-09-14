import { Loader2 } from 'lucide-react';

/** Step 4: batch progress, so a large import never looks frozen. */
export function ImportProgress({ done, total }: { done: number; total: number }) {
  const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;

  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-white px-5 py-6 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-3">
        <Loader2 className="h-4 w-4 animate-spin text-accent-600" aria-hidden="true" />
        <p className="text-[15px] font-semibold text-ink">Importing websites</p>
      </div>

      <p className="tabular mt-1.5 text-[13px] text-muted">
        {done.toLocaleString('en-GB')} of {total.toLocaleString('en-GB')}
      </p>

      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Import progress"
        className="mt-4 h-2 overflow-hidden rounded-full bg-surface-sunken"
      >
        <div
          className="h-full rounded-full bg-accent-600 transition-[width] duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>

      <p className="mt-3 text-[12px] text-muted">
        Keep this tab open until the import finishes.
      </p>
    </div>
  );
}
