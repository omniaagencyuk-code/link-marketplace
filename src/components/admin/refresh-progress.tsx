'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { ProgressBar } from '@/components/ui/progress-bar';
import { refreshProgressAction } from '@/app/admin/(protected)/refresh/actions';
import { formatNumber } from '@/lib/utils/format';
import type { LiveRun } from '@/lib/services/refresh-service';

/** How often to ask. A refresh batch is a hundred domains and several seconds. */
const EVERY_MS = 3000;

/**
 * How far through the running refresh is.
 *
 * Polled from the run's own row rather than pushed from the button that
 * started it, which is what makes it survive a reload - and what lets it
 * follow a run the nightly cron started while nobody was watching. A run is
 * the same run whether or not this page is open.
 *
 * It renders nothing at all when nothing is running, so the page is exactly
 * as it was the rest of the time.
 */
export function RefreshProgress({ initial }: { initial: LiveRun | null }) {
  const router = useRouter();
  const [run, setRun] = useState<LiveRun | null>(initial);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const next = await refreshProgressAction();
        if (cancelled) return;

        // The run just ended. Refresh the page rather than only hiding this:
        // the counts, the recent runs table and the overdue tiers are all
        // server-rendered and all now out of date.
        if (run && !next) router.refresh();
        setRun(next);
      } catch {
        // A failed poll is not a failed run. Leave what is on screen and try
        // again on the next tick.
      }
    }

    const timer = setInterval(poll, EVERY_MS);
    // Asked immediately too, so opening the page mid-run does not wait.
    void poll();

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [run, router]);

  if (!run) return null;

  const done = run.refreshed + run.failed;
  const label = run.total
    ? `${formatNumber(done)} of ${formatNumber(run.total)} domains` +
      (run.failed ? `, ${formatNumber(run.failed)} with no data` : '') +
      `. ${formatNumber(run.unitsSpent)} units so far.`
    : `${formatNumber(done)} domains done. ${formatNumber(run.unitsSpent)} units so far.`;

  return (
    <Card>
      <CardContent className="py-4">
        <ProgressBar
          done={done}
          // Before the first batch writes its count there is no denominator
          // yet. One keeps the bar empty rather than full, which is true.
          total={run.total ?? Math.max(1, done)}
          label={`${run.dryRun ? 'Dry run - ' : ''}${label}`}
        />
        <p className="mt-2 text-[12px] text-muted">
          It keeps going whether or not this page is open. Batches of a hundred domains, and the
          figures update as each one lands.
        </p>
      </CardContent>
    </Card>
  );
}
