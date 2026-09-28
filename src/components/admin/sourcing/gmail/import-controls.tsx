'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { AlertCircle, Eye, Play, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  cancelImportAction,
  previewAction,
  processChunkAction,
  startImportAction,
} from '@/app/admin/(protected)/sourcing/gmail/actions';
import type { ImportJob, Mailbox, PreviewRow } from '@/lib/services/gmail-import-service';

/**
 * Starting an import and watching it run.
 *
 * The loop is driven from here, the same way the mbox upload is: the page
 * calls for one chunk, shows what came back, and calls again. It is the
 * pattern this codebase already uses for work too long for one request, and
 * it needs no queue.
 *
 * Closing the tab does not lose the job. The chunks are recorded in the
 * database and a cron picks up anything left running, so this loop is the
 * fast path rather than the only one - which is worth saying on the page,
 * because otherwise nobody dares navigate away.
 */
export function ImportControls({
  mailboxes,
  presets,
  configured,
  reason,
  running,
}: {
  mailboxes: Mailbox[];
  presets: { label: string; query: string }[];
  configured: boolean;
  reason?: string;
  running: ImportJob | null;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [selected, setSelected] = useState<string[]>(
    mailboxes.filter((mailbox) => mailbox.enabled).map((mailbox) => mailbox.address),
  );
  const [query, setQuery] = useState(presets[0]?.query ?? '');
  const [labelFilter, setLabelFilter] = useState('');
  const [maxThreads, setMaxThreads] = useState('200');
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  const usable = mailboxes.filter((mailbox) => mailbox.enabled);
  const cap = Math.max(1, Math.min(2000, Number(maxThreads) || 200));

  /** Drive a job to completion, one chunk at a time. */
  async function drive(jobId: string) {
    for (;;) {
      const result = await processChunkAction(jobId);
      setProgress(result.job ? summarise(result.job) : result.message);

      if (result.done) {
        setMessage({ tone: 'ok', text: result.message });
        router.refresh();
        return;
      }
      if (!result.ok) {
        setMessage({ tone: 'bad', text: result.message });
        return;
      }
      // Another chunk holds the lease - the cron or another tab. Leave it be.
      if (result.message.startsWith('Another chunk')) {
        setMessage({ tone: 'ok', text: 'This job is being fetched elsewhere. It will finish on its own.' });
        router.refresh();
        return;
      }
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import from Gmail</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!configured ? (
          <p className="flex items-start gap-2 rounded-lg border border-line bg-surface-sunken p-2.5 text-[12px] text-negative">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              <code className="rounded bg-white px-1">GOOGLE_SERVICE_ACCOUNT_KEY_B64</code> is not
              set on this deployment. See <code className="rounded bg-white px-1">docs/gmail-import-setup.md</code>.
              {reason ? ` ${reason}` : ''}
            </span>
          </p>
        ) : null}

        {usable.length === 0 ? (
          <p className="rounded-lg border border-line bg-surface-sunken p-2.5 text-[12px] text-muted">
            Add a mailbox to the allowlist below before importing.
          </p>
        ) : (
          <div>
            <Label>Mailboxes</Label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {usable.map((mailbox) => {
                const on = selected.includes(mailbox.address);
                return (
                  <label
                    key={mailbox.address}
                    className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] ${
                      on ? 'border-accent-600 bg-accent-50 text-ink' : 'border-line text-muted'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={busy}
                      onChange={() =>
                        setSelected((current) =>
                          on
                            ? current.filter((address) => address !== mailbox.address)
                            : [...current, mailbox.address],
                        )
                      }
                      className="h-3.5 w-3.5 accent-[var(--color-accent-600)]"
                    />
                    {mailbox.address}
                  </label>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <Label htmlFor="gmail-query">Gmail search</Label>
          <Input
            id="gmail-query"
            value={query}
            disabled={busy}
            className="mt-1.5 h-8 font-mono text-[12px]"
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {presets.map((preset) => (
              <button
                key={preset.label}
                type="button"
                disabled={busy}
                onClick={() => setQuery(preset.query)}
                className="rounded border border-line px-1.5 py-0.5 text-[11px] text-muted hover:text-ink"
              >
                {preset.label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-muted">
            Standard Gmail syntax. <code>-from:me</code> keeps our own outreach out of the results;
            threads with no publisher reply are skipped anyway.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="gmail-label">Label filter (optional)</Label>
            <Input
              id="gmail-label"
              value={labelFilter}
              placeholder="Label_123 or INBOX"
              disabled={busy}
              className="mt-1.5 h-8 text-[13px]"
              onChange={(event) => setLabelFilter(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="gmail-cap">Max threads</Label>
            <Input
              id="gmail-cap"
              type="number"
              min={1}
              max={2000}
              value={maxThreads}
              disabled={busy}
              className="mt-1.5 h-8 text-[13px]"
              onChange={(event) => setMaxThreads(event.target.value)}
            />
          </div>
        </div>

        {preview ? (
          <div className="rounded-lg border border-line bg-surface-sunken p-2.5 text-[12px]">
            {preview.map((row) => (
              <div key={row.mailbox} className="flex flex-wrap justify-between gap-2 py-0.5">
                <span className="text-muted">{row.mailbox}</span>
                <span className={row.error ? 'text-negative' : 'text-ink'}>
                  {row.error
                    ? row.error
                    : `${row.matching} matching, ${row.alreadyImported} already imported, ${row.newThreads} new`}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        {running ? (
          <div className="rounded-lg border border-line bg-surface-sunken p-2.5 text-[12px]">
            <p className="text-ink">A job is already running: {summarise(running)}</p>
            <div className="mt-1.5 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => startTransition(() => drive(running.id))}
              >
                Carry on fetching
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() =>
                  startTransition(async () => {
                    await cancelImportAction(running.id);
                    router.refresh();
                  })
                }
              >
                <Square className="h-3.5 w-3.5" aria-hidden="true" />
                Cancel it
              </Button>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <Button
            variant="outline"
            size="sm"
            disabled={busy || !configured || selected.length === 0}
            onClick={() =>
              startTransition(async () => {
                setMessage(null);
                const result = await previewAction({
                  mailboxes: selected,
                  query,
                  labelFilter,
                  maxThreads: cap,
                });
                setPreview(result.rows);
              })
            }
          >
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            Preview
          </Button>
          <Button
            variant="accent"
            size="sm"
            disabled={busy || !configured || selected.length === 0 || Boolean(running)}
            onClick={() =>
              startTransition(async () => {
                setMessage(null);
                setProgress('Finding threads...');
                const started = await startImportAction({
                  mailboxes: selected,
                  query,
                  labelFilter,
                  maxThreads: cap,
                });

                if (!started.ok || !started.jobId) {
                  setProgress(null);
                  setMessage({ tone: started.ok ? 'ok' : 'bad', text: started.message });
                  router.refresh();
                  return;
                }

                setProgress(started.message);
                await drive(started.jobId);
              })
            }
          >
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
            Fetch
          </Button>
          <Link href="/admin/sourcing" className="text-[12px] text-muted underline">
            Review queue
          </Link>
        </div>

        {progress ? <p className="text-[12px] text-accent-700">{progress}</p> : null}
        {message ? (
          <p className={`text-[12px] ${message.tone === 'ok' ? 'text-positive' : 'text-negative'}`}>
            {message.text}
          </p>
        ) : null}
        <p className="text-[11px] text-muted">
          Fetching carries on in this tab, but it is not tied to it: the job is recorded as it goes,
          and anything left running is picked up automatically within ten minutes. Closing the page
          loses nothing.
        </p>
      </CardContent>
    </Card>
  );
}

function summarise(job: ImportJob): string {
  return `${job.threadsFetched} fetched, ${job.threadsSkipped} skipped, ${job.threadsFailed} failed of ${job.threadsFound} found`;
}
