'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ProgressBar } from '@/components/ui/progress-bar';
import { formatNumber } from '@/lib/utils/format';
import {
  descriptionProgressAction,
  startDescriptionRunAction,
  stopDescriptionRunAction,
} from '@/app/admin/(protected)/refresh/description-actions';
import type { RunProgress } from '@/lib/services/site-description-service';

/**
 * Fill in what each publisher says their own site is about.
 *
 * It used to be a button that did two hundred and asked to be pressed again.
 * Two hundred was never a sensible number - it was how many homepages fit
 * inside a serverless function before it is killed. Now the press starts a run
 * and a cron finishes it, so the number is the whole inventory and the page is
 * only watching.
 *
 * The bar is polled from the run's own row rather than pushed from the press
 * that started it. That is what makes it survive a reload, and what lets it
 * follow a run somebody else started: a run is the same run whether or not
 * this page is open.
 */

/** How often to ask. A slice is a few dozen homepages and several seconds. */
const EVERY_MS = 4000;

/**
 * How long is left, in words.
 *
 * Measured from the run's own throughput including the gaps between cron
 * ticks, because those gaps are most of the elapsed time and an estimate that
 * ignored them would promise five minutes for an hour of work.
 *
 * Nothing is said until a reasonable sample has gone by. An estimate drawn
 * from the first four domains is a number made up with great confidence.
 */
function timeLeft(run: RunProgress): string | null {
  const done = run.looked;
  const remaining = Math.max(0, run.total - done);

  if (done < 25 || remaining === 0) return null;

  const elapsedMs = Date.now() - new Date(run.startedAt).getTime();
  if (elapsedMs <= 0) return null;

  const msEach = elapsedMs / done;
  const minutes = Math.round((remaining * msEach) / 60_000);

  if (minutes < 1) return 'less than a minute left';
  if (minutes === 1) return 'about a minute left';
  if (minutes < 60) return `about ${minutes} minutes left`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest === 0) return `about ${hours} ${hours === 1 ? 'hour' : 'hours'} left`;
  return `about ${hours}h ${rest}m left`;
}

export function FillDescriptions({
  blank,
  initialRun,
}: {
  blank: number;
  initialRun: RunProgress | null;
}) {
  const router = useRouter();
  const [run, setRun] = useState<RunProgress | null>(initialRun);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const next = await descriptionProgressAction();
        if (cancelled) return;

        // It just ended. Refresh the page as well as hiding the bar: the
        // blank count above it is server-rendered and now wrong.
        if (run && !next) router.refresh();
        setRun(next);
      } catch {
        // A failed poll is not a failed run. Leave what is on screen.
      }
    }

    const timer = setInterval(poll, EVERY_MS);
    void poll();

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [run, router]);

  async function start() {
    setBusy(true);
    setNotice(null);
    try {
      setNotice(await startDescriptionRunAction());
      setRun(await descriptionProgressAction());
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    setBusy(true);
    try {
      setNotice(await stopDescriptionRunAction());
      setRun(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const eta = run ? timeLeft(run) : null;

  return (
    <Card>
      <CardContent className="space-y-3 py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
              <FileText className="h-4 w-4 text-accent-600" aria-hidden="true" />
              Site descriptions
            </h2>
            <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-muted">
              Reads each publisher&rsquo;s homepage and stores the description they wrote
              themselves. It fills the listing overview, the marketplace card and the table row.
              Costs nothing - no Ahrefs credits and no API spend.
            </p>
          </div>

          {run ? (
            <Button variant="outline" size="sm" disabled={busy} onClick={stop}>
              {busy ? 'Stopping…' : 'Stop'}
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled={busy || blank === 0} onClick={start}>
              {busy ? 'Starting…' : 'Fill descriptions'}
            </Button>
          )}
        </div>

        {run ? (
          <div className="rounded-lg border border-line bg-surface-sunken/50 p-3">
            <ProgressBar
              done={run.looked}
              // One rather than zero before anything has been counted, so the
              // bar reads as empty rather than as finished.
              total={Math.max(1, run.total)}
              label={
                `${formatNumber(run.looked)} of ${formatNumber(run.total)} read, ` +
                `${formatNumber(run.filled)} filled` +
                (eta ? ` - ${eta}` : '')
              }
            />
            <p className="mt-2 text-[12px] leading-relaxed text-muted">
              It keeps going whether or not this page is open, so you can log off and come back.
              Roughly {run.looked > 0 ? Math.round((run.filled / run.looked) * 100) : 0}% of
              homepages carry a description worth using; the rest are left blank rather than
              filled with boilerplate.
            </p>
          </div>
        ) : (
          <p className="text-[13px] text-ink-soft">
            {blank === 0
              ? 'Every listing has a description.'
              : `${formatNumber(blank)} ${blank === 1 ? 'listing has' : 'listings have'} no description yet.`}
          </p>
        )}

        {notice ? (
          <p
            className={`rounded-lg border px-3 py-2 text-[13px] ${
              notice.ok
                ? 'border-line bg-surface-sunken text-ink-soft'
                : 'border-coral-300 bg-coral-50 text-coral-700'
            }`}
          >
            {notice.message}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
