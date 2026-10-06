import Link from 'next/link';
import { Inbox, Mail, Play, Power, Search, Sparkles, UserSearch } from 'lucide-react';
import { PageTitle } from '@/components/dashboard/page-title';
import { Card, CardContent } from '@/components/ui/card';
import { Stat } from '@/components/ui/stat';
import { Badge } from '@/components/ui/badge';
import { SalesAction } from '@/components/admin/sales-controls';
import { salesAnalyticsService } from '@/lib/services/sales-analytics-service';
import { salesSettingsService } from '@/lib/services/sales-settings-service';
import { salesRunService } from '@/lib/services/sales-run-service';
import { isHunterConfigured } from '@/lib/sales/hunter-config';
import { isExtractionConfigured } from '@/lib/sourcing/client';
import { emailEnabled } from '@/lib/email/config';
import { segmentLabel } from '@/lib/config/sales-segments';
import {
  type SalesActionResult,
  matchAttributionsAction,
  setSalesDryRunAction,
  setSalesEnabledAction,
  startSendRunAction,
  startSweepAction,
} from './actions';

/**
 * The Sales Centre dashboard.
 *
 * Written to answer, in order: is it on, what is it costing, where is the
 * funnel narrow, and what is waiting on a person.
 *
 * The reply rate is given the most prominent position of the three rates
 * because it is the only number here that says whether the emails are any
 * good. A dashboard that leads with prospects added and drafts written is a
 * dashboard measuring its own activity.
 */

export const dynamic = 'force-dynamic';

