'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, Layers, Play, Power } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  assignTiersAction,
  previewTiersAction,
  runNowAction,
  saveRefreshSettingsAction,
  setDryRunAction,
  setRefreshEnabledAction,
  type RefreshActionResult,
} from '@/app/admin/(protected)/refresh/actions';
import type { RefreshSettings } from '@/lib/services/refresh-service';

/**
 * The switches, and the numbers behind them.
 *
 * Two independent controls, which is the point: the master switch decides
 * whether the job does anything at all, and dry run decides whether doing
 * something costs money. Turning the job on with dry run still set spends
 * nothing, which is the order to enable them in.
 *
 * Turning the refresh ON asks for confirmation. Turning it off does not -
 * stopping spending should never need a second click.
 */
export function RefreshControls({
  enabled,
  dryRun,
  ahrefsConfigured,
  settings,
  variant = 'switches',
}: {
  enabled: boolean;
  dryRun: boolean;
  ahrefsConfigured: boolean;
  settings?: RefreshSettings;
  variant?: 'switches' | 'settings';
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<RefreshActionResult | null>(null);
  const [confirmingEnable, setConfirmingEnable] = useState(false);

  function run(action: () => Promise<RefreshActionResult>) {
    setResult(null);
    startTransition(async () => {
      const outcome = await action();
      setResult(outcome);
      setConfirmingEnable(false);
      router.refresh();
    });
  }

  const feedback = result ? (
    <div
      role="status"
      className={
        result.ok
          ? 'mt-4 flex gap-2 rounded-lg border border-accent-300 bg-accent-50/50 p-3 text-[13px] leading-relaxed text-ink'
          : 'mt-4 flex gap-2 rounded-lg border border-coral-300 bg-coral-50 p-3 text-[13px] leading-relaxed text-coral-900'
      }
    >
      {result.ok ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent-700" aria-hidden="true" />
      ) : (
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      )}
      <span>{result.error ?? result.message}</span>
    </div>
  ) : null;

  if (variant === 'settings' && settings) {
    return (
      <form action={(formData) => run(() => saveRefreshSettingsAction(formData))}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Number name="tier1Size" label="Tier 1 size" value={settings.tier1Size} hint="Top domains by rank." />
          <Number name="tier2Size" label="Tier 2 size" value={settings.tier2Size} hint="The next band. The rest are tier 3." />
          <Number name="tier1IntervalDays" label="Tier 1 interval (days)" value={settings.tier1IntervalDays} />
          <Number name="tier2IntervalDays" label="Tier 2 interval (days)" value={settings.tier2IntervalDays} />
          <Number name="tier3IntervalDays" label="Tier 3 interval (days)" value={settings.tier3IntervalDays} />
          <Number
            name="unitsPerDomain"
            label="Units per domain (estimate)"
            value={settings.unitsPerDomain}
            hint="Used to forecast a run before it happens. The real cost is read back from Ahrefs."
          />
          <Number name="monthlyUnitBudget" label="Monthly unit budget" value={settings.monthlyUnitBudget} />
          <Number name="budgetSafetyPct" label="Budget guard (%)" value={settings.budgetSafetyPct} hint="The job stops at this share of the budget." />
          <Number name="billingCycleDay" label="Billing resets on day" value={settings.billingCycleDay} hint="1-28." />
          <Number name="batchSize" label="Batch size" value={settings.batchSize} hint="Ahrefs caps this at 100." />
          <Number name="maxBatchesPerRun" label="Max batches per run" value={settings.maxBatchesPerRun} hint="Caps one run's spend and runtime." />
          <Number
            name="projectionWarnPct"
            label="Warn at (% of budget)"
            value={settings.projectionWarnPct}
            hint="Warns when the cadences would cost this much of the month."
          />
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? 'Saving...' : 'Save settings'}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={confirmThenAssign}
          >
            <Layers className="h-4 w-4" aria-hidden="true" />
            Assign tiers
          </Button>
          <p className="text-[12px] text-muted">
            Assigning ranks every domain by DR then traffic. Domains pinned to a tier by hand are
            left alone.
          </p>
        </div>

        {feedback}
      </form>
    );
  }

  /**
   * Say what it will cost before doing it.
   *
   * This button reassigns the whole inventory and the cost lands every month
   * afterwards. At the sizes it ships with, and an inventory smaller than
   * them, every listing ranks inside the top two bands and nothing is left on
   * the monthly cadence - four times the current spend, measured, with no
   * confirmation and no way to see the number first.
   *
   * Which is why the dialog leads on the change rather than the total: the
   * total is inside the budget and inside the warning threshold, so neither
   * existing guard says a word about it.
   *
   * The action refuses a cadence that cannot be met on its own; this is so
   * nobody has to be refused to find out.
   */
  function confirmThenAssign() {
    startTransition(async () => {
      const preview = await previewTiersAction().catch(() => null);

      if (preview) {
        const summary =
          `This will set:\n\n` +
          `  ${preview.tier1.toLocaleString('en-GB')} domains to weekly\n` +
          `  ${preview.tier2.toLocaleString('en-GB')} to fortnightly\n` +
          `  ${preview.tier3.toLocaleString('en-GB')} to monthly\n\n` +
          `Monthly cost now: ${preview.currentMonthlyUnits.toLocaleString('en-GB')} units\n` +
          `Monthly cost after: ${preview.projectedMonthlyUnits.toLocaleString('en-GB')} units` +
          (preview.budget > 0 ? ` (${preview.percentOfBudget}% of the allowance)` : '') +
          // The multiple, because a percentage inside budget reads as fine
          // and "four times what you spend today, every month" does not.
          (preview.currentMonthlyUnits > 0 &&
          preview.projectedMonthlyUnits > preview.currentMonthlyUnits * 1.2
            ? `\n\nThat is ${(preview.projectedMonthlyUnits / preview.currentMonthlyUnits).toFixed(1)}x ` +
              `what the current cadence costs, and it recurs every month.`
            : '') +
          (preview.exceedsCeiling
            ? `\n\nThis is more than the ${preview.ceiling.toLocaleString('en-GB')} this job ` +
              `stops at, so it will be refused. Runs would stop on the budget guard and ` +
              `leave listings overdue. Lower the tier sizes first.`
            : preview.aboveWarnThreshold
              ? `\n\nThat is above your ${preview.warnPct}% warning threshold and it recurs ` +
                `every month. Continue?`
              : `\n\nContinue?`);

        if (preview.exceedsCeiling) {
          window.alert(summary);
          return;
        }
        if (!window.confirm(summary)) return;
      }

      setResult(await assignTiersAction());
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="py-5">
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
                {enabled ? 'Refresh is on' : 'Refresh is off'}
              </h2>
              {dryRun ? (
                <span className="rounded-full bg-navy-900 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white uppercase">
                  Dry run
                </span>
              ) : null}
            </div>

            <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-muted">
              {!enabled
                ? 'The daily job still runs on schedule, but exits before calling Ahrefs. No units are spent.'
                : dryRun
                  ? 'Runs select overdue domains and record what they would do. The only call to Ahrefs is the free usage check; no units are spent.'
                  : 'Runs call Ahrefs and spend units against the monthly budget, checking the account balance before each one.'}
            </p>

            {!ahrefsConfigured ? (
              <p className="mt-2 flex items-start gap-1.5 text-[12px] leading-relaxed text-muted">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                AHREFS_API_TOKEN is not set, so a live run would skip rather than spend, and
                there is no usage reading to check the budget against. Dry runs work without it.
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {confirmingEnable ? (
              <>
                <p className="text-[13px] text-ink">
                  {dryRun
                    ? 'Turn on? Dry run is still set, so nothing will be spent.'
                    : 'Turn on? Runs will start spending Ahrefs units.'}
                </p>
                <Button
                  type="button"
                  variant="accent"
                  size="sm"
                  disabled={pending}
                  onClick={() => run(() => setRefreshEnabledAction(true))}
                >
                  {pending ? 'Working...' : 'Turn on'}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setConfirmingEnable(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant={enabled ? 'outline' : 'accent'}
                size="sm"
                disabled={pending}
                onClick={() =>
                  enabled ? run(() => setRefreshEnabledAction(false)) : setConfirmingEnable(true)
                }
              >
                <Power className="h-3.5 w-3.5" aria-hidden="true" />
                {enabled ? 'Turn off' : 'Turn on'}
              </Button>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => run(() => setDryRunAction(!dryRun))}
            >
              {dryRun ? 'Disable dry run' : 'Enable dry run'}
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => run(runNowAction)}
            >
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
              Run now
            </Button>
          </div>
        </div>

        {feedback}
      </CardContent>
    </Card>
  );
}

function Number({
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
      {hint ? <p className="mt-1 text-[12px] text-muted">{hint}</p> : null}
    </div>
  );
}
