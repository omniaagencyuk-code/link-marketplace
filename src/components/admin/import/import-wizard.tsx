'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { CsvUpload } from './csv-upload';
import { ColumnMapper } from './column-mapper';
import { ImportSummary } from './import-summary';
import { ImportPreviewTable } from './import-preview-table';
import { ImportProgress } from './import-progress';
import { ImportResults, type ImportOutcome } from './import-results';
import {
  finishImportAction,
  getExistingDomainsAction,
  importWebsitesBatchAction,
} from '@/app/admin/(protected)/websites/import/actions';
import { autoMapColumns, unmappedRequiredFields, type ColumnMapping } from '@/lib/import/auto-map';
import { MAX_FILE_BYTES, MAX_ROWS, parseCsvFile } from '@/lib/import/csv';
import { prepareRows, reprepareRow } from '@/lib/import/prepare';
import type { ImportFieldKey } from '@/lib/import/fields';
import type {
  DuplicateMode,
  ImportCounts,
  ImportPayloadRow,
  PreparedRow,
} from '@/lib/import/types';
import { cn } from '@/lib/utils/cn';

/** Rows per server call. Small enough to keep payloads sane, big enough to be quick. */
const BATCH_SIZE = 200;
/** Above this, ask before writing. */
const CONFIRM_ABOVE = 100;

const steps = ['Upload CSV', 'Map columns', 'Review', 'Import', 'Results'] as const;
type Step = 0 | 1 | 2 | 3 | 4;

