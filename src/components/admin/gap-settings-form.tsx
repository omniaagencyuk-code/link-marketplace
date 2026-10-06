'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, Power } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  saveGapSettingsAction,
  setGapEnabledAction,
  type GapAdminResult,
} from '@/app/admin/(protected)/link-gap/actions';
import type { GapSettings } from '@/lib/services/gap-service';

function Feedback({ result }: { result: GapAdminResult }) {
  return (
    <p
      role="status"
      className={
        result.ok
          ? 'mt-3 flex gap-2 rounded-lg border border-accent-300 bg-accent-50/50 p-2.5 text-[13px] text-ink'
          : 'mt-3 flex gap-2 rounded-lg border border-coral-300 bg-coral-50 p-2.5 text-[13px] text-coral-900'
      }
    >
      {result.ok ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent-700" aria-hidden="true" />
      ) : (
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      )}
      <span>{result.error ?? result.message}</span>
    </p>
  );
}

export function GapSwitch({ enabled, configured }: { enabled: boolean; configured: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<GapAdminResult | null>(null);

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="flex items-center gap-2.5">
          <span
            className={
              enabled
                ? 'inline-flex h-2.5 w-2.5 rounded-full bg-accent-500'
                : 'inline-flex h-2.5 w-2.5 rounded-full bg-line-strong'
            }
            aria-hidden="true"
          />
          <h2 className="text-[15px] font-semibold text-ink">
            {enabled ? 'The gap finder is on' : 'The gap finder is off'}
          </h2>
        </div>
        <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-muted">
          {enabled
            ? 'Customers can run reports. Each uncached target costs one Ahrefs unit per referring domain, up to the row cap, against this feature’s own budget.'
            : 'The page tells customers it is unavailable and nothing is spent.'}
        </p>
        {!configured ? (
          <p className="mt-2 text-[12px] text-muted">
            AHREFS_API_TOKEN is not set on this deployment, so a report would be refused anyway.
          </p>
        ) : null}
      </div>

      <div>
        <Button
          type="button"
          variant={enabled ? 'outline' : 'accent'}
          size="sm"
          disabled={pending}
          onClick={() => {
            if (
              !enabled &&
              !window.confirm(
                'Turn the gap finder on? Customer reports will start spending Ahrefs units against its budget.',
              )
            ) {
              return;
            }
            startTransition(async () => {
              setResult(await setGapEnabledAction(!enabled));
              router.refresh();
            });
          }}
        >
          <Power className="h-3.5 w-3.5" aria-hidden="true" />
          {enabled ? 'Turn off' : 'Turn on'}
        </Button>
        {result ? <Feedback result={result} /> : null}
      </div>
    </div>
  );
}

/**
 * Every field here is a cost control.
 *
 * The hints say what each number does to the bill rather than what it is
 * called — the person raising the row cap from 2,500 to 25,000 is the person
 * who needs to know it is ten times the cost per report.
 */
export function GapSettingsForm({ settings }: { settings: GapSettings }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<GapAdminResult | null>(null);

  return (
    <Card>
      <CardContent className="py-5">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            setResult(null);
            startTransition(async () => {
              setResult(await saveGapSettingsAction(formData));
              router.refresh();
            });
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field
              name="monthlyUnitBudget"
              label="Unit budget"
              value={settings.monthlyUnitBudget}
              hint="Per cycle, for this feature only. It never draws on the refresh's allowance."
            />
            <Field
              name="unitSafetyPct"
              label="Stop at (% of budget)"
              value={settings.unitSafetyPct}
              hint="Reports are refused here, not at the budget."
            />
            <Field
              name="billingCycleDay"
              label="Cycle resets on day"
              value={settings.billingCycleDay}
              hint="1-28. Match it to the Ahrefs reset date."
            />
            <Field
              name="rowsPerTarget"
              label="Referring domains per target"
              value={settings.rowsPerTarget}
              hint="One unit each, worst case. This is the number that bounds a report — doubling it doubles the bill."
            />
            <Field
              name="maxCompetitors"
              label="Competitors per report"
              value={settings.maxCompetitors}
              hint="Each one is another pull. Three is plenty for a useful gap."
            />
            <Field
              name="cacheDays"
              label="Cache a pull for (days)"
              value={settings.cacheDays}
              hint="Referring-domain sets move slowly. Longer is cheaper; this is the single biggest lever on cost."
            />
            <Field
              name="runsPerAccount"
              label="Reports per account per cycle"
              value={settings.runsPerAccount}
              hint="Stops one customer consuming the whole budget. Zero means unlimited, which is not advisable."
            />
          </div>

          <div className="mt-5">
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? 'Saving...' : 'Save settings'}
            </Button>
          </div>

          {result ? <Feedback result={result} /> : null}
        </form>
      </CardContent>
    </Card>
  );
}

function Field({
  name,
  label,
  value,
  hint,
}: {
  name: string;
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <div>
      <Label htmlFor={name}>{label}</Label>
      <div className="mt-1.5">
        <Input id={name} name={name} type="number" min={0} defaultValue={value} />
      </div>
      {hint ? <p className="mt-1 text-[12px] leading-relaxed text-muted">{hint}</p> : null}
    </div>
  );
}
