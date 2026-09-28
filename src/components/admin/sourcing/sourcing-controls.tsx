'use client';

import { useState, useTransition } from 'react';
import { AlertCircle, Check, CloudUpload, FlaskConical, Loader2, Play, RefreshCw, RotateCcw, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { splitForUpload } from '@/lib/sourcing/split-upload';
import { EXTRACTION_BATCH_LIMIT } from '@/lib/sourcing/limits';
import { progressMessage, runProgress, type BatchRow } from '@/lib/sourcing/batch-health';
import {
  collectBatchesAction,
  ingestMboxAction,
  retryFailedAction,
  rereadAllAction,
  ingestPastedAction,
  releaseStuckAction,
  runExtractionAction,
  updateSourcingSettingsAction,
} from '@/app/admin/(protected)/sourcing/actions';

interface Settings {
  enabled: boolean;
  mode: 'realtime' | 'batch';
  model: string;
  monthlyBudgetUsd: number;
  configured: boolean;
  reason?: string;
}

/**
 * The controls: what is switched on, what comes in, and what gets read.
 *
 * Extraction is off until somebody turns it on, and the dry run walks the
 * whole path without calling the API - so the wiring can be proved before a
 * penny is spent. Uploading and parsing never cost anything, so they work
 * whether the switch is on or off.
 */
/**
 * How much of an export goes in one request.
 *
 * Next's Server Action body limit is set to 4mb in next.config, and Vercel
 * refuses anything over 4.5mb whatever the config says. Three leaves room for
 * the multipart wrapper and for an export whose subjects are full of accented
 * characters, which are bigger on the wire than they look.
 */
const UPLOAD_BATCH_BYTES = 3 * 1024 * 1024;

export function SourcingControls({
  settings,
  pending,
  spentUsd,
  counts,
  batches,
}: {
  settings: Settings;
  pending: number;
  spentUsd: number;
  counts: Record<string, number>;
  batches: Record<string, unknown>[];
}) {
  const [busy, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [pasted, setPasted] = useState('');
  const [progress, setProgress] = useState<string | null>(null);
  const [pastedFrom, setPastedFrom] = useState('');

  // What the button will actually send, which is neither the number waiting
  // (a run stops at the batch size) nor the batch size (there may be fewer).
  const willSend = Math.min(pending, EXTRACTION_BATCH_LIMIT);

  const runningBatches = batches.filter(
    (batch) => batch.status === 'running' || batch.status === 'submitted',
  ).length;

  /*
    Progress from rows, not from a timer.

    The figures below are what the database says, so a refresh cannot lose
    them and a message cannot outlive the thing it describes. That was the
    complaint: a run in progress looked identical to nothing happening, and
    a slow batch looked identical to a dead one.
  */
  const runState = runProgress(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    batches.map((batch: any): BatchRow => ({
      id: String(batch.id),
      status: String(batch.status),
      mode: String(batch.mode),
      createdAt: String(batch.created_at),
      providerBatchId: (batch.provider_batch_id as string | null) ?? null,
      emailCount: Number(batch.email_count ?? 0),
    })),
  );

  function report(ok: boolean, text: string) {
    setMessage({ tone: ok ? 'ok' : 'bad', text });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* ------------------------------------------------------- settings */}
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Extraction</CardTitle>
          <Badge tone={settings.enabled ? 'accent' : 'neutral'}>
            {settings.enabled ? 'On' : 'Off'}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          {!settings.configured ? (
            <p className="flex items-start gap-2 rounded-lg border border-line bg-surface-sunken px-3 py-2 text-[12px] leading-relaxed text-ink-soft">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
              <span>
                <code className="rounded bg-white px-1">ANTHROPIC_API_KEY</code> is not set on this
                deployment. Uploading and parsing work without it; reading emails does not.
              </span>
            </p>
          ) : null}
          {settings.reason ? (
            <p className="text-[12px] text-muted">{settings.reason}</p>
          ) : null}

          <label className="flex items-start gap-2.5">
            <input
              type="checkbox"
              checked={settings.enabled}
              disabled={busy}
              onChange={(event) =>
                startTransition(async () => {
                  await updateSourcingSettingsAction({ enabled: event.target.checked });
                })
              }
              className="mt-0.5 h-4 w-4 accent-[var(--color-accent-600)]"
            />
            <span>
              <span className="block text-[13px] font-medium text-ink">Read emails with Claude</span>
              <span className="block text-[12px] text-muted">
                Off by default. Nothing is sent to the API while this is unticked.
              </span>
            </span>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="mode">Mode</Label>
              <Select
                id="mode"
                size="sm"
                value={settings.mode}
                disabled={busy}
                className="mt-1.5"
                onChange={(event) =>
                  startTransition(async () => {
                    await updateSourcingSettingsAction({
                      mode: event.target.value as Settings['mode'],
                    });
                  })
                }
              >
                <option value="realtime">Real time - answers now</option>
                <option value="batch">Batch - half price, collect later</option>
              </Select>
              <p className="mt-1 text-[12px] text-muted">
                {settings.mode === 'realtime'
                  ? 'Drafts appear as soon as the run finishes. Use this while you are checking the readings.'
                  : 'Submitted to the Batch API at half price. Results usually arrive within the hour.'}
              </p>
            </div>

            <div>
              <Label htmlFor="budget">Monthly budget (USD)</Label>
              <Input
                id="budget"
                type="number"
                min={0}
                step={1}
                defaultValue={settings.monthlyBudgetUsd}
                disabled={busy}
                className="mt-1.5"
                onBlur={(event) => {
                  const value = Number(event.target.value);
                  if (!Number.isFinite(value) || value < 0) return;
                  startTransition(async () => {
                    await updateSourcingSettingsAction({ monthlyBudgetUsd: value });
                  });
                }}
              />
              <p className="tabular mt-1 text-[12px] text-muted">
                ${spentUsd.toFixed(2)} spent this month, measured from reported tokens.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-line pt-3">
            <Button
              variant="outline"
              size="sm"
              disabled={busy || pending === 0}
              onClick={() =>
                startTransition(async () => {
                  const result = await runExtractionAction({ dryRun: true });
                  report(result.ok, result.message);
                })
              }
            >
              <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
              Dry run
            </Button>
            <Button
              variant="accent"
              size="sm"
              disabled={busy || pending === 0}
              onClick={() =>
                startTransition(async () => {
                  const result = await runExtractionAction({});
                  report(result.ok, result.message);
                })
              }
            >
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
              Read {willSend} waiting
              {pending > willSend ? (
                <span className="font-normal opacity-80">of {pending}</span>
              ) : null}
            </Button>
            {(counts.failed ?? 0) > 0 ? (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() =>
                  startTransition(async () => {
                    const result = await retryFailedAction();
                    report(
                      true,
                      `${result.count} ${result.count === 1 ? 'email is' : 'emails are'} back in the queue. Press Read to try again.`,
                    );
                  })
                }
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                Retry {counts.failed} failed
              </Button>
            ) : null}
            {(counts.extracted ?? 0) + (counts.ignored ?? 0) > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => {
                  if (
                    !window.confirm(
                      'Read every stored email again under the current rules? Drafts still waiting for review are replaced. Listings you have already approved are untouched. This costs money, like any other run.',
                    )
                  ) {
                    return;
                  }
                  startTransition(async () => {
                    const result = await rereadAllAction();
                    report(
                      true,
                      `${result.count} ${result.count === 1 ? 'email is' : 'emails are'} back in the queue. Press Read to extract them again.`,
                    );
                  });
                }}
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                Re-read all
              </Button>
            ) : null}
            {runningBatches > 0 ? (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() =>
                  startTransition(async () => {
                    const result = await collectBatchesAction();
                    report(true, result.message);
                  })
                }
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                Collect {runningBatches}
              </Button>
            ) : null}
          </div>

          {/*
            "Sent" rather than "being read", because that is what the number
            is: the last thing we wrote down, not live status. A batch that
            finished an hour ago still shows here until it is collected, and a
            label implying otherwise had somebody refreshing the page waiting
            for a figure that refreshing cannot change.
          */}
          <dl className="tabular grid grid-cols-5 gap-2 border-t border-line pt-3 text-center">
            {[
              ['Waiting', counts.new ?? 0],
              ['Sent to be read', counts['in-flight'] ?? 0],
              ['Read', counts.extracted ?? 0],
              ['Nothing usable', counts.ignored ?? 0],
              ['Failed', counts.failed ?? 0],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <dt className="text-[11px] text-muted">{label}</dt>
                <dd className="text-[15px] font-semibold text-ink">{value}</dd>
              </div>
            ))}
          </dl>
          {/*
            The panel that does not go away.

            Rendered from rows, so a refresh redraws it rather than losing it,
            and it says how long the run has been out - which is the one fact
            that tells a slow batch from a dead one. When it is dead it says
            so and offers the way out, instead of leaving somebody pressing
            Collect at a number that will never move.
          */}
          {runState.running > 0 ? (
            <div
              className={`rounded-lg border p-3 ${
                runState.stuck
                  ? 'border-negative/30 bg-red-50'
                  : runState.worst === 'slow'
                    ? 'border-warning/30 bg-amber-50'
                    : 'border-accent-600/30 bg-accent-50'
              }`}
            >
              <div className="flex items-start gap-2">
                {runState.stuck ? (
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-negative" aria-hidden="true" />
                ) : (
                  <Loader2
                    className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-accent-700"
                    aria-hidden="true"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-ink">
                    {runState.stuck ? 'This run is not coming back' : 'A read is in progress'}
                  </p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-ink-soft">
                    {progressMessage(runState)}
                  </p>
                  {!runState.stuck ? (
                    <p className="mt-0.5 text-[12px] text-muted">
                      Drafts appear under Waiting for review as soon as they are collected. You can
                      close this page - it carries on without you.
                    </p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        startTransition(async () => {
                          const result = await collectBatchesAction();
                          report(true, result.message);
                        })
                      }
                    >
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                      Check now
                    </Button>
                    <Button
                      variant={runState.stuck ? 'accent' : 'ghost'}
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        startTransition(async () => {
                          const result = await releaseStuckAction();
                          report(true, result.message);
                        })
                      }
                    >
                      <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Give up and put them back
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* -------------------------------------------------------- ingestion */}
      <Card>
        <CardHeader>
          <CardTitle>Bring emails in</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            action={(form) =>
              startTransition(async () => {
                const file = form.get('file');
                if (!(file instanceof File) || file.size === 0) {
                  return report(false, 'Choose an .mbox file to upload.');
                }

                /*
                  Cut up here rather than sent whole.

                  A Server Action's request body is capped well below the size
                  of a year's mail, and the failure is a browser-level "page
                  couldn't load" that says nothing about why. Each batch is a
                  valid mbox, so the server reads it with exactly the same
                  parser as a small export.
                */
                const { batches, messageCount, truncated } = splitForUpload(
                  await file.text(),
                  UPLOAD_BATCH_BYTES,
                );

                if (messageCount === 0) {
                  return report(false, 'No emails found in that file. Is it really an .mbox?');
                }

                let imported = 0;
                let duplicates = 0;
                const skipped: { reason: string }[] = [];

                for (const [index, batch] of batches.entries()) {
                  setProgress(`Uploading ${index + 1} of ${batches.length}...`);

                  const chunk = new FormData();
                  chunk.set(
                    'file',
                    new File([batch], file.name, { type: 'application/mbox' }),
                  );

                  const result = await ingestMboxAction(chunk);
                  if (!result.ok) {
                    setProgress(null);
                    // Named so a part-finished import is not a mystery: what
                    // landed before the failure is already in, and uploading
                    // the same file again will skip it.
                    return report(
                      false,
                      `Part ${index + 1} of ${batches.length} failed: ${result.error ?? 'upload failed'}. ` +
                        `${imported} emails were imported before that.`,
                    );
                  }

                  imported += result.result!.imported;
                  duplicates += result.result!.duplicates;
                  skipped.push(...result.result!.skipped);
                }

                setProgress(null);
                report(
                  true,
                  `${imported} new. ${duplicates} already here. ${skipped.length} skipped (${summarise(skipped)}).` +
                    (truncated.length
                      ? ` ${truncated.length} very large ${truncated.length === 1 ? 'email was' : 'emails were'} shortened - their attachments were dropped, the text was kept.`
                      : ''),
                );
              })
            }
          >
            <Label htmlFor="mbox">Google Takeout export</Label>
            <input
              id="mbox"
              name="file"
              type="file"
              accept=".mbox"
              required
              className="mt-1.5 block w-full text-[13px] text-ink-soft file:mr-3 file:rounded-md file:border file:border-line-strong file:bg-white file:px-3 file:py-1.5 file:text-[13px] file:font-medium file:text-ink"
            />
            <p className="mt-1 text-[12px] text-muted">
              Any size. It is split up here and uploaded in pieces, because a single request
              cannot carry a whole export. Our own outreach and bounces are skipped, and
              re-uploading the same export imports nothing, so it never costs anything.
            </p>
            {progress ? (
              <p className="mt-1 text-[12px] text-accent-700">{progress}</p>
            ) : null}
            <Button type="submit" variant="outline" size="sm" className="mt-2" disabled={busy}>
              <CloudUpload className="h-3.5 w-3.5" aria-hidden="true" />
              Upload
            </Button>
          </form>

          <div className="border-t border-line pt-4">
            <Label htmlFor="paste">Or paste one reply</Label>
            <Textarea
              id="paste"
              value={pasted}
              placeholder="Paste the whole email, headers included if you have them."
              onChange={(event) => setPasted(event.target.value)}
              className="mt-1.5 min-h-28"
            />
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <div className="min-w-48 flex-1">
                <Label htmlFor="paste-from">Sender, if the headers are missing</Label>
                <Input
                  id="paste-from"
                  value={pastedFrom}
                  placeholder="editor@example.com"
                  onChange={(event) => setPastedFrom(event.target.value)}
                  className="mt-1.5"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={busy || !pasted.trim()}
                onClick={() =>
                  startTransition(async () => {
                    const result = await ingestPastedAction(pasted, pastedFrom || undefined);
                    if (!result.ok) return report(false, result.error ?? 'Could not read that.');
                    setPasted('');
                    report(
                      true,
                      result.result!.imported > 0
                        ? 'Stored. Read it with the button on the left.'
                        : 'That email is already here.',
                    );
                  })
                }
              >
                Store it
              </Button>
            </div>
          </div>

          {message ? (
            <p
              role="status"
              className={`flex items-start gap-2 border-t border-line pt-3 text-[13px] ${
                message.tone === 'ok' ? 'text-ink-soft' : 'text-negative'
              }`}
            >
              {message.tone === 'ok' ? (
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-700" aria-hidden="true" />
              ) : (
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              )}
              {message.text}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function summarise(skipped: { reason: string }[]): string {
  const counts = skipped.reduce<Record<string, number>>((all, entry) => {
    all[entry.reason] = (all[entry.reason] ?? 0) + 1;
    return all;
  }, {});
  const labels: Record<string, string> = {
    ours: 'our own outreach',
    bounce: 'bounces',
    'no-message-id': 'no message id',
    empty: 'empty',
  };
  const parts = Object.entries(counts).map(([reason, count]) => `${count} ${labels[reason] ?? reason}`);
  return parts.length ? parts.join(', ') : 'none';
}