export default async function SalesPage() {
  const [headline, settings, runs] = await Promise.all([
    salesAnalyticsService.headline().catch(() => null),
    salesSettingsService.get().catch(() => null),
    salesRunService.recent(6).catch(() => []),
  ]);

  const enabled = settings?.enabled ?? false;
  const dryRun = settings?.dryRun ?? true;
  const funnel = headline?.funnel;

  const missing: string[] = [];
  if (!isExtractionConfigured()) missing.push('ANTHROPIC_API_KEY (qualifying and writing)');
  if (!isHunterConfigured()) missing.push('HUNTER_API_KEY (finding contacts)');
  if (!emailEnabled()) missing.push('RESEND_API_KEY (sending)');

  return (
    <>
      <PageTitle
        title="Sales Centre"
        description="Finding companies that buy links, working out whether they would, and writing to them. Nothing goes out without somebody approving it."
      />

      <Card className="mb-6">
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
                  {enabled ? 'Outbound is on' : 'Outbound is off'}
                </h2>
                {dryRun ? (
                  <span className="rounded-full bg-navy-900 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white uppercase">
                    Dry run
                  </span>
                ) : null}
              </div>

              <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-muted">
                {!enabled
                  ? 'The sweeps exit before doing anything. Nothing is crawled, no model is called, no credit is spent and nothing is sent.'
                  : dryRun
                    ? 'Research and qualification run normally. Hunter lookups are refused and nothing is sent - a send run reports what would have gone instead.'
                    : 'Live. Hunter credits are spent against the budget and approved emails are sent to real people.'}
              </p>

              {missing.length > 0 ? (
                <p className="mt-2 text-[12px] leading-relaxed text-muted">
                  Not configured on this deployment: {missing.join(', ')}.
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-start gap-2">
              <SalesAction
                action={setSalesEnabledAction}
                args={[!enabled]}
                label={enabled ? 'Turn off' : 'Turn on'}
                variant={enabled ? 'outline' : 'accent'}
                icon={<Power className="h-3.5 w-3.5" aria-hidden="true" />}
                confirm={
                  enabled
                    ? undefined
                    : dryRun
                      ? 'Turn on? Dry run is still set, so nothing will be sent and no credit spent.'
                      : 'Turn on? Dry run is OFF, so approved emails will be sent to real people and Hunter credits will be spent.'
                }
              />
              <SalesAction
                action={setSalesDryRunAction}
                args={[!dryRun]}
                label={dryRun ? 'Disable dry run' : 'Enable dry run'}
                confirm={
                  dryRun
                    ? 'Turn dry run off? Hunter credits will then be spent and approved emails will actually be sent.'
                    : undefined
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/*
        Spend before funnel.

        Both of these bill, and the Hunter budget ships at zero - so somebody
        arriving on this page for the first time should see why nothing is
        finding contacts before they go looking for a bug.
      */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Reply rate"
          value={headline ? `${headline.replyRatePct}%` : '-'}
          hint={
            funnel && funnel.sent > 0
              ? `${funnel.replied} of ${funnel.sent} sent`
              : 'Nothing sent yet'
          }
          tone="accent"
        />
        <Stat
          label="Cost per reply"
          value={headline?.costPerReplyUsd !== undefined ? `$${headline.costPerReplyUsd}` : '-'}
          hint={headline?.costPerReplyUsd === undefined ? 'No replies yet' : 'Model spend this month'}
        />
        <Stat
          label="Hunter credits"
          value={headline ? `${headline.hunterCreditsUsed} / ${headline.hunterCreditBudget}` : '-'}
          hint={
            headline && headline.hunterCreditBudget === 0
              ? 'Budget is zero, so lookups are refused'
              : 'This cycle'
          }
        />
        <Stat
          label="Model spend"
          value={headline ? `$${headline.aiSpendUsd.toFixed(2)}` : '-'}
          hint={headline ? `of $${headline.aiBudgetUsd.toFixed(2)} this month` : undefined}
        />
      </div>

      <h2 className="mb-3 text-[15px] font-semibold text-ink">The funnel</h2>
      <Card className="mb-6">
        <CardContent className="grid gap-x-6 gap-y-4 py-4 sm:grid-cols-3 lg:grid-cols-6">
          <Figure label="Prospects" value={funnel?.prospects} />
          <Figure label="Researched" value={funnel?.researched} />
          <Figure label="Qualified" value={funnel?.qualified} hint={`${funnel?.disqualified ?? 0} ruled out`} />
          <Figure label="Reachable" value={funnel?.withContact} />
          <Figure label="Sent" value={funnel?.sent} hint={`${headline?.sentToday ?? 0} today of ${headline?.dailySendCap ?? 0}`} />
          <Figure label="Customers" value={funnel?.customers} hint="Matched to a signup" />
        </CardContent>
      </Card>

      {funnel && funnel.awaitingReview > 0 ? (
        <Card className="mb-6 border-amber-300 bg-amber-50/40">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <p className="text-[14px] text-ink">
              <strong>
                {funnel.awaitingReview} email{funnel.awaitingReview === 1 ? '' : 's'}
              </strong>{' '}
              waiting for somebody to read {funnel.awaitingReview === 1 ? 'it' : 'them'}. Nothing
              sends until they are approved.
            </p>
            <Link
              href="/admin/sales/review"
              className="rounded-lg bg-navy-900 px-3 py-2 text-[13px] font-semibold text-white"
            >
              Open the review queue
            </Link>
          </CardContent>
        </Card>
      ) : null}

      <h2 className="mb-3 text-[15px] font-semibold text-ink">Run a sweep</h2>
      <Card className="mb-6">
        <CardContent className="py-4">
          <p className="mb-4 max-w-2xl text-[13px] leading-relaxed text-muted">
            Each one starts and then carries on in the background, so you can close this page. A
            sweep does one stage for everything waiting at it - they are separate because only one
            of them costs money.
          </p>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Sweep
              icon={<Search className="h-3.5 w-3.5" aria-hidden="true" />}
              label="Research"
              note="Reads their websites. Costs nothing."
              action={startSweepAction}
              args={['research']}
              waiting={(funnel?.prospects ?? 0) - (funnel?.researched ?? 0)}
              disabled={!enabled}
            />
            <Sweep
              icon={<Sparkles className="h-3.5 w-3.5" aria-hidden="true" />}
              label="Qualify"
              note="Asks the model who buys. Costs model tokens."
              action={startSweepAction}
              args={['qualify']}
              waiting={(funnel?.researched ?? 0) - (funnel?.qualified ?? 0) - (funnel?.disqualified ?? 0)}
              disabled={!enabled || !isExtractionConfigured()}
            />
            <Sweep
              icon={<UserSearch className="h-3.5 w-3.5" aria-hidden="true" />}
              label="Find contacts"
              note="Spends a Hunter credit each."
              action={startSweepAction}
              args={['contacts']}
              waiting={(funnel?.qualified ?? 0) - (funnel?.withContact ?? 0)}
              disabled={!enabled || dryRun || !isHunterConfigured()}
              disabledReason={
                dryRun ? 'Dry run refuses Hunter lookups.' : !isHunterConfigured() ? 'No Hunter key.' : undefined
              }
            />
            <Sweep
              icon={<Mail className="h-3.5 w-3.5" aria-hidden="true" />}
              label="Draft follow-ups"
              note="For anybody who has not replied."
              action={startSweepAction}
              args={['draft']}
              disabled={!enabled || !isExtractionConfigured()}
            />
          </div>

          <div className="mt-5 flex flex-wrap items-start gap-3 border-t border-line pt-4">
            <SalesAction
              action={startSendRunAction}
              label={dryRun ? 'Dry run the sender' : 'Send approved now'}
              variant="primary"
              icon={<Play className="h-3.5 w-3.5" aria-hidden="true" />}
              disabled={!enabled}
              confirm={
                dryRun
                  ? undefined
                  : 'Send every approved email that is due? This goes to real people and cannot be undone.'
              }
            />
            <SalesAction
              action={matchAttributionsAction}
              label="Match customers"
              icon={<Inbox className="h-3.5 w-3.5" aria-hidden="true" />}
            />
            <p className="max-w-md text-[12px] leading-relaxed text-muted">
              The sender only takes emails somebody approved, that are due, whose address is not
              suppressed, inside the daily cap, one per company. It runs on its own every five
              minutes too.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-[15px] font-semibold text-ink">Pipeline</h2>
          <Card>
            <CardContent className="py-4">
              {headline && headline.byStage.length > 0 ? (
                <ul className="space-y-2">
                  {headline.byStage.map((entry) => (
                    <li key={entry.stage} className="flex items-center justify-between gap-3">
                      <Link
                        href={`/admin/sales/prospects?stage=${entry.stage}`}
                        className="text-[13px] text-ink capitalize hover:underline"
                      >
                        {entry.stage.replace(/_/g, ' ')}
                      </Link>
                      <span className="tabular text-[13px] font-semibold text-ink">{entry.count}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13px] text-muted">No prospects yet.</p>
              )}
            </CardContent>
          </Card>
        </section>

        <section>
          <h2 className="mb-3 text-[15px] font-semibold text-ink">Recent sweeps</h2>
          <Card>
            <CardContent className="py-4">
              {runs.length === 0 ? (
                <p className="text-[13px] text-muted">Nothing has run yet.</p>
              ) : (
                <ul className="space-y-3">
                  {runs.map((run) => (
                    <li key={run.id} className="text-[13px]">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium text-ink capitalize">{run.kind}</span>
                        <Badge
                          tone={
                            run.status === 'completed'
                              ? 'accent'
                              : run.status === 'running'
                                ? 'navy'
                                : 'neutral'
                          }
                        >
                          {run.status}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-[12px] text-muted">
                        {run.looked} looked at, {run.succeeded} done
                        {run.failed > 0 ? `, ${run.failed} failed` : ''}
                        {run.creditsSpent > 0 ? `, ${run.creditsSpent} credits` : ''}
                        {run.costUsd > 0 ? `, $${run.costUsd.toFixed(2)}` : ''}
                        {run.reason ? ` - ${run.reason}` : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>
      </div>

      {headline && headline.bySegment.length > 0 ? (
        <section className="mt-6">
          <h2 className="mb-3 text-[15px] font-semibold text-ink">By segment</h2>
          <Card>
            <CardContent className="flex flex-wrap gap-x-6 gap-y-2 py-4">
              {headline.bySegment.map((entry) => (
                <Link
                  key={entry.segment}
                  href={`/admin/sales/prospects?segment=${entry.segment}`}
                  className="text-[13px] text-ink hover:underline"
                >
                  {segmentLabel(entry.segment)}{' '}
                  <span className="tabular font-semibold">{entry.count}</span>
                </Link>
              ))}
            </CardContent>
          </Card>
        </section>
      ) : null}
    </>
  );
}

function Figure({ label, value, hint }: { label: string; value?: number; hint?: string }) {
  return (
    <div>
      <p className="text-[12px] font-medium tracking-wide text-muted uppercase">{label}</p>
      <p className="tabular mt-1 text-xl font-semibold text-ink">
        {value === undefined ? '-' : value.toLocaleString('en-GB')}
      </p>
      {hint ? <p className="mt-0.5 text-[12px] text-muted">{hint}</p> : null}
    </div>
  );
}

/**
 * One sweep's card.
 *
 * It takes the action and its arguments separately and hands both to
 * `SalesAction`, rather than wrapping the action in a closure here. A closure
 * built in a server component cannot cross into a client one, and nothing but
 * opening the page says so.
 */
function Sweep({
  icon,
  label,
  note,
  action,
  args,
  waiting,
  disabled,
  disabledReason,
}: {
  icon: React.ReactNode;
  label: string;
  note: string;
  action: (kind: 'research' | 'qualify' | 'contacts' | 'draft') => Promise<SalesActionResult>;
  args: ['research' | 'qualify' | 'contacts' | 'draft'];
  waiting?: number;
  disabled?: boolean;
  disabledReason?: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-white p-3">
      <p className="flex items-center gap-2 text-[13px] font-semibold text-ink">
        {icon}
        {label}
      </p>
      <p className="mt-1 mb-2.5 text-[12px] leading-relaxed text-muted">
        {note}
        {waiting !== undefined && waiting > 0 ? ` ${waiting} waiting.` : ''}
      </p>
      <SalesAction
        action={action}
        args={args}
        label="Start"
        disabled={disabled}
        disabledReason={disabled ? (disabledReason ?? 'Outbound is off.') : undefined}
      />
    </div>
  );
}
