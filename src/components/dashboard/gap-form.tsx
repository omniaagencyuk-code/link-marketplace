'use client';

import { useState, useTransition } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { runGapAction } from '@/app/dashboard/link-gap/actions';

/**
 * The form that spends money.
 *
 * Two things it does on purpose.
 *
 * It says how many reports are left *before* anybody fills it in, and
 * disables itself at zero. Finding out you have none left at the point of
 * submitting is the version that wastes an afternoon.
 *
 * It shows whatever the server said when a run is refused, verbatim. Those
 * messages are written to tell a customer what they can do - wait for the
 * month to turn, or come back later - and replacing them with "something went
 * wrong" turns a solvable situation into a support email.
 */
export function GapForm({
  maxCompetitors,
  reportsLeft,
  allowance,
}: {
  maxCompetitors: number;
  reportsLeft: number;
  allowance: number;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const none = allowance > 0 && reportsLeft === 0;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        setError(null);
        startTransition(async () => {
          // A successful run redirects, so only a refusal returns here.
          const outcome = await runGapAction(formData);
          if (outcome && !outcome.ok) setError(outcome.error ?? 'That could not be run.');
        });
      }}
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <Label htmlFor="target">Your domain</Label>
          <div className="mt-1.5">
            <Input id="target" name="target" placeholder="yoursite.com" disabled={none} required />
          </div>
          <p className="mt-1.5 text-[12px] text-muted">
            The site you want more links to.
          </p>
        </div>

        <div>
          <Label htmlFor="competitor1">Competitors</Label>
          <div className="mt-1.5 space-y-2">
            {Array.from({ length: Math.min(3, maxCompetitors) }, (_, index) => (
              <Input
                key={index}
                id={index === 0 ? 'competitor1' : undefined}
                name={`competitor${index + 1}`}
                placeholder={index === 0 ? 'competitor.com' : 'another-competitor.com (optional)'}
                disabled={none}
                required={index === 0}
              />
            ))}
          </div>
          <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
            Sites ranking for what you want to rank for. The closer they are to you, the more
            useful the gap.
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={pending || none}>
          {pending ? 'Looking...' : 'Find the gap'}
        </Button>

        {allowance > 0 ? (
          <p className="text-[12px] text-muted">
            {none
              ? `You have used all ${allowance} of this month's reports. More become available when the month turns.`
              : `${reportsLeft} of ${allowance} reports left this month.`}
          </p>
        ) : null}
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-4 flex gap-2 rounded-lg border border-coral-300 bg-coral-50 p-3 text-[13px] leading-relaxed text-coral-900"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}
    </form>
  );
}
