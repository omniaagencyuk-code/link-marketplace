'use client';

import Link from 'next/link';
import { CheckCircle2, Download, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { downloadCsv, toCsv } from '@/lib/import/csv';
import type { ImportBatchResult } from '@/lib/import/types';

export interface ImportOutcome extends ImportBatchResult {
  fileName: string;
}

/** Step 5: what happened, and how to get the failures back out. */
export function ImportResults({
  outcome,
  onImportAnother,
}: {
  outcome: ImportOutcome;
  onImportAnother: () => void;
}) {
  const tiles = [
    { label: 'Successfully added', value: outcome.created, tone: 'text-accent-700' },
    { label: 'Updated', value: outcome.updated, tone: 'text-blue-700' },
    { label: 'Skipped duplicates', value: outcome.skipped, tone: 'text-ink-soft' },
    { label: 'Failed', value: outcome.failed.length, tone: 'text-negative' },
  ];

  function downloadErrors() {
    const rows = outcome.failed.map((failure) => [
      failure.rowNumber,
      failure.domain,
      failure.reason,
    ]);
    downloadCsv(
      `press-parrot-import-errors-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(['original_row_number', 'domain', 'error_reason'], rows),
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-[var(--radius-card)] border border-line bg-white px-5 py-6 shadow-[var(--shadow-card)]">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-50 text-accent-700">
            <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-[17px] font-semibold text-ink">Import complete</h2>
            <p className="text-[13px] text-muted">{outcome.fileName}</p>
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {tiles.map((tile) => (
            <div key={tile.label} className="rounded-lg border border-line bg-surface px-4 py-3">
              <dt className="text-[12px] text-muted">{tile.label}</dt>
              <dd className={`tabular mt-1 text-xl font-semibold ${tile.tone}`}>
                {tile.value.toLocaleString('en-GB')}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button asChild variant="accent">
          <Link href="/admin/websites">View imported websites</Link>
        </Button>
        {outcome.failed.length > 0 ? (
          <Button variant="outline" onClick={downloadErrors}>
            <Download className="h-4 w-4" />
            Download error report
          </Button>
        ) : null}
        <Button variant="outline" onClick={onImportAnother}>
          <RotateCcw className="h-4 w-4" />
          Import another CSV
        </Button>
      </div>

      {outcome.failed.length > 0 ? (
        <div className="rounded-[var(--radius-card)] border border-line bg-white p-4 shadow-[var(--shadow-card)]">
          <h3 className="text-[13px] font-semibold text-ink">
            First {Math.min(10, outcome.failed.length)} failures
          </h3>
          <ul className="mt-2 space-y-1">
            {outcome.failed.slice(0, 10).map((failure) => (
              <li key={`${failure.rowNumber}-${failure.domain}`} className="text-[12px] text-muted">
                <span className="tabular text-ink-soft">Row {failure.rowNumber}</span>
                {' · '}
                {failure.domain || 'no domain'}
                {' · '}
                {failure.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
