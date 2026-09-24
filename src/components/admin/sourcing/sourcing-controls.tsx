'use client';

import { useState, useTransition } from 'react';
import { AlertCircle, Check, CloudUpload, FlaskConical, Play, RefreshCw, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  collectBatchesAction,
  ingestMboxAction,
  retryFailedAction,
  rereadAllAction,
  ingestPastedAction,
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
  const [pastedFrom, setPastedFrom] = useState('');

  const runningBatches = batches.filter(
    (batch) => batch.status === 'running' || batch.status === 'submitted',
  ).length;

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
                step={5}
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
              Read {pending} waiting
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

          <dl className="tabular grid grid-cols-4 gap-2 border-t border-line pt-3 text-center">
            {[
              ['Waiting', counts.new ?? 0],
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
                const result = await ingestMboxAction(form);
                if (!result.ok) return report(false, result.error ?? 'Upload failed.');
                const { imported, duplicates, skipped } = result.result!;
                report(
                  true,
                  `${imported} new. ${duplicates} already here. ${skipped.length} skipped (${summarise(skipped)}).`,
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
              Our own outreach and bounces are skipped. Re-uploading the same export imports
              nothing, so it never costs anything.
            </p>
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