export function ImportWizard({ currencySymbol }: { currencySymbol: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(0);
  const [file, setFile] = useState<File | null>(null);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [rows, setRows] = useState<PreparedRow[]>([]);
  const [existingDomains, setExistingDomains] = useState<Map<string, string>>(new Map());
  const [duplicateMode, setDuplicateMode] = useState<DuplicateMode>('skip');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  // Guards against a double click firing two imports.
  const importing = useRef(false);

  const prepareOptions = useMemo(
    () => ({ existingDomains, currency: currencySymbol === '£' ? 'GBP' : 'USD' }),
    [existingDomains, currencySymbol],
  );

  // ------------------------------------------------------------- step one
  const handleFile = useCallback(async (chosen: File) => {
    setError(null);

    if (!/\.csv$/i.test(chosen.name) && chosen.type !== 'text/csv') {
      setError('That file is not a CSV. Export your spreadsheet as CSV and try again.');
      return;
    }
    if (chosen.size > MAX_FILE_BYTES) {
      setError(
        `That file is ${(chosen.size / 1024 / 1024).toFixed(1)} MB. The limit is ${Math.round(
          MAX_FILE_BYTES / 1024 / 1024,
        )} MB.`,
      );
      return;
    }

    setBusy(true);
    try {
      const [parsed, domains] = await Promise.all([
        parseCsvFile(chosen),
        getExistingDomainsAction(),
      ]);

      if (parsed.rows.length === 0) {
        setError('That CSV has no data rows.');
        return;
      }

      setFile(chosen);
      setRawRows(parsed.rows);
      setMappings(autoMapColumns(parsed.headers));
      setExistingDomains(new Map(Object.entries(domains)));
      if (parsed.truncated > 0) {
        setError(
          `Only the first ${MAX_ROWS.toLocaleString('en-GB')} rows were read; ${parsed.truncated.toLocaleString('en-GB')} were ignored.`,
        );
      }
      setStep(1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That file could not be read.');
    } finally {
      setBusy(false);
    }
  }, []);

  // ------------------------------------------------------------- step two
  const missingRequired = unmappedRequiredFields(mappings);

  function setMapping(header: string, field: ImportFieldKey | null) {
    setMappings((current) =>
      current.map((mapping) =>
        mapping.header === header ? { ...mapping, field, auto: false } : mapping,
      ),
    );
  }

  function goToReview() {
    setRows(prepareRows(rawRows, mappings, prepareOptions));
    setStep(2);
  }

  // ----------------------------------------------------------- step three
  const counts: ImportCounts = useMemo(
    () => ({
      total: rows.length,
      ready: rows.filter((row) => row.status === 'ready').length,
      warning: rows.filter((row) => row.status === 'warning').length,
      error: rows.filter((row) => row.status === 'error').length,
      existing: rows.filter((row) => row.status === 'existing').length,
      duplicate: rows.filter((row) => row.status === 'duplicate').length,
    }),
    [rows],
  );

  const importable = useMemo(
    () =>
      rows.filter((row) => {
        if (!row.selected || row.status === 'error' || row.status === 'duplicate') return false;
        // "Skip existing" is the default, so those rows are counted out here
        // rather than silently dropped on the server.
        if (row.status === 'existing' && duplicateMode === 'skip') return false;
        return true;
      }),
    [rows, duplicateMode],
  );

  function toggleRow(rowNumber: number) {
    setRows((current) =>
      current.map((row) =>
        row.rowNumber === rowNumber ? { ...row, selected: !row.selected } : row,
      ),
    );
  }

  function toggleFiltered(rowNumbers: number[], selected: boolean) {
    const wanted = new Set(rowNumbers);
    setRows((current) =>
      current.map((row) =>
        wanted.has(row.rowNumber) && row.status !== 'error' ? { ...row, selected } : row,
      ),
    );
  }

  function editRow(rowNumber: number, header: string, value: string) {
    setRows((current) => {
      const seen = new Map<string, number>();
      for (const row of current) {
        if (row.domain && !seen.has(row.domain)) seen.set(row.domain, row.rowNumber);
      }
      return current.map((row) => {
        if (row.rowNumber !== rowNumber) return row;
        const updated = { ...row, raw: { ...row.raw, [header]: value } };
        return reprepareRow(updated, mappings, prepareOptions, seen);
      });
    });
  }

  // ------------------------------------------------------------ step four
  async function runImport() {
    if (importing.current || importable.length === 0) return;

    if (importable.length > CONFIRM_ABOVE) {
      const verb = duplicateMode === 'update' ? 'import or update' : 'import';
      const confirmed = window.confirm(
        `You are about to ${verb} ${importable.length.toLocaleString('en-GB')} websites into Press Parrot.\n\nContinue?`,
      );
      if (!confirmed) return;
    }

    importing.current = true;
    setStep(3);
    setProgress({ done: 0, total: importable.length });

    const payload: ImportPayloadRow[] = importable.map((row) => ({
      rowNumber: row.rowNumber,
      domain: row.domain,
      values: row.values,
      supplied: row.supplied,
      existingId: row.existingId,
    }));

    const totals: ImportOutcome = {
      created: 0,
      updated: 0,
      skipped: 0,
      failed: [],
      fileName: file?.name ?? 'import.csv',
    };

    try {
      for (let index = 0; index < payload.length; index += BATCH_SIZE) {
        const batch = payload.slice(index, index + BATCH_SIZE);
        const result = await importWebsitesBatchAction(batch, duplicateMode);
        totals.created += result.created;
        totals.updated += result.updated;
        totals.skipped += result.skipped;
        totals.failed.push(...result.failed);
        setProgress({ done: Math.min(index + batch.length, payload.length), total: payload.length });
      }

      // Rows the admin chose to leave behind still belong in the history.
      const skippedExisting =
        duplicateMode === 'skip' ? counts.existing : 0;
      totals.skipped += skippedExisting;

      await finishImportAction({
        fileName: totals.fileName,
        duplicateMode,
        rowsUploaded: rows.length,
        rowsAdded: totals.created,
        rowsUpdated: totals.updated,
        rowsSkipped: totals.skipped,
        rowsFailed: totals.failed.length,
      });

      setOutcome(totals);
      setStep(4);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? `The import stopped: ${caught.message}`
          : 'The import stopped unexpectedly.',
      );
      setOutcome({ ...totals });
      setStep(4);
    } finally {
      importing.current = false;
    }
  }

  function reset() {
    setStep(0);
    setFile(null);
    setRawRows([]);
    setMappings([]);
    setRows([]);
    setOutcome(null);
    setError(null);
    setProgress({ done: 0, total: 0 });
  }

  return (
    <div className="space-y-6">
      <StepIndicator current={step} />

      {step === 0 ? <CsvUpload onFile={handleFile} error={error} busy={busy} /> : null}

      {step === 1 ? (
        <>
          <ColumnMapper
            mappings={mappings}
            sampleRow={rawRows[0]}
            onChange={setMapping}
            missingRequired={missingRequired}
          />
          <StepNav
            onBack={reset}
            backLabel="Choose a different file"
            onNext={goToReview}
            nextLabel="Review rows"
            nextDisabled={missingRequired.length > 0}
          />
        </>
      ) : null}

      {step === 2 ? (
        <>
          <ImportSummary counts={counts} />

          <div className="rounded-[var(--radius-card)] border border-line bg-white px-5 py-4 shadow-[var(--shadow-card)]">
            <label htmlFor="duplicate-mode" className="text-[13px] font-semibold text-ink">
              Websites already in the marketplace
            </label>
            <p className="mt-1 text-[12px] text-muted">
              {counts.existing.toLocaleString('en-GB')} of these domains are already listed.
            </p>
            <Select
              id="duplicate-mode"
              value={duplicateMode}
              onChange={(event) => setDuplicateMode(event.target.value as DuplicateMode)}
              className="mt-2 sm:max-w-80"
            >
              <option value="skip">Skip existing websites (recommended)</option>
              <option value="update">Update existing websites</option>
            </Select>
            {duplicateMode === 'update' ? (
              <p className="mt-2 text-[12px] text-muted">
                Only columns present in your CSV are written. Empty cells never blank an existing
                value.
              </p>
            ) : null}
          </div>

          <ImportPreviewTable
            rows={rows}
            onToggleRow={toggleRow}
            onToggleFiltered={toggleFiltered}
            onEditRow={editRow}
            currencySymbol={currencySymbol}
          />

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-line bg-white px-5 py-4 shadow-[var(--shadow-card)]">
            <div>
              <p className="text-[13px] text-ink-soft">
                <span className="tabular font-semibold text-ink">
                  {importable.length.toLocaleString('en-GB')}
                </span>{' '}
                websites will be imported
              </p>
              {counts.error > 0 ? (
                <p className="mt-0.5 text-[12px] text-muted">
                  {counts.error.toLocaleString('en-GB')} rows with errors are excluded.
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft className="h-4 w-4" />
                Back to mapping
              </Button>
              <Button variant="accent" onClick={runImport} disabled={importable.length === 0}>
                <Upload className="h-4 w-4" />
                Import {importable.length.toLocaleString('en-GB')} websites
              </Button>
            </div>
          </div>
        </>
      ) : null}

      {step === 3 ? <ImportProgress done={progress.done} total={progress.total} /> : null}

      {step === 4 && outcome ? (
        <>
          {error ? (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">
              {error}
            </p>
          ) : null}
          <ImportResults outcome={outcome} onImportAnother={reset} />
        </>
      ) : null}

      {step === 0 ? (
        <p className="text-[12px] text-muted">
          Prefer to add one site?{' '}
          <Link href="/admin/websites/new" className="text-accent-700 hover:underline">
            Use the single website form
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}

function StepIndicator({ current }: { current: Step }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-2">
      {steps.map((label, index) => {
        const state = index < current ? 'done' : index === current ? 'current' : 'todo';
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={cn(
                'tabular flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold',
                state === 'done' && 'bg-accent-600 text-white',
                state === 'current' && 'bg-navy-900 text-white',
                state === 'todo' && 'bg-surface-sunken text-muted',
              )}
            >
              {index + 1}
            </span>
            <span
              className={cn(
                'text-[13px]',
                state === 'todo' ? 'text-muted' : 'font-medium text-ink',
              )}
            >
              {label}
            </span>
            {index < steps.length - 1 ? (
              <span aria-hidden="true" className="mx-1 h-px w-6 bg-line-strong" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function StepNav({
  onBack,
  backLabel,
  onNext,
  nextLabel,
  nextDisabled,
}: {
  onBack: () => void;
  backLabel: string;
  onNext: () => void;
  nextLabel: string;
  nextDisabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Button variant="outline" onClick={onBack}>
        <ArrowLeft className="h-4 w-4" />
        {backLabel}
      </Button>
      <Button variant="accent" onClick={onNext} disabled={nextDisabled}>
        {nextLabel}
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
