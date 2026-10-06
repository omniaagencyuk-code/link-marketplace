import { getAdminScopedClient } from '@/lib/supabase/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { referringDomains } from '@/lib/ahrefs/client';
import { isAhrefsConfigured } from '@/lib/ahrefs/config';
import { checkTargets, findGap, type GapRow } from '@/lib/gap/analysis';
import { isFresh, mayRunGap, type GapDecision } from '@/lib/gap/cost';

/**
 * Running a link gap report.
 *
 * The expensive half of this feature is one call per target, priced per
 * referring domain, and the customer chooses the targets. So the order below
 * is not incidental:
 *
 *   1. Check what they typed. A malformed domain is fifty units for an empty
 *      answer.
 *   2. Work out which targets are already cached and fresh.
 *   3. Ask the guard, costing only the uncached ones.
 *   4. Only then spend anything.
 *
 * A refusal is written down as a run with status `refused`, which is how the
 * admin page can show how often people are being turned away - and, because
 * `gap_runs_this_cycle` excludes refusals, being told no never counts against
 * the customer's allocation.
 */

const MAX_STORED_RESULTS = 500;

export interface GapSettings {
  enabled: boolean;
  monthlyUnitBudget: number;
  unitSafetyPct: number;
  billingCycleDay: number;
  rowsPerTarget: number;
  maxCompetitors: number;
  cacheDays: number;
  runsPerAccount: number;
}

const SETTINGS_SELECT = `
  enabled, monthly_unit_budget, unit_safety_pct, billing_cycle_day,
  rows_per_target, max_competitors, cache_days, runs_per_account
`;

type Row = Record<string, unknown>;

function mapSettings(row: Row): GapSettings {
  return {
    enabled: Boolean(row.enabled),
    monthlyUnitBudget: Number(row.monthly_unit_budget ?? 0),
    unitSafetyPct: Number(row.unit_safety_pct ?? 90),
    billingCycleDay: Number(row.billing_cycle_day ?? 1),
    rowsPerTarget: Number(row.rows_per_target ?? 2500),
    maxCompetitors: Number(row.max_competitors ?? 3),
    cacheDays: Number(row.cache_days ?? 30),
    runsPerAccount: Number(row.runs_per_account ?? 5),
  };
}

export interface GapResultRow {
  domain: string;
  linkingCompetitors: string[];
  websiteId?: string;
  domainRating?: number;
  organicTraffic?: number;
}

export interface GapReport {
  id: string;
  targetDomain: string;
  competitorDomains: string[];
  status: 'running' | 'completed' | 'failed' | 'refused';
  statusReason?: string;
  gapsFound: number;
  sellableFound: number;
  truncated: boolean;
  createdAt: string;
  results: GapResultRow[];
}

