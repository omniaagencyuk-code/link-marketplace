'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ProgressBar } from '@/components/ui/progress-bar';
import {
  cancelApproveAllAction,
  startApproveAllAction,
} from '@/app/admin/(protected)/sourcing/actions';
import type { ApprovalMode, ApprovalRun } from '@/lib/services/draft-approval-run';

/**
 * Approve the whole queue, rather than a hundred at a time.
 *
 * Two rules, because against a real backlog the strict one matched 17 drafts
 * out of 7,204 and the difference was almost entirely publishers who quoted
 * one price and never mentioned gambling - the ordinary case, not an anomaly.
 *
 * **Confident** is nothing flagged and nothing low-confidence.
 *
 * **Priced** is anything carrying a general price. It lets through the three
 * flags that mean "somebody should look" and still refuses the two that mean
 * the row would be wrong: a price with no currency, which was once stored
 * anyway and read as pounds everywhere downstream, and a reply about a
 * different domain than the draft.
 *
 * Both say what they will do before they are pressed, and the number on each
 * button is that rule's own count - not the queue length, because a button
 * that said 7,204 and approved 5,900 is how somebody stops trusting the page.
 */
export function ApproveAll({
  eligibleConfident,
  eligiblePriced,
  run,
}: {
  eligibleConfident: number;
  eligiblePriced: number;
  run: ApprovalRun | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<ApprovalMode | null>(null);
  const [spread, setSpread] = useState(false);

  const running = run?.status === 'running';

  /*
    While a run is going the page is the only thing that knows it moved, and
    only when it is asked again.

    In an effect with a cleanup, not during render: a `setTimeout` in the body
    starts a fresh timer on every render and clears none, so a long run would
    leave the page refreshing itself faster and faster.
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
          <p className="text-[13px] font-medium text-ink">
            Approving the queue
            {run.mode === 'priced' ? ' — everything with a price' : ' — the confident ones'}
            {run.spreadNiches ? ', niches included' : ''}
          </p>
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

  if (eligibleConfident === 0 && eligiblePriced === 0) return null;

  const start = (mode: ApprovalMode) => {
    setError(null);
    startTransition(async () => {
      const outcome = await startApproveAllAction({
        mode,
        spreadNiches: mode === 'priced' && spread,
      });
      if (!outcome.ok) setError(outcome.error);
      else setConfirming(null);
      router.refresh();
    });
  };

  return (
    <div className="rounded-lg border border-line bg-surface-sunken p-3">
      {confirming === null ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px] leading-relaxed text-ink-soft">
              {eligibleConfident.toLocaleString('en-GB')}{' '}
              {eligibleConfident === 1 ? 'draft has' : 'drafts have'} no low-confidence field and
              nothing flagged.
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={eligibleConfident === 0}
              onClick={() => setConfirming('confident')}
            >
              Approve {eligibleConfident.toLocaleString('en-GB')}
            </Button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2">
            <p className="text-[13px] leading-relaxed text-ink-soft">
              {eligiblePriced.toLocaleString('en-GB')}{' '}
              {eligiblePriced === 1 ? 'draft states' : 'drafts state'} a price — including the ones
              flagged only because they quoted one number and never mentioned niches.
            </p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={eligiblePriced === 0}
              onClick={() => setConfirming('priced')}
            >
              <CheckCheck className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Approve all {eligiblePriced.toLocaleString('en-GB')}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-[13px] leading-relaxed text-ink">
            Approve{' '}
            {(confirming === 'priced' ? eligiblePriced : eligibleConfident).toLocaleString('en-GB')}{' '}
            drafts?
          </p>

          {confirming === 'priced' ? (
            <>
              <p className="mt-1 text-[12px] leading-relaxed text-muted">
                Everything that states a general price, whatever else is flagged on it. Still left
                alone: a price with no currency, a reply offering a different site, and any domain
                quoted by more than one person. Each becomes a listing with the publisher&rsquo;s
                cost recorded and no sell price, so none can appear in the marketplace until
                somebody prices it.
              </p>

              <label className="mt-3 flex cursor-pointer items-start gap-2">
                <Checkbox checked={spread} onChange={(event) => setSpread(event.target.checked)} />
                <span className="text-[12px] leading-relaxed text-ink-soft">
                  Also treat unmentioned sensitive niches as accepted, at the general price.
                  <span className="mt-0.5 block text-muted">
                    A publisher who explicitly refused a niche is never overridden — only silence is
                    read as yes. Without this, unmentioned niches stay unknown.
                  </span>
                </span>
              </label>
            </>
          ) : (
            <p className="mt-1 text-[12px] leading-relaxed text-muted">
              Only the ones the model was sure about: nothing flagged, nothing with a
              low-confidence field, and nothing whose domain was quoted twice.
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={pending}
              onClick={() => start(confirming)}
            >
              {pending ? 'Starting...' : 'Yes, approve them'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => setConfirming(null)}
            >
              Cancel
            </Button>
          </div>
        </>
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
          {run.failed > 0 ? `, ${run.failed} could not be` : ''} ({run.status}
          {run.mode === 'priced' ? ', everything priced' : ''}
          {run.spreadNiches ? ', niches included' : ''}).
        </p>
      ) : null}
    </div>
  );
}
