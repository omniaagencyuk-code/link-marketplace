'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProgressBar } from '@/components/ui/progress-bar';
import {
  cancelApproveAllAction,
  startApproveAllAction,
} from '@/app/admin/(protected)/sourcing/actions';
import type { ApprovalRun } from '@/lib/services/draft-approval-run';

/**
 * Approve the whole queue, rather than a hundred at a time.
 *
 * Deliberately says what it will and will not touch before it is pressed. The
 * number on the button is the eligible count, not the queue length, because
 * those differ by exactly the drafts a person still has to read - and a button
 * that said "approve 8,000" and approved 6,400 would be the kind of surprise
 * that makes somebody stop trusting the rest of the page.
 *
 * Once started it is a run, not a request: cron carries it on every few
 * minutes, so this component's job afterwards is only to report. The page is
 * refreshed on a timer while one is going, because a server component cannot
 * tell the browser that a background job moved.
 */
export function ApproveAll({
  eligible,
  run,
}: {
  eligible: number;
  run: ApprovalRun | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const running = run?.status === 'running';

  /*
    While a run is going the page is the only thing that knows it moved, and
    only when it is asked again. Five seconds is often enough to feel live and
    rare enough that a page doing nine queries is not being hammered.

    In an effect with a cleanup, not during render: a `setTimeout` in the body
    starts a fresh timer on every render and clears none of them, so a run
    lasting twenty minutes would leave the page refreshing itself faster and
    faster.
  */
  useEffect(() => {
    if (!running) return;
    const timer = setTimeout(() => router.refresh(), 5000);
    return () => clearTimeout(timer);
  }, [running, run?.approved, run?.failed, router]);

  if (running && run) {
    const done = run.approved + run.failed;
    return (
      <div className="rounded-lg border border-line bg-surface-sunken p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] font-medium text-ink">Approving the queue</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await cancelApproveAllAction();
                router.refresh();
              })
            }
          >
            Stop
          </Button>
        </div>
        <ProgressBar
          done={done}
          total={run.total}
          label={`${done.toLocaleString('en-GB')} of ${run.total.toLocaleString('en-GB')} approved`}
        />
        <p className="mt-2 text-[12px] leading-relaxed text-muted">
          This carries on without you — close the tab if you like.
          {run.failed > 0 ? ` ${run.failed} could not be approved and stay in the queue.` : ''}
        </p>
      </div>
    );
  }

  if (eligible === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border border-line bg-surface-sunken p-3">
      {confirming ? (
        <>
          <p className="text-[13px] leading-relaxed text-ink">
            Approve {eligible.toLocaleString('en-GB')}{' '}
            {eligible === 1 ? 'draft' : 'drafts'}?
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-muted">
            Only the ones the model was sure about: nothing flagged, nothing with a low-confidence
            field, and nothing whose domain was quoted twice. Each becomes a listing with its cost
            recorded and no sell price, so none of them can appear in the marketplace until somebody
            prices it.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={pending}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const outcome = await startApproveAllAction();
                  if (!outcome.ok) setError(outcome.error);
                  else setConfirming(false);
                  router.refresh();
                });
              }}
            >
              {pending ? 'Starting...' : `Yes, approve ${eligible.toLocaleString('en-GB')}`}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] leading-relaxed text-ink-soft">
            {eligible.toLocaleString('en-GB')} {eligible === 1 ? 'draft is' : 'drafts are'} confident
            and unflagged.
          </p>
          <Button type="button" variant="secondary" size="sm" onClick={() => setConfirming(true)}>
            <CheckCheck className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Approve all
          </Button>
        </div>
      )}

      {error ? (
        <p
          role="alert"
          className="mt-3 flex gap-2 rounded-lg border border-coral-300 bg-coral-50 p-2.5 text-[12px] leading-relaxed text-coral-900"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}

      {run && run.status !== 'running' ? (
        <p className="mt-2 text-[12px] text-muted">
          Last run: {run.approved.toLocaleString('en-GB')} approved
          {run.failed > 0 ? `, ${run.failed} could not be` : ''} ({run.status}).
        </p>
      ) : null}
    </div>
  );
}
