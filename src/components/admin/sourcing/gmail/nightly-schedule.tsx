'use client';

import { useState, useTransition } from 'react';
import { Clock, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  runNightlyNowAction,
  updateNightlyAction,
} from '@/app/admin/(protected)/sourcing/gmail/actions';
import { formatDateTime } from '@/lib/utils/format';

/**
 * Importing on a schedule, so replies stop depending on somebody remembering.
 *
 * Two switches, deliberately. Importing costs nothing - the Gmail API is free
 * and a thread already imported is skipped - so leaving it on is safe.
 * Reading what it finds is the part that spends money, so it is its own
 * decision and it starts off.
 */
export function NightlySchedule({
  enabled,
  query,
  cap,
  reads,
  lastRunAt,
  lastResult,
}: {
  enabled: boolean;
  query: string;
  cap: number;
  reads: boolean;
  lastRunAt: string | null;
  lastResult: string | null;
}) {
  const [busy, startTransition] = useTransition();
  const [draftQuery, setDraftQuery] = useState(query);
  const [draftCap, setDraftCap] = useState(String(cap));
  const [message, setMessage] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>Every night</CardTitle>
        <span className="inline-flex items-center gap-1 text-[11px] text-muted">
          <Clock className="h-3 w-3" aria-hidden="true" />
          around 6am
        </span>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={enabled}
            disabled={busy}
            onChange={(event) =>
              startTransition(async () => {
                await updateNightlyAction({ nightlyImportEnabled: event.target.checked });
              })
            }
            className="mt-0.5 h-4 w-4 accent-[var(--color-accent-600)]"
          />
          <span>
            <span className="block text-[13px] font-medium text-ink">Import new replies nightly</span>
            <span className="block text-[12px] leading-relaxed text-muted">
              Runs across every enabled mailbox. Costs nothing: the Gmail API is free, and a thread
              already imported is skipped, so a run that finds nothing new does nothing.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={reads}
            disabled={busy || !enabled}
            onChange={(event) =>
              startTransition(async () => {
                await updateNightlyAction({ nightlyImportReads: event.target.checked });
              })
            }
            className="mt-0.5 h-4 w-4 accent-[var(--color-accent-600)]"
          />
          <span>
            <span className="block text-[13px] font-medium text-ink">
              And read them with Claude
            </span>
            <span className="block text-[12px] leading-relaxed text-muted">
              This one spends money. The monthly budget still applies - a run stops once the month
              is spent - but drafts will appear overnight without anybody watching. Leave it off if
              you would rather press Read yourself.
            </span>
          </span>
        </label>

        <div>
          <Label htmlFor="nightly-query">Search</Label>
          <Input
            id="nightly-query"
            value={draftQuery}
            disabled={busy}
            className="mt-1.5 h-8 font-mono text-[12px]"
            onChange={(event) => setDraftQuery(event.target.value)}
            onBlur={() =>
              startTransition(async () => {
                if (draftQuery !== query) {
                  await updateNightlyAction({ nightlyImportQuery: draftQuery });
                }
              })
            }
          />
          <p className="mt-1 text-[11px] text-muted">
            Keep it narrow. A broad search reads newsletters and out-of-office replies at the same
            price as a publisher quoting a rate.
          </p>
        </div>

        <div className="max-w-[160px]">
          <Label htmlFor="nightly-cap">Max threads a night</Label>
          <Input
            id="nightly-cap"
            type="number"
            min={1}
            max={2000}
            value={draftCap}
            disabled={busy}
            className="mt-1.5 h-8 text-[13px]"
            onChange={(event) => setDraftCap(event.target.value)}
            onBlur={() =>
              startTransition(async () => {
                const value = Math.max(1, Math.min(2000, Number(draftCap) || 200));
                if (value !== cap) await updateNightlyAction({ nightlyImportCap: value });
              })
            }
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() =>
              startTransition(async () => {
                const result = await runNightlyNowAction();
                setMessage(result.message);
              })
            }
          >
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
            Run it now
          </Button>
          {lastRunAt ? (
            <span className="text-[12px] text-muted">
              Last run {formatDateTime(lastRunAt)}
            </span>
          ) : (
            <span className="text-[12px] text-muted">Never run.</span>
          )}
        </div>

        {/*
          What the last run did, in words. A schedule that quietly stopped
          working looks exactly like one with nothing to do, and the only
          difference is written here.
        */}
        {lastResult ? (
          <p className="rounded-lg border border-line bg-surface-sunken px-2.5 py-2 text-[12px] text-ink-soft">
            {lastResult}
          </p>
        ) : null}
        {message ? <p className="text-[12px] text-accent-700">{message}</p> : null}
      </CardContent>
    </Card>
  );
}
