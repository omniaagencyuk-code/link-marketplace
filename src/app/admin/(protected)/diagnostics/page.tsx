import { PageTitle } from '@/components/dashboard/page-title';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { getCurrentUser } from '@/lib/auth/customer-access';
import { pageContentService } from '@/lib/services/page-content-service';
import { websiteService } from '@/lib/services';

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
 * ## The row that answers the question
 *
 * `getStats` is a single RPC returning three numbers. Whatever it takes is
 * roughly what one round trip to the database costs from wherever this is
 * deployed, so it is the yardstick the others are read against:
 *
 *   * `getStats` fast and `countByNiche` slow means the count was the
 *     problem, which is what 0075 fixes.
 *   * `getStats` itself slow means every query is expensive - the compute
 *     and the database are probably far apart, or the database is small -
 *     and no amount of removing queries fixes that, because the homepage
 *     cannot get below one.
 *   * Everything fast and the total still small means the time is somewhere
 *     this page does not look: a cold start, or the platform in front of it.
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

export default async function AdminDiagnosticsPage() {
  /*
    One at a time, on purpose.

    The homepage runs four of these at once, so measuring them that way would
    report the slowest four times over and hide which one it was.
  */
  const rows = [];
  rows.push(await timed('getStats - one RPC, three numbers', () => websiteService.getStats()));
  rows.push(await timed('getStats again - the same call, warm', () => websiteService.getStats()));
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
        title="Where the time goes"
        description="The homepage's server-side reads, run one at a time against this deployment's database. Reload for a fresh measurement."
      />

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
          round trip to the database and nothing else. If it is slow on its own, every
          query is expensive and removing queries cannot fix it - the compute and the
          database are likely in different regions.
        </p>
      </div>
    </>
  );
}
