import { PageTitle } from '@/components/dashboard/page-title';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { stripeReadiness } from '@/lib/services/stripe-readiness';
import type { Verdict } from '@/lib/stripe/readiness-rules';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { getCurrentUser } from '@/lib/auth/customer-access';
import { getServerClient } from '@/lib/supabase/server';
import { pageContentService } from '@/lib/services/page-content-service';
import { websiteService } from '@/lib/services';
import { inventoryReadReport } from '@/lib/services/inventory-reads';
import { formatDate } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

/**
 * Where the homepage's server time goes.
 *
 * Built because a measurement said 6.89 seconds waiting for the first byte,
 * and the explanation on hand accounted for perhaps a fifth of it. Guessing
 * at the rest from here has already cost a day this week; this runs the
 * homepage's reads one at a time, in production, against the real database,
 * and prints what each one took.
 *
 * ## The yardstick, and why it is not a service call any more
 *
 * The first version of this used `getStats` called twice as the baseline,
 * on the grounds that the second call was one round trip and nothing else.
 * Then `getStats` was memoised - because this page showed it being asked for
 * twice in one render - and the baseline started reporting 0ms, measuring
 * the cache rather than the database. An instrument that its own findings
 * invalidate is worse than no instrument, because it still prints a number.
 *
 * So the baseline is now its own query, made here, deliberately outside
 * everything that might memoise it. It is read twice: the first carries
 * whatever connection setup costs, the second is the steady-state price of
 * one round trip from wherever this is deployed.
 *
 * Read the rest against that second figure:
 *
 *   * a read costing one baseline is doing one query, and the only way to
 *     make it cheaper is not to make it;
 *   * a read costing several is either making several queries or carrying
 *     a lot of rows back, and both are fixable here;
 *   * a baseline that is itself large means the compute and the database
 *     are far apart, and nothing in this repository can fix it. Measured at
 *     131ms from Washington against a London database, and at roughly a
 *     third of that once the functions were moved to London.
 *
 * ## Why it is admin-only and why it does not cache
 *
 * It reads nothing a customer cannot already see, but it reports how the
 * deployment performs, which is nobody else's business. `force-dynamic`
 * because a cached timing is not a timing.
 */
async function timed<T>(label: string, run: () => Promise<T>) {
  const started = performance.now();
  try {
    await run();
    return { label, ms: Math.round(performance.now() - started), failed: false };
  } catch {
    // A read that throws still took time, and how long is the interesting
    // part: a timeout looks completely different from a refusal.
    return { label, ms: Math.round(performance.now() - started), failed: true };
  }
}

const verdictTone: Record<Verdict, BadgeTone> = {
  ok: 'positive',
  warn: 'warning',
  bad: 'negative',
  unknown: 'neutral',
};

const verdictWord: Record<Verdict, string> = {
  ok: 'Ready',
  warn: 'Not taking real money',
  bad: 'Broken',
  unknown: 'Cannot tell',
};

