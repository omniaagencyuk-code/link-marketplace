'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  advancePublishRunAction,
  cancelPublishRunAction,
  startPublishRunAction,
} from '@/app/admin/actions';
import type { PublishRun } from '@/lib/services/website-publish-run';

/**
 * Publishing the approved backlog.
 *
 * Thousands of draft listings are priced and ready, and the table's own
 * Publish button sends twenty-five per request with the tab held open. This
 * starts a run instead: cron carries it on every few minutes, and the screen
 * can be closed.
 *
 * The guard does not change. `publishBlocker` still decides every listing,
 * one at a time, exactly as it does when somebody publishes by hand - what
 * changes is that nobody has to select seven thousand rows or watch it
 * happen.
 */
export function PublishBacklog({
  ready,
  run,
}: {
  /** Drafts with a priced, switched-on placement right now. */
  ready: number;
  run: PublishRun | null;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  const running = run?.status === 'running';

  /*
    Refreshed while a run is going, so the numbers move without anybody
    reloading.

    In an effect with a cleanup rather than a bare `setInterval`: a timer
    started during render is a new timer on every render and none of them are
    ever cleared, which is the mistake the approve-all control had to have
    fixed.
  */
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => router.refresh(), 10_000);
    return () => clearInterval(timer);
  }, [running, router]);

  function start() {
    if (
      !window.confirm(
        `Publish ${ready.toLocaleString('en-GB')} draft listings? They go live on the marketplace and become buyable. Anything priced at or below what we pay the publisher is refused and stays a draft.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const outcome = await startPublishRunAction();
      setNote(outcome.ok ? null : outcome.error);
      router.refresh();
    });
  }

  function advance() {
    startTransition(async () => {
      const outcome = await advancePublishRunAction();
      setNote(
        outcome.claimed
          ? `Published ${outcome.published}, skipped ${outcome.skipped}.`
          : 'Nothing to carry on - the run has finished.',
      );
      router.refresh();
    });
  }

  function cancel() {
    if (!window.confirm('Stop the run? Listings already published stay published.')) return;
    startTransition(async () => {
      await cancelPublishRunAction();
      router.refresh();
    });
  }

  if (!running && ready === 0) return null;

  const done = run ? run.published + run.skipped : 0;
  const share = run && run.total > 0 ? Math.min(100, Math.round((done / run.total) * 100)) : 0;

  return (
    <div className="space-y-2 rounded-lg border border-line bg-surface-sunken px-3 py-2">
      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-[13px] text-ink">
          {running ? (
            <>
              Publishing: <span className="tabular font-semibold">{run?.published ?? 0}</span> live,{' '}
              <span className="tabular">{run?.skipped ?? 0}</span> not ready, of{' '}
              <span className="tabular">{run?.total.toLocaleString('en-GB')}</span>.
            </>
          ) : (
            <>
              <span className="tabular font-semibold">{ready.toLocaleString('en-GB')}</span> draft
              listings are priced and ready to go live.
            </>
          )}
        </p>

        {running ? (
          <>
            <Button variant="outline" size="sm" disabled={busy} onClick={advance}>
              {busy ? 'Working…' : 'Carry on now'}
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={cancel}>
              Stop
            </Button>
          </>
        ) : (
          <Button variant="accent" size="sm" disabled={busy} onClick={start}>
            <Rocket className="h-3.5 w-3.5" aria-hidden="true" />
            {busy ? 'Starting…' : 'Publish them all'}
          </Button>
        )}
      </div>

      {running ? (
        <div
          className="h-1.5 overflow-hidden rounded-full bg-line"
          role="progressbar"
          aria-valuenow={share}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Publishing progress"
        >
          <div
            className="h-full rounded-full bg-[var(--color-accent-600)] transition-[width]"
            style={{ width: `${share}%` }}
          />
        </div>
      ) : null}

      <p className="text-[12px] leading-relaxed text-ink-soft">
        {running
          ? 'This carries on by itself every few minutes. You can close this page.'
          : 'Each one is checked the same way publishing by hand checks it - anything selling at or below what we pay the publisher stays a draft.'}
      </p>

      {note ? (
        <p role="status" className="text-[12px] text-ink-soft">
          {note}
        </p>
      ) : null}
      {run?.firstError && running ? (
        <p className="text-[12px] text-ink-soft">First refusal: {run.firstError}</p>
      ) : null}
    </div>
  );
}
