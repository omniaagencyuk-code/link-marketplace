'use client';

import { useRef, useState } from 'react';
import { Download, FileSpreadsheet, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { buildTemplateCsv, downloadCsv, MAX_FILE_BYTES, MAX_ROWS } from '@/lib/import/csv';
import { cn } from '@/lib/utils/cn';

/** Step 1: choose a file, by drag and drop or the file picker. */
export function CsvUpload({
  onFile,
  error,
  busy,
}: {
  onFile: (file: File) => void;
  error?: string | null;
  busy?: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (file) onFile(file);
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          handleFiles(event.dataTransfer.files);
        }}
        className={cn(
          'rounded-[var(--radius-card)] border-2 border-dashed bg-white px-6 py-12 text-center transition-colors',
          dragging ? 'border-accent-500 bg-accent-50/60' : 'border-line-strong',
        )}
      >
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-surface-sunken text-muted">
          <FileSpreadsheet className="h-5 w-5" aria-hidden="true" />
        </span>
        <p className="mt-4 text-[15px] font-semibold text-ink">
          Drag a CSV here, or choose a file
        </p>
        <p className="mt-1 text-[13px] text-muted">
          Up to {MAX_ROWS.toLocaleString('en-GB')} rows and{' '}
          {Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB. CSV only.
        </p>

        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(event) => handleFiles(event.target.files)}
        />

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button variant="accent" onClick={() => inputRef.current?.click()} disabled={busy}>
            <Upload className="h-4 w-4" />
            {busy ? 'Reading file...' : 'Choose CSV file'}
          </Button>
          <Button
            variant="outline"
            onClick={() => downloadCsv('press-parrot-import-template.csv', buildTemplateCsv())}
          >
            <Download className="h-4 w-4" />
            Download CSV template
          </Button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">
          {error}
        </p>
      ) : null}

      <p className="text-[12px] leading-relaxed text-muted">
        Only the domain column is required. Everything else is optional, and any column the
        importer does not recognise is ignored. Full URLs, www prefixes, prices like £250 and
        traffic like 45K are all handled for you.
      </p>
    </div>
  );
}
