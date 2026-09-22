import { AlertTriangle, RefreshCw } from 'lucide-react';
import { PageTitle } from '@/components/dashboard/page-title';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { RefreshControls } from '@/components/admin/refresh-controls';
import { refreshService } from '@/lib/services/refresh-service';
import { formatDateTime, formatNumber } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

const TIER_LABELS: Record<number, string> = {
  1: 'Tier 1 - weekly',
  2: 'Tier 2 - biweekly',
  3: 'Tier 3 - monthly',
};

export default async function RefreshPage() {
  const status = await refreshService.getStatus();
  const { settings } = status;

  // The budget the guard will actually use. Ahrefs' own limit wins over the
  // configured one, which is a fallback for when Ahrefs cannot be reached.
  const budget = status.ahrefsUsage?.unitsLimit ?? settings?.monthlyUnitBudget ?? 0;

  const ceiling = settings ? Math.floor((budget * settings.budgetSafetyPct) / 100) : 0;
  // Spend is whichever figure the guard would trust: the account-wide reading
  // when there is one, this job's own total when there is not.
  const spend = status.ahrefsUsage?.unitsUsed ?? status.unitsThisCycle;
  const spendPct = budget > 0 ? Math.min(100, Math.round((spend / budget) * 100)) : 0;

  const totalOverdue = status.overdue.reduce((sum, row) => sum + row.overdue, 0);
  const totalDomains = status.overdue.reduce((sum, row) => sum + row.total, 0);

  const projected = status.projectedMonthlyUnits;
  const projectedPct = budget > 0 ? Math.round((projected / budget) * 100) : 0;
  const projectionWarning =
    settings != null && budget > 0 && projectedPct >= settings.projectionWarnPct;

  return (
    <>
      <PageTitle
        title="Ahrefs refresh"
        description="Keeps domain rating and organic traffic current, on a different cadence per tier."
      />

      {!settings ? (
        <Card>
          <CardContent className="py-8 text-center text-[14px] text-muted">
            Refresh settings are not available. Connect Supabase and run migration 0013.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          <RefreshControls
            enabled={settings.enabled}
            dryRun={settings.dryRun}
            ahrefsConfigured={status.ahrefsConfigured}
          />

          {/* ------------------------------------------- spend projection */}
          {projectionWarning ? (
            <Card className="border-coral-300 bg-coral-50">
              <CardContent className="flex gap-2.5 py-4">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-coral-700" aria-hidden="true" />
                <div className="text-[13px] leading-relaxed text-coral-900">
                  <p className="font-semibold">
                    These cadences would cost about {formatNumber(projected)} units a month -{' '}
                    {projectedPct}% of the {formatNumber(budget)} available.
                  </p>
                  <p className="mt-1">
                    Counted from the {formatNumber(totalDomains)} domains in the inventory today at{' '}
                    {status.unitsPerDomainActual
                      ? `${status.unitsPerDomainActual.toFixed(1)} units per domain, measured from live runs`
                      : `${settings.unitsPerDomain} units per domain, estimated`}
                    . Lengthen an interval or shrink tier 1 to bring it down; the guard will
                    otherwise stop runs part-way through the month at{' '}
                    {settings.budgetSafetyPct}%.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {/* ------------------------------------------------ this cycle */}
          <Card>
            <CardHeader className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle>This billing cycle</CardTitle>
              {status.cycleStart ? (
                <span className="text-[12px] text-muted">
                  since {formatDateTime(status.cycleStart)}
                </span>
              ) : null}
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="tabular text-2xl font-semibold text-ink">
                  {formatNumber(spend)}
                </span>
                <span className="text-[13px] text-muted">
                  of {formatNumber(budget)} units ({spendPct}%)
                </span>
              </div>

              <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-sunken">
                {/* The guard sits below the budget, so both are shown: the bar
                    fills to spend, the marker shows where the job stops. */}
                <div
                  className={spendPct >= settings.budgetSafetyPct ? 'h-full bg-coral-500' : 'h-full bg-accent-500'}
                  style={{ width: `${spendPct}%` }}
                />
              </div>

              <p className="mt-2 text-[12px] text-muted">
                The job stops at {settings.budgetSafetyPct}% of the budget, which is{' '}
                {formatNumber(ceiling)} units. This job&rsquo;s own runs account for{' '}
                {formatNumber(status.unitsThisCycle)} of it.
              </p>

              {/* The account is shared with everything else that uses the
                  allowance, so the figure the guard trusts is Ahrefs' own. */}
              {status.ahrefsUsage ? (
                <p className="mt-2 text-[12px] text-muted">
                  Ahrefs reported {formatNumber(status.ahrefsUsage.unitsUsed)} units used across the
                  whole workspace
                  {status.ahrefsUsage.unitsLimit
                    ? ` of ${formatNumber(status.ahrefsUsage.unitsLimit)}`
                    : ''}
                  , read {formatDateTime(status.ahrefsUsage.observedAt)}
                  {status.ahrefsUsage.usageResetAt
                    ? `, resetting ${formatDateTime(status.ahrefsUsage.usageResetAt)}`
                    : ''}
                  . Runs use that figure in preference to this one.
                </p>
              ) : (
                <p className="mt-2 text-[12px] text-muted">
                  No live reading from Ahrefs yet. Runs cross-check against the account before
                  spending, and record what they find here.
                </p>
              )}
            </CardContent>
          </Card>

          {/* --------------------------------------------------- overdue */}
          <Card>
            <CardHeader className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle>Overdue by tier</CardTitle>
              <span className="text-[13px] text-muted">
                {formatNumber(totalOverdue)} due now
              </span>
            </CardHeader>
            <CardContent>
              {status.overdue.length === 0 ? (
                <p className="text-[14px] text-muted">
                  No domains have been assigned a tier yet. Use Assign tiers above.
                </p>
              ) : (
                <TableWrap>
                  <Table>
                    <caption className="sr-only">Domains overdue for refresh, by tier</caption>
                    <thead>
                      <tr>
                        <Th>Tier</Th>
                        <Th>Interval</Th>
                        <Th className="text-right">Overdue</Th>
                        <Th className="text-right">Total</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {status.overdue.map((row) => (
                        <Tr key={row.tier}>
                          <Td className="text-[13px] font-medium text-ink">
                            {TIER_LABELS[row.tier] ?? `Tier ${row.tier}`}
                          </Td>
                          <Td className="text-[13px] text-muted">
                            {row.tier === 1
                              ? `${settings.tier1IntervalDays} days`
                              : row.tier === 2
                                ? `${settings.tier2IntervalDays} days`
                                : `${settings.tier3IntervalDays} days`}
                          </Td>
                          <Td className="tabular text-right text-[13px] text-ink">
                            {formatNumber(row.overdue)}
                          </Td>
                          <Td className="tabular text-right text-[13px] text-muted">
                            {formatNumber(row.total)}
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                </TableWrap>
              )}
            </CardContent>
          </Card>

          {/* ------------------------------------------------ run history */}
          <Card>
            <CardHeader>
              <CardTitle>Recent runs</CardTitle>
            </CardHeader>
            <CardContent>
              {status.recentRuns.length === 0 ? (
                <p className="text-[14px] text-muted">
                  Nothing has run yet. The schedule fires daily at 03:00 UTC.
                </p>
              ) : (
                <TableWrap>
                  <Table>
                    <caption className="sr-only">Recent refresh runs</caption>
                    <thead>
                      <tr>
                        <Th>Started</Th>
                        <Th>Status</Th>
                        <Th className="text-right">Refreshed</Th>
                        <Th className="text-right">Units</Th>
                        <Th className="min-w-56">Detail</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {status.recentRuns.map((run) => (
                        <Tr key={run.id}>
                          <Td className="tabular text-[13px] whitespace-nowrap text-muted">
                            {formatDateTime(run.startedAt)}
                          </Td>
                          <Td>
                            <Badge
                              tone={
                                run.status === 'completed'
                                  ? 'accent'
                                  : run.status === 'failed'
                                    ? 'coral'
                                    : 'neutral'
                              }
                            >
                              {run.status}
                              {run.dryRun ? ' (dry)' : ''}
                            </Badge>
                          </Td>
                          <Td className="tabular text-right text-[13px] text-ink-soft">
                            {formatNumber(run.domainsRefreshed)}
                            {run.domainsFailed > 0 ? (
                              <span className="ml-1 text-coral-700">+{run.domainsFailed} failed</span>
                            ) : null}
                          </Td>
                          <Td className="tabular text-right text-[13px] text-ink-soft">
                            {formatNumber(run.unitsSpent)}
                          </Td>
                          <Td className="text-[12px] leading-snug text-muted">
                            {run.error ? (
                              <span className="flex items-start gap-1.5 text-coral-700">
                                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                {run.error}
                              </span>
                            ) : (
                              (run.reason ?? '—')
                            )}
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                </TableWrap>
              )}
            </CardContent>
          </Card>

          {/* ---------------------------------------------------- tuning */}
          <Card>
            <CardHeader className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-muted" aria-hidden="true" />
              <CardTitle>Tuning</CardTitle>
            </CardHeader>
            <CardContent>
              <RefreshControls
                enabled={settings.enabled}
                dryRun={settings.dryRun}
                ahrefsConfigured={status.ahrefsConfigured}
                settings={settings}
                variant="settings"
              />
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
