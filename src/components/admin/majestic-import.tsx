'use client';

import { useState, useTransition } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ProgressBar } from '@/components/ui/progress-bar';
import { applyMajesticAction } from '@/app/admin/(protected)/majestic/actions';
import { parseCsvFile } from '@/lib/import/csv';
import { readMajesticCsv, type MajesticReading } from '@/lib/majestic/parse';
import { chunk } from '@/lib/utils/chunk';
import { acceptedOrEmpty } from '@/lib/majestic/summary';

/** How many listings to send in one request, for the same reason as everywhere else. */
const CHUNK = 100;

/**
 * Drop a Bulk Backlink Checker export in.
 *
 * Parsed in the browser, like the website importer, so the sixty columns
 * Majestic exports never cross the wire - six of them do. What is sent is
 * already typed readings, which also means this screen can say what it found
 * before anything is written.
 */
export function MajesticImport() {
  const [busy, startTransition] = useTransition();
  const [readings, setReadings] = useState<MajesticReading[]>([]);
  const [unusable, setUnusable] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setMessage(null);
    setProgress(null);
    try {
      const parsed = await parseCsvFile(file);
      const found = readMajesticCsv(parsed.rows);
      setReadings(found.readings);
      setUnusable(found.unusable);
      setFileName(file.name);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'That file could not be read.');
    }
  }

  function apply() {
    if (readings.length === 0) return;

    startTransition(async () => {
      const parts = chunk(readings, CHUNK);
      let updated = 0;
      let done = 0;
      const unknown: string[] = [];

      for (const part of parts) {
        setProgress({ done, total: readings.length });
        const outcome = await applyMajesticAction(part, done === 0 ? unusable : []);
        updated += outcome.updated;
        unknown.push(...outcome.unknown);
        done += part.length;
      }

      setProgress(null);
      setMessage(
        `${updated} ${updated === 1 ? 'listing' : 'listings'} updated.` +
          (unknown.length
            ? ` ${unknown.length} not in the marketplace: ${unknown.slice(0, 4).join(', ')}${unknown.length > 4 ? ` and ${unknown.length - 4} more` : ''}.`
            : '') +
          (unusable.length ? ` ${unusable.length} had nothing Majestic could measure.` : ''),
      );
      setReadings([]);
      setFileName(null);
    });
  }

  const summary = acceptedOrEmpty(readings);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import a Majestic export</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-[13px] leading-relaxed text-ink-soft">
          Select the domains on <span className="font-medium text-ink">Websites</span>, press{' '}
          <span className="font-medium text-ink">Copy domains</span>, and paste them into
          Majestic&rsquo;s Bulk Backlink Checker. Export the result and drop the file here. It
          writes trust flow, citation flow and the top three topics, and nothing else - no price,
          no cost, no category.
        </p>

        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-line-strong px-4 py-6 text-[13px] text-ink-soft hover:border-accent-600">
          <Upload className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            {fileName ?? 'Choose a Bulk Backlink Checker export (.csv)'}
          </span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(event) => onFile(event.target.files?.[0])}
          />
        </label>

        {readings.length > 0 ? (
          <div className="space-y-2 rounded-lg border border-line bg-surface-sunken px-3 py-2.5">
            <p className="text-[13px] text-ink">
              <span className="font-medium">{readings.length}</span> domains read
              {unusable.length ? `, ${unusable.length} with nothing measurable` : ''}.
            </p>
            <p className="text-[12px] text-muted">
              {summary.withTopics} carry topics, and {summary.suggested} of those suggest a
              category. Nothing is applied to a category here - the suggestions appear below once
              the figures are in.
            </p>
            <Button variant="accent" size="sm" disabled={busy} onClick={apply}>
              Apply to {readings.length} {readings.length === 1 ? 'listing' : 'listings'}
            </Button>
          </div>
        ) : null}

        {progress ? (
          <ProgressBar
            done={progress.done}
            total={progress.total}
            label={`${progress.done} of ${progress.total} written. Leave this page open.`}
          />
        ) : null}

        {message ? (
          <p role="status" className="text-[13px] text-ink-soft">
            {message}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