export const gapService = {
  async settings(): Promise<GapSettings | null> {
    if (!isSupabaseEnabled()) return null;

    const { data, error } = await getAdminScopedClient()
      .from('gap_settings')
      .select(SETTINGS_SELECT)
      .eq('id', true)
      .maybeSingle();

    if (error) throw new Error(`Could not read the gap settings: ${error.message}`);
    return data ? mapSettings(data as Row) : null;
  },

  /**
   * What has been spent, and by whom.
   *
   * Both figures come from the database rather than from arithmetic here: the
   * units from the ledger, the run count from the runs. Measured, not
   * estimated, for the reason 0014 wrote down.
   */
  async spend(userId?: string): Promise<{ unitsUsed: number; runsThisCycle: number }> {
    if (!isSupabaseEnabled()) return { unitsUsed: 0, runsThisCycle: 0 };

    const supabase = getAdminScopedClient();
    const [units, runs] = await Promise.all([
      supabase.rpc('gap_units_this_cycle'),
      userId
        ? supabase.rpc('gap_runs_this_cycle', { p_user: userId })
        : Promise.resolve({ data: 0, error: null }),
    ]);

    if (units.error) throw new Error(`Could not read the gap spend: ${units.error.message}`);

    return {
      unitsUsed: Number(units.data ?? 0),
      runsThisCycle: Number(runs.data ?? 0),
    };
  },

  /**
   * One target's referring domains, from the cache where it is still fresh.
   *
   * Returns whether it was cached, because that is what the guard costed the
   * run on and what the ledger records. A cached pull is written to the ledger
   * too, at zero units - "did the cache help" should be answerable from the
   * same table as "what did this cost".
   */
  async refdomainsFor(
    domain: string,
    settings: GapSettings,
    runId: string | null,
  ): Promise<{ domains: string[]; cached: boolean; truncated: boolean; units: number }> {
    const supabase = getAdminScopedClient();

    const { data: snapshot } = await supabase
      .from('refdomain_snapshots')
      .select('domains, truncated, fetched_at')
      .eq('domain', domain)
      .maybeSingle();

    if (snapshot) {
      const row = snapshot as Row;
      if (isFresh(String(row.fetched_at), settings.cacheDays)) {
        await supabase.from('gap_lookups').insert({
          run_id: runId,
          target: domain,
          rows_returned: (row.domains as string[]).length,
          units_charged: 0,
          from_cache: true,
        });

        return {
          domains: (row.domains as string[]) ?? [],
          cached: true,
          truncated: Boolean(row.truncated),
          units: 0,
        };
      }
    }

    try {
      const pulled = await referringDomains(domain, settings.rowsPerTarget);

      /*
        The ledger first, then the cache.

        In that order because the credit has been spent either way: if the
        snapshot write fails we have still been charged, and a budget counted
        from a ledger with a missing row under-counts and keeps spending.
      */
      await supabase.from('gap_lookups').insert({
        run_id: runId,
        target: domain,
        rows_returned: pulled.domains.length,
        // Null means Ahrefs did not report a cost. Charged at the cap rather
        // than at zero: an unknown cost that reads as free is a budget that
        // never fills up.
        units_charged: pulled.unitsCost ?? settings.rowsPerTarget,
        from_cache: false,
      });

      await supabase.from('refdomain_snapshots').upsert(
        {
          domain,
          domains: pulled.domains,
          row_count: pulled.domains.length,
          truncated: pulled.truncated,
          units_charged: pulled.unitsCost ?? 0,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: 'domain' },
      );

      return {
        domains: pulled.domains,
        cached: false,
        truncated: pulled.truncated,
        units: pulled.unitsCost ?? settings.rowsPerTarget,
      };
    } catch (error) {
      await supabase.from('gap_lookups').insert({
        run_id: runId,
        target: domain,
        rows_returned: 0,
        units_charged: 0,
        error: error instanceof Error ? error.message.slice(0, 300) : 'Pull failed',
      });
      throw error;
    }
  },

  /**
   * The whole report.
   *
   * Nothing is spent before the guard has said yes, and the guard is costed
   * on the uncached targets only - so the second customer in a niche to name
   * the same three competitors pays for their own domain and nothing else.
   */
  async run(
    userId: string,
    rawTarget: string,
    rawCompetitors: string[],
  ): Promise<{ ok: true; runId: string } | { ok: false; error: string }> {
    if (!isSupabaseEnabled()) return { ok: false, error: 'Not available right now.' };

    const settings = await gapService.settings();
    if (!settings) return { ok: false, error: 'Not available right now.' };

    const checked = checkTargets(rawTarget, rawCompetitors, settings.maxCompetitors);
    if (!checked.ok) return { ok: false, error: checked.error };

    const { target, competitors } = checked.targets;
    const allTargets = [target, ...competitors];
    const supabase = getAdminScopedClient();

    // Which of these we already hold, fresh. Asked before the guard, because
    // it is what the guard costs the run on.
    const { data: snapshots } = await supabase
      .from('refdomain_snapshots')
      .select('domain, fetched_at')
      .in('domain', allTargets);

    const fresh = new Set(
      ((snapshots ?? []) as Row[])
        .filter((row) => isFresh(String(row.fetched_at), settings.cacheDays))
        .map((row) => String(row.domain)),
    );
    const uncachedTargets = allTargets.filter((entry) => !fresh.has(entry)).length;

    const spend = await gapService.spend(userId);
    const decision: GapDecision = mayRunGap({
      settings,
      configured: isAhrefsConfigured(),
      unitsUsedThisCycle: spend.unitsUsed,
      runsThisCycle: spend.runsThisCycle,
      uncachedTargets,
    });

    if (!decision.allowed) {
      /*
        A refusal is a row.

        So the admin page can see how often people are being turned away and
        why - and because `gap_runs_this_cycle` excludes refusals, being told
        no never counts against the customer's allocation.
      */
      await supabase.from('gap_runs').insert({
        user_id: userId,
        target_domain: target,
        competitor_domains: competitors,
        status: 'refused',
        status_reason: decision.reason,
      });

      return { ok: false, error: decision.reason };
    }

    const { data: created, error: createError } = await supabase
      .from('gap_runs')
      .insert({ user_id: userId, target_domain: target, competitor_domains: competitors })
      .select('id')
      .maybeSingle();

    if (createError || !created) {
      return { ok: false, error: 'Could not start that report. Try again in a moment.' };
    }

    const runId = String((created as Row).id);

    try {
      let units = 0;
      let cacheHits = 0;
      let truncated = false;
      const byCompetitor = new Map<string, string[]>();
      let targetRefdomains: string[] = [];

      for (const domain of allTargets) {
        const pulled = await gapService.refdomainsFor(domain, settings, runId);
        units += pulled.units;
        if (pulled.cached) cacheHits += 1;
        if (pulled.truncated) truncated = true;

        if (domain === target) targetRefdomains = pulled.domains;
        else byCompetitor.set(domain, pulled.domains);
      }

      const gap = findGap({
        target,
        competitors,
        refdomainsByCompetitor: byCompetitor,
        targetRefdomains,
      });

      const { data: sellable } = await supabase.rpc('gap_sellable', {
        p_domains: gap.map((row) => row.domain),
      });

      const ours = new Map(
        ((sellable ?? []) as Row[]).map((row) => [
          String(row.domain),
          {
            websiteId: String(row.website_id),
            domainRating: Number(row.domain_rating ?? 0),
            organicTraffic: Number(row.organic_traffic ?? 0),
          },
        ]),
      );

      /*
        Everything we can sell, then the strongest of the rest.

        A gap of four thousand domains is not a thing anybody reads, and the
        rows with money attached are a small fraction of it. Those are kept
        whole; the remainder is cut at the cap, strongest first, so the report
        still shows the shape of the gap without storing all of it.
      */
      const sellableRows = gap.filter((row) => ours.has(row.domain));
      const rest = gap.filter((row) => !ours.has(row.domain));
      const kept = [...sellableRows, ...rest.slice(0, Math.max(0, MAX_STORED_RESULTS - sellableRows.length))];

      const WRITE_AT_ONCE = 200;
      for (let index = 0; index < kept.length; index += WRITE_AT_ONCE) {
        const slice = kept.slice(index, index + WRITE_AT_ONCE);
        await supabase.from('gap_results').upsert(
          slice.map((row: GapRow) => ({
            run_id: runId,
            domain: row.domain,
            website_id: ours.get(row.domain)?.websiteId ?? null,
            linking_competitors: row.linkingCompetitors,
          })),
          { onConflict: 'run_id,domain' },
        );
      }

      await supabase
        .from('gap_runs')
        .update({
          status: 'completed',
          gaps_found: gap.length,
          sellable_found: sellableRows.length,
          units_spent: units,
          cache_hits: cacheHits,
          truncated,
          finished_at: new Date().toISOString(),
        })
        .eq('id', runId);

      return { ok: true, runId };
    } catch (error) {
      await supabase
        .from('gap_runs')
        .update({
          status: 'failed',
          status_reason: 'That report could not be finished. Nothing has been taken off your allowance.',
          finished_at: new Date().toISOString(),
        })
        .eq('id', runId);

      console.error('[gap] run failed:', String(error).slice(0, 200));
      return { ok: false, error: 'That report could not be finished. Please try again.' };
    }
  },

  /**
   * One report, for the customer who ran it.
   *
   * Scoped by `user_id` here as well as by row security. The service role
   * bypasses RLS, so the policy on `gap_runs` protects a customer reading
   * directly and this protects them from a bug in our own code - the two
   * guards are for different failures.
   */
  async report(runId: string, userId: string): Promise<GapReport | null> {
    if (!isSupabaseEnabled()) return null;

    const supabase = getAdminScopedClient();

    const { data: run } = await supabase
      .from('gap_runs')
      .select(
        'id, target_domain, competitor_domains, status, status_reason, gaps_found, sellable_found, truncated, created_at',
      )
      .eq('id', runId)
      .eq('user_id', userId)
      .maybeSingle();

    if (!run) return null;
    const header = run as Row;

    const { data: rows } = await supabase
      .from('gap_results')
      .select('domain, website_id, linking_competitors, websites(domain_rating, organic_traffic)')
      .eq('run_id', runId)
      .order('website_id', { ascending: false, nullsFirst: false });

    const results: GapResultRow[] = ((rows ?? []) as Row[]).map((row) => {
      const site = row.websites as { domain_rating?: number; organic_traffic?: number } | null;
      return {
        domain: String(row.domain),
        linkingCompetitors: (row.linking_competitors as string[]) ?? [],
        websiteId: (row.website_id as string) ?? undefined,
        domainRating: site?.domain_rating ?? undefined,
        organicTraffic: site?.organic_traffic ?? undefined,
      };
    });

    return {
      id: String(header.id),
      targetDomain: String(header.target_domain),
      competitorDomains: (header.competitor_domains as string[]) ?? [],
      status: header.status as GapReport['status'],
      statusReason: (header.status_reason as string) ?? undefined,
      gapsFound: Number(header.gaps_found ?? 0),
      sellableFound: Number(header.sellable_found ?? 0),
      truncated: Boolean(header.truncated),
      createdAt: String(header.created_at),
      results: results.sort(
        (a, b) =>
          Number(Boolean(b.websiteId)) - Number(Boolean(a.websiteId)) ||
          b.linkingCompetitors.length - a.linkingCompetitors.length ||
          a.domain.localeCompare(b.domain),
      ),
    };
  },

  async recentRuns(userId: string, limit = 10) {
    if (!isSupabaseEnabled()) return [];

    const { data } = await getAdminScopedClient()
      .from('gap_runs')
      .select('id, target_domain, competitor_domains, status, gaps_found, sellable_found, created_at')
      .eq('user_id', userId)
      .neq('status', 'refused')
      .order('created_at', { ascending: false })
      .limit(limit);

    return ((data ?? []) as Row[]).map((row) => ({
      id: String(row.id),
      targetDomain: String(row.target_domain),
      competitorDomains: (row.competitor_domains as string[]) ?? [],
      status: row.status as GapReport['status'],
      gapsFound: Number(row.gaps_found ?? 0),
      sellableFound: Number(row.sellable_found ?? 0),
      createdAt: String(row.created_at),
    }));
  },
};
