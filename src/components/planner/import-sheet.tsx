'use client';

import { useState, useTransition } from 'react';
import { Download, FileUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Sheet } from '@/components/ui/sheet';
import { parseCsvFile, downloadCsv, MAX_FILE_BYTES } from '@/lib/import/csv';
import { readImport, mapHeaders, plannerTemplateCsv, type ImportRow } from '@/lib/planner/csv';
import { importLinksAction } from '@/app/dashboard/planner/actions';

/**
 * Moving a spreadsheet in.
 *
 * Read, show what was understood, then import - in that order, because the
 * thing an agency fears about a migration is finding out afterwards that
 * every date came in a month wrong.
 *
 * The preview is the whole point: it names which of their columns was
 * matched to which field, shows the first few rows as the planner read
 * them, and lists by line number anything that could not be read. Nothing
 * is written until the second button.
 *
 * Parsing happens in the browser, so a ten-megabyte file is not uploaded
 * to be rejected. Only the rows that parsed are sent.
 */
export function ImportSheet({
  open,
  projectId,
  month,
  onClose,
  onImported,
}: {
  open: boolean;
  projectId: string;
  month: string;
  onClose: () => void;
  onImported: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [reading, setReading] = useState<{
    rows: ImportRow[];
    problems: { line: number; reason: string }[];
    mapped: [string, string][];
    unmatched: string[];
    fileName: string;
  } | null>(null);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const take = async (file: File) => {
    setError(null);
    setResult(null);
    if (file.size > MAX_FILE_BYTES) {
      setError('That file is larger than 10MB. Split it and import in parts.');
      return;
    }
    try {
      const parsed = await parseCsvFile(file);
      const mapping = mapHeaders(parsed.headers);
      const read = readImport(parsed.headers, parsed.rows, mapping);
      const mapped = Object.entries(mapping)
        .filter(([, header]) => Boolean(header))
        .map(([field, header]) => [header as string, field] as [string, string]);
      const matchedHeaders = new Set(mapped.map(([header]) => header));
      setReading({
        rows: read.rows,
        problems: read.problems,
        mapped,
        unmatched: parsed.headers.filter((header) => !matchedHeaders.has(header)),
        fileName: file.name,
      });
    } catch {
      setError('That file could not be read as a CSV.');
    }
  };

  const run = () => {
    if (!reading) return;
    startTransition(async () => {
      const outcome = await importLinksAction(projectId, month, reading.rows, { skipDuplicates });
      if ('error' in outcome && outcome.error) {
        setError(outcome.error);
        return;
      }
      setResult(
        `Imported ${outcome.imported} link${outcome.imported === 1 ? '' : 's'}` +
          (outcome.skipped ? `, skipped ${outcome.skipped} already in this month.` : '.'),
      );
      setReading(null);
      onImported();
    });
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      side="right"
      mobileOnly={false}
      title="Import links"
      description="Bring an existing spreadsheet into this month. Nothing is written until you confirm."
    >
      <div className="space-y-4">
        <div>
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">CSV file</span>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void take(file);
              }}
              className="w-full rounded-md border border-line-strong bg-white p-2 text-[13px] file:mr-3 file:rounded file:border-0 file:bg-surface-sunken file:px-2.5 file:py-1 file:text-[13px]"
            />
          </label>
          <button
            type="button"
            onClick={() => downloadCsv('press-parrot-planner-template.csv', plannerTemplateCsv())}
            className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-medium text-accent-700 hover:underline"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Download a template
          </button>
          <p className="mt-1 text-[12px] leading-relaxed text-muted">
            An exact template is not required. Column names are matched loosely, so an export
            from your own spreadsheet usually works as it is.
          </p>
        </div>

        {reading ? (
          <>
            <div className="rounded-[var(--radius-card)] border border-line bg-surface p-3">
              <p className="text-[13px] font-semibold text-ink">
                {reading.rows.length} row{reading.rows.length === 1 ? '' : 's'} read from{' '}
                {reading.fileName}
              </p>

              <p className="mt-2 mb-1 text-[11px] font-semibold tracking-[0.04em] text-muted uppercase">
                Columns matched
              </p>
              <ul className="space-y-0.5">
                {reading.mapped.map(([header, field]) => (
                  <li key={header} className="text-[12px] text-ink-soft">
                    <span className="font-medium text-ink">{header}</span> &rarr; {field}
                  </li>
                ))}
              </ul>

              {reading.unmatched.length > 0 ? (
                <p className="mt-2 text-[12px] leading-relaxed text-muted">
                  Not matched, and not imported: {reading.unmatched.join(', ')}.
                </p>
              ) : null}
            </div>

            {reading.rows.length > 0 ? (
              <div>
                <p className="mb-1.5 text-[11px] font-semibold tracking-[0.04em] text-muted uppercase">
                  First rows, as the planner read them
                </p>
                <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line">
                  <table className="w-full text-[12px]">
                    <thead className="bg-surface">
                      <tr>
                        {['Domain', 'Status', 'Anchor', 'Planned', 'Price'].map((head) => (
                          <th key={head} className="px-2 py-1.5 text-left font-semibold text-muted">
                            {head}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {reading.rows.slice(0, 5).map((row, index) => (
                        <tr key={`${row.domainKey}-${index}`} className="border-t border-line">
                          <td className="px-2 py-1.5 font-medium text-ink">{row.domain}</td>
                          <td className="px-2 py-1.5 text-ink-soft">{row.statusName || '—'}</td>
                          <td className="px-2 py-1.5 text-ink-soft">{row.anchorText || '—'}</td>
                          <td className="tabular px-2 py-1.5 text-ink-soft">
                            {row.plannedDate ?? '—'}
                          </td>
                          <td className="tabular px-2 py-1.5 text-ink-soft">
                            {row.priceMinor === null
                              ? '—'
                              : `${row.currency ?? ''} ${row.priceMinor / 100}`.trim()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-1.5 text-[12px] text-muted">
                  Dates read day-first, so 03/10/2026 is the 3rd of October.
                </p>
              </div>
            ) : null}

            {reading.problems.length > 0 ? (
              <div className="rounded-[var(--radius-card)] border border-amber-300 bg-amber-50 p-3">
                <p className="text-[13px] font-semibold text-amber-900">
                  {reading.problems.length} row{reading.problems.length === 1 ? '' : 's'} could not
                  be read
                </p>
                <ul className="mt-1 space-y-0.5">
                  {reading.problems.slice(0, 6).map((problem) => (
                    <li key={problem.line} className="text-[12px] text-amber-900">
                      Line {problem.line}: {problem.reason}
                    </li>
                  ))}
                </ul>
                {reading.problems.length > 6 ? (
                  <p className="mt-1 text-[12px] text-amber-900">
                    and {reading.problems.length - 6} more.
                  </p>
                ) : null}
                <p className="mt-1.5 text-[12px] text-amber-900">
                  The rest will still import.
                </p>
              </div>
            ) : null}

            <label className="flex items-start gap-2">
              <Checkbox
                checked={skipDuplicates}
                onChange={() => setSkipDuplicates((value) => !value)}
                aria-label="Skip domains already in this month"
              />
              <span className="text-[13px] leading-relaxed text-ink-soft">
                Skip domains already in this month. Duplicates are reported, never merged -
                choosing between the file&rsquo;s figures and yours is not a decision an import
                should make.
              </span>
            </label>

            <Button
              variant="accent"
              className="w-full"
              onClick={run}
              disabled={pending || reading.rows.length === 0}
            >
              <FileUp className="h-4 w-4" aria-hidden="true" />
              {pending ? 'Importing...' : `Import ${reading.rows.length} rows`}
            </Button>
          </>
        ) : null}

        {result ? (
          <p role="status" className="rounded-lg border border-accent-500/30 bg-accent-50 px-3 py-2 text-[13px] text-accent-800">
            {result}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="rounded-lg border border-negative/30 bg-negative/5 px-3 py-2 text-[13px] text-negative">
            {error}
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}
