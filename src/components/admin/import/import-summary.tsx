import { AlertCircle, AlertTriangle, CheckCircle2, Copy, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { ImportCounts } from '@/lib/import/types';

/** Totals bar shown above the review table. */
export function ImportSummary({ counts }: { counts: ImportCounts }) {
  const tiles = [
    { key: 'ready', label: 'ready', value: counts.ready, icon: CheckCircle2, tone: 'text-accent-700 bg-accent-50' },
    { key: 'warning', label: 'warnings', value: counts.warning, icon: AlertTriangle, tone: 'text-amber-700 bg-amber-50' },
    { key: 'existing', label: 'already listed', value: counts.existing, icon: RefreshCw, tone: 'text-blue-700 bg-blue-50' },
    { key: 'duplicate', label: 'duplicates in file', value: counts.duplicate, icon: Copy, tone: 'text-ink-soft bg-surface-sunken' },
    { key: 'error', label: 'errors', value: counts.error, icon: AlertCircle, tone: 'text-red-700 bg-red-50' },
  ];

  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-white px-5 py-4 shadow-[var(--shadow-card)]">
      <p className="tabular text-[15px] font-semibold text-ink">
        {counts.total.toLocaleString('en-GB')} rows detected
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((tile) => (
          <div key={tile.key} className="flex items-center gap-2.5">
            <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', tile.tone)}>
              <tile.icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <dt className="sr-only">{tile.label}</dt>
              <dd>
                <span className="tabular block text-[15px] leading-tight font-semibold text-ink">
                  {tile.value.toLocaleString('en-GB')}
                </span>
                <span className="block text-[12px] text-muted">{tile.label}</span>
              </dd>
            </div>
          </div>
        ))}
      </dl>
    </div>
  );
}