export default async function AdminDiagnosticsPage() {
  /*
    Payments first, because this is the screen somebody opens when the site
    is misbehaving and "are we taking money" outranks "is the homepage
    slow". It asks Stripe rather than reading the environment: every
    configuration answer was yes on the afternoon this site spent taking
    sandbox payments.
  */
  const payments = await stripeReadiness();
  /*
    Who the inventory budget has stopped, which is the half of 0090 a
    customer is deliberately told nothing about. Read before the timings
    below so its two queries are not counted as homepage time.
  */
  const inventory = await inventoryReadReport();
  /*
    One at a time, on purpose.

    The homepage runs four of these at once, so measuring them that way would
    report the slowest four times over and hide which one it was.
  */
  /*
    The baseline. Its own client and its own query, so nothing memoises it.
  */
  const probe = async () => {
    const supabase = await getServerClient();
    await supabase.rpc('marketplace_stats').maybeSingle();
  };

  const rows = [];
  rows.push(await timed('one round trip, cold - includes connecting', probe));
  rows.push(await timed('one round trip, warm - THE YARDSTICK', probe));
  rows.push(await timed('getStats - memoised, so free after the first ask', () => websiteService.getStats()));
  rows.push(await timed('getStats again - should be 0ms', () => websiteService.getStats()));
  rows.push(await timed('countByNiche - the homepage niche cards', () => websiteService.countByNiche()));
  rows.push(await timed('getPublicPreview(5) - the sample rows', () => websiteService.getPublicPreview(5)));
  rows.push(await timed("content('home') - the page's copy", () => pageContentService.content('home')));
  rows.push(await timed("content('home') again - should be free if memoised", () => pageContentService.content('home')));
  rows.push(await timed('getCurrentUser - the auth check in the root layout', () => getCurrentUser()));

  const total = rows.reduce((sum, row) => sum + row.ms, 0);
  const baseline = rows[1]?.ms ?? 0;

  return (
    <>
      <PageTitle
        title="Diagnostics"
        description="Whether this deployment can take payments, and where the homepage's server time goes. Reload for a fresh measurement."
      />

      <section className="mb-8" aria-labelledby="inventory">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 id="inventory" className="text-[15px] font-semibold text-ink">
            The inventory budget
          </h2>
          <span className="text-[13px] text-muted">
            {inventory.capRows.toLocaleString('en-GB')} rows per account per{' '}
            {inventory.windowHours === 1 ? 'hour' : `${inventory.windowHours} hours`}
          </span>
        </div>

        <p className="mb-4 max-w-3xl text-[13px] leading-relaxed text-muted">
          Since 0090 a customer&rsquo;s own key reads nothing from the publisher tables, so the
          only way to collect the inventory is to drive the pages - and this is what that
          costs them. A refusal says &ldquo;try again shortly&rdquo; and quotes none of these
          figures, which is why they are here instead.{' '}
          {inventory.refusalsEver > 0 ? (
            <>
              <strong className="font-semibold text-ink">
                {inventory.refusalsEver.toLocaleString('en-GB')}
              </strong>{' '}
              refusals recorded in total.
            </>
          ) : (
            'Nothing has been refused yet.'
          )}
        </p>

        {inventory.failed ? (
          <p className="rounded-[var(--radius-card)] border border-line bg-white px-4 py-6 text-[13px] text-muted shadow-[var(--shadow-card)]">
            Could not read the budget tables. That is a failure to report, not an account
            behaving itself.
          </p>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-[13px] font-semibold text-ink">Spending now</h3>
              <TableWrap>
                <Table>
                  <caption className="sr-only">Accounts inside the current window</caption>
                  <thead>
                    <tr>
                      <Th>Account</Th>
                      <Th className="text-right">Rows</Th>
                      <Th className="text-right">Window ends</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventory.spenders.length === 0 ? (
                      <Tr>
                        <Td colSpan={3} className="py-6 text-center text-[13px] text-muted">
                          Nobody has read a listing this hour.
                        </Td>
                      </Tr>
                    ) : null}
                    {inventory.spenders.map((account) => (
                      <Tr key={`${account.label}-${account.at}`}>
                        <Td className="max-w-[18rem] truncate text-[13px] text-ink">
                          {account.label}
                        </Td>
                        {/* Against the cap, because a number on its own does not
                            say whether somebody is about to be stopped. */}
                        <Td className="tabular text-right text-[13px] text-ink">
                          {account.rows.toLocaleString('en-GB')}
                          <span className="ml-1 text-[11px] text-muted">
                            of {inventory.capRows.toLocaleString('en-GB')}
                          </span>
                        </Td>
                        <Td className="tabular text-right text-[12px] whitespace-nowrap text-muted">
                          {new Date(account.at).toLocaleTimeString('en-GB', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            </div>

            <div>
              <h3 className="mb-2 text-[13px] font-semibold text-ink">Refused</h3>
              <TableWrap>
                <Table>
                  <caption className="sr-only">Reads the budget refused</caption>
                  <thead>
                    <tr>
                      <Th>Account</Th>
                      <Th className="text-right">Asked for</Th>
                      <Th className="text-right">When</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventory.refusals.length === 0 ? (
                      <Tr>
                        <Td colSpan={3} className="py-6 text-center text-[13px] text-muted">
                          Nobody has been refused.
                        </Td>
                      </Tr>
                    ) : null}
                    {inventory.refusals.map((account) => (
                      <Tr key={`${account.label}-${account.at}`}>
                        <Td className="max-w-[18rem] truncate text-[13px] text-ink">
                          {account.label}
                        </Td>
                        <Td className="tabular text-right text-[13px] text-ink">
                          {account.rows.toLocaleString('en-GB')}
                        </Td>
                        <Td className="tabular text-right text-[12px] whitespace-nowrap text-muted">
                          {formatDate(account.at)}
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            </div>
          </div>
        )}
      </section>

      <section className="mb-8" aria-labelledby="payments">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 id="payments" className="text-[15px] font-semibold text-ink">
            Can we take payments?
          </h2>
          <Badge tone={verdictTone[payments.verdict]}>{verdictWord[payments.verdict]}</Badge>
        </div>

        <TableWrap>
          <Table>
            <caption className="sr-only">Stripe readiness</caption>
            <thead>
              <tr>
                <Th className="w-56">Check</Th>
                <Th className="w-28">Verdict</Th>
                <Th>What it means</Th>
              </tr>
            </thead>
            <tbody>
              {payments.checks.map((check) => (
                <Tr key={check.label}>
                  <Td className="text-[13px] font-medium text-ink">{check.label}</Td>
                  <Td>
                    <Badge tone={verdictTone[check.verdict]}>{check.verdict === 'ok' ? 'Yes' : check.verdict === 'bad' ? 'No' : check.verdict === 'warn' ? 'Not live' : '?'}</Badge>
                  </Td>
                  <Td className="text-[13px] text-muted">{check.detail}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>

        {/*
          The limit of what this screen can know, said on the screen. A
          signing secret is shown by Stripe once and never again, so no
          amount of asking proves the stored one belongs to the endpoint
          above it - only a delivery that verified.
        */}
        <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-muted">
          Every row but the last asks Stripe, not this deployment&rsquo;s configuration.
          What none of them can prove is that the stored webhook secret belongs to the
          endpoint found: Stripe shows a signing secret once, at creation. The last
          delivery accepted is the only evidence, because a signature that verified
          could only have come from the right secret. Setup is written up in
          <code className="mx-1 rounded bg-surface-sunken px-1 py-0.5 text-[12px]">docs/stripe-setup.md</code>.
        </p>
      </section>

      <h2 className="mb-3 text-[15px] font-semibold text-ink">Where the time goes</h2>

      <TableWrap>
        <Table>
          <caption className="sr-only">Timing of each read the homepage makes</caption>
          <thead>
            <tr>
              <Th>Read</Th>
              <Th className="text-right">Time</Th>
              <Th className="text-right">Round trips, if one costs {baseline}ms</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Tr key={row.label}>
                <Td className="text-[13px] text-ink">
                  {row.label}
                  {row.failed ? <span className="ml-2 text-coral-700">failed</span> : null}
                </Td>
                <Td className="tabular text-right text-[13px] font-semibold text-ink">{row.ms}ms</Td>
                <Td className="tabular text-right text-[13px] text-muted">
                  {baseline > 0 ? `${(row.ms / baseline).toFixed(1)}×` : '—'}
                </Td>
              </Tr>
            ))}
            <Tr>
              <Td className="text-[13px] font-semibold text-ink">
                Total, run one after another
              </Td>
              <Td className="tabular text-right text-[13px] font-semibold text-ink">{total}ms</Td>
              <Td />
            </Tr>
          </tbody>
        </Table>
      </TableWrap>

      {/*
        Said on the page rather than left for somebody to remember, because
        the whole point of this screen is that it is read by whoever is
        looking at a slow site rather than by whoever built it.
      */}
      <div className="mt-6 max-w-2xl space-y-3 text-[13px] leading-relaxed text-muted">
        <p>
          The homepage runs four of these at once, so its real cost is nearer the
          slowest of them than this total. The total is here to be compared with the
          browser&rsquo;s &ldquo;waiting for server response&rdquo;: whatever that
          figure has left over is being spent somewhere other than these reads.
        </p>
        <p>
          <strong className="text-ink">The second row is the yardstick.</strong> It is one
          query returning three integers, made outside anything that memoises, so it is
          the price of a single round trip from here. Everything below it costs some
          multiple of that. If the yardstick itself is large, the compute and the
          database are far apart and nothing in the code can fix it: it was 131ms with
          the functions in Washington and a London database, and about a third of that
          once they were moved to London.
        </p>
      </div>
    </>
  );
}
