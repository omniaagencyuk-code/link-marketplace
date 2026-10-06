import { PageTitle } from '@/components/dashboard/page-title';
import { Card, CardContent } from '@/components/ui/card';
import { Stat } from '@/components/ui/stat';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { GapSettingsForm, GapSwitch } from '@/components/admin/gap-settings-form';
import { gapService } from '@/lib/services/gap-service';
import { getAdminScopedClient } from '@/lib/supabase/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { isAhrefsConfigured } from '@/lib/ahrefs/config';
import { formatDate } from '@/lib/utils/format';

/**
 * The link gap finder, from our side.
 *
 * Leads with the spend because that is the question the feature exists to
 * answer safely: the bill is driven by what customers type, and this budget is
 * deliberately separate from the refresh's so a busy week of reports cannot
 * stop the marketplace's figures updating.
 *
 * The cache hit rate is given room for the same reason. It is the difference
 * between a report costing ten thousand units and costing nothing, and when it
 * falls the budget is the thing that notices.
 */

export const dynamic = 'force-dynamic';

async function recentRuns() {
  if (!isSupabaseEnabled()) return [];

  const { data } = await getAdminScopedClient()
    .from('gap_runs')
    .select('id, target_domain, status, status_reason, gaps_found, sellable_found, units_spent, cache_hits, created_at')
    .order('created_at', { ascending: false })
    .limit(20);

  return (data ?? []) as Record<string, unknown>[];
}

/**
 * The ledger, split by what the call was for.
 *
 * Scoped to `kind = 'refdomains'` rather than counted whole, because a
 * suggestion lookup is fifty units and a referring-domain pull is 2,500: mixing
 * them makes the cache hit rate a figure about neither. Suggestions get their
 * own line, where their one useful property - that they are nearly free - is
 * legible instead of being averaged away.
 */
async function lookupTotals() {
  if (!isSupabaseEnabled()) return { calls: 0, cached: 0, suggestions: 0, suggestionUnits: 0 };

  const supabase = getAdminScopedClient();
  const [all, cached, suggestions] = await Promise.all([
    supabase
      .from('gap_lookups')
      .select('id', { count: 'exact', head: true })
      .eq('kind', 'refdomains'),
    supabase
      .from('gap_lookups')
      .select('id', { count: 'exact', head: true })
      .eq('kind', 'refdomains')
      .eq('from_cache', true),
    supabase.from('gap_lookups').select('units_charged').eq('kind', 'competitors'),
  ]);

  const suggestionRows = (suggestions.data ?? []) as { units_charged?: number }[];

  return {
    calls: Number(all.count ?? 0),
    cached: Number(cached.count ?? 0),
    suggestions: suggestionRows.length,
    suggestionUnits: suggestionRows.reduce((total, row) => total + Number(row.units_charged ?? 0), 0),
  };
}

export default async function AdminLinkGapPage() {
  const [settings, spend, runs, totals] = await Promise.all([
    gapService.settings().catch(() => null),
    gapService.spend().catch(() => ({ unitsUsed: 0, runsThisCycle: 0 })),
    recentRuns().catch(() => []),
    lookupTotals().catch(() => ({ calls: 0, cached: 0, suggestions: 0, suggestionUnits: 0 })),
  ]);

  const budget = settings?.monthlyUnitBudget ?? 0;
  const ceiling = Math.floor((budget * (settings?.unitSafetyPct ?? 90)) / 100);
  const cacheRate = totals.calls > 0 ? Math.round((totals.cached / totals.calls) * 100) : null;

  return (
    <>
      <PageTitle
        title="Link gap finder"
        description="Customers compare themselves against competitors. Its Ahrefs budget is separate from the refresh's and cannot borrow from it."
      />

      <Card className="mb-6">
        <CardContent className="py-5">
          <GapSwitch enabled={settings?.enabled ?? false} configured={isAhrefsConfigured()} />
        </CardContent>
      </Card>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Stat
          label="Units this cycle"
          value={spend.unitsUsed.toLocaleString('en-GB')}
          hint={`of ${budget.toLocaleString('en-GB')}, stopping at ${ceiling.toLocaleString('en-GB')}`}
          tone="accent"
        />
        <Stat
          label="Cache hit rate"
          value={cacheRate === null ? '—' : `${cacheRate}%`}
          hint={
            cacheRate === null
              ? 'No pulls yet'
              : `${totals.cached.toLocaleString('en-GB')} of ${totals.calls.toLocaleString('en-GB')} refdomain pulls free`
          }
        />
        <Stat
          label="Reports this cycle"
          value={String(runs.filter((run) => run.status === 'completed').length)}
          hint="Of the last 20 shown below"
        />
        <Stat
          label="Cost per uncached pull"
          value={(settings?.rowsPerTarget ?? 0).toLocaleString('en-GB')}
          hint="Units, worst case — one per referring domain"
        />
        <Stat
          label="Competitor suggestions"
          value={totals.suggestions.toLocaleString('en-GB')}
          hint={`${totals.suggestionUnits.toLocaleString('en-GB')} units in total — 50 a lookup, and cached`}
        />
      </div>

      <h2 className="mb-3 text-[15px] font-semibold text-ink">Settings</h2>
      {settings ? (
        <GapSettingsForm settings={settings} />
      ) : (
        <p className="text-[13px] text-muted">No settings row. Run migration 0054 and reload.</p>
      )}

      <h2 className="mt-8 mb-3 text-[15px] font-semibold text-ink">Recent reports</h2>
      {runs.length === 0 ? (
        <p className="text-[13px] text-muted">Nobody has run one yet.</p>
      ) : (
        <Card>
          <CardContent className="p-0">
            <TableWrap>
              <Table>
                <thead>
                  <Tr>
                    <Th>Target</Th>
                    <Th>Status</Th>
                    <Th className="text-right">Gaps</Th>
                    <Th className="text-right">Ours</Th>
                    <Th className="text-right">Units</Th>
                    <Th className="text-right">Cached</Th>
                    <Th>When</Th>
                  </Tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <Tr key={String(run.id)}>
                      <Td className="font-medium text-ink">{String(run.target_domain)}</Td>
                      <Td className="text-[13px] text-ink-soft">
                        {String(run.status)}
                        {run.status_reason ? (
                          <span className="block text-[12px] text-muted">
                            {String(run.status_reason)}
                          </span>
                        ) : null}
                      </Td>
                      <Td className="tabular text-right">{Number(run.gaps_found ?? 0)}</Td>
                      <Td className="tabular text-right font-semibold text-ink">
                        {Number(run.sellable_found ?? 0)}
                      </Td>
                      <Td className="tabular text-right">
                        {Number(run.units_spent ?? 0).toLocaleString('en-GB')}
                      </Td>
                      <Td className="tabular text-right">{Number(run.cache_hits ?? 0)}</Td>
                      <Td className="text-[12px] text-muted">
                        {formatDate(String(run.created_at))}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          </CardContent>
        </Card>
      )}
    </>
  );
}
