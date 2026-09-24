import { getAdminScopedClient } from '@/lib/supabase/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';

/**
 * Exchange rates, fetched daily and stored.
 *
 * Pricing reads them from the database, never from the network. Two reasons,
 * and the second is the important one: a pricing run must not fail because
 * somebody else's API is down, and two runs on the same day must produce the
 * same price. A live lookup would make a recalculation at 9am and one at 2pm
 * quietly disagree.
 *
 * frankfurter.app publishes the ECB reference rates. No key, no account, and
 * the rates are the ones a bank would defend in an argument.
 */

const SOURCE = 'https://api.frankfurter.app/latest?from=GBP';

/** How far a rate must move before every price is worth recalculating. */
export const RATE_MOVE_THRESHOLD_PCT = 2;

export interface FxRate {
  currency: string;
  rateToGbp: number;
  previousRateToGbp: number | null;
  fetchedAt: string;
  /** Absolute move since the last fetch, as a percentage. */
  movedPct: number;
}

/**
 * The source's rates, turned into ours.
 *
 * Pure, and separated from the fetch on purpose: the inversion is the part
 * that can be silently wrong. frankfurter gives GBP -> X; we price X -> GBP,
 * and getting that backwards would not throw. It would make every European
 * publisher look about forty times cheaper than they are.
 */
export function ratesFromSource(
  gbpTo: Record<string, number>,
  previousByCurrency: Map<string, number>,
  fetchedAt: string,
): { rows: Record<string, unknown>[]; moved: { currency: string; movedPct: number }[] } {
  const rows: Record<string, unknown>[] = [];
  const moved: { currency: string; movedPct: number }[] = [];

  for (const [currency, perGbp] of Object.entries(gbpTo)) {
    if (!Number.isFinite(perGbp) || perGbp <= 0) continue;
    if (currency === 'GBP') continue;

    const rateToGbp = 1 / perGbp;
    const previous = previousByCurrency.get(currency) ?? null;

    if (previous && previous > 0) {
      const movedPct = Math.abs((rateToGbp - previous) / previous) * 100;
      if (movedPct >= RATE_MOVE_THRESHOLD_PCT) moved.push({ currency, movedPct });
    }

    rows.push({
      currency,
      rate_to_gbp: rateToGbp,
      previous_rate_to_gbp: previous,
      source: 'frankfurter.app',
      fetched_at: fetchedAt,
    });
  }

  return { rows, moved };
}

export const fxService = {
  async list(): Promise<FxRate[]> {
    if (!isSupabaseEnabled()) return [];
    const supabase = getAdminScopedClient();
    const { data } = await supabase.from('fx_rates').select('*').order('currency');

    return ((data ?? []) as Record<string, unknown>[]).map((row) => {
      const rate = Number(row.rate_to_gbp);
      const previous = row.previous_rate_to_gbp == null ? null : Number(row.previous_rate_to_gbp);
      return {
        currency: String(row.currency),
        rateToGbp: rate,
        previousRateToGbp: previous,
        fetchedAt: String(row.fetched_at),
        movedPct: previous && previous > 0 ? Math.abs((rate - previous) / previous) * 100 : 0,
      };
    });
  },

  /** Currency to rate, for the pricing run. */
  async rateMap(): Promise<Map<string, number>> {
    const rates = await fxService.list();
    const map = new Map(rates.map((rate) => [rate.currency, rate.rateToGbp]));
    // Always present, and never fetched: a GBP publisher must not be at the
    // mercy of whether today's fetch succeeded.
    map.set('GBP', 1);
    return map;
  },

  /**
   * Fetch today's rates and store them.
   *
   * Returns which currencies moved enough to be worth repricing for, so the
   * caller can decide rather than this deciding for it.
   */
  async refresh(): Promise<{
    updated: number;
    moved: { currency: string; movedPct: number }[];
    error?: string;
  }> {
    if (!isSupabaseEnabled()) {
      return { updated: 0, moved: [], error: 'The database is not connected on this deployment.' };
    }

    let payload: { rates?: Record<string, number> };
    try {
      const response = await fetch(SOURCE, {
        headers: { accept: 'application/json' },
        // The daily job can wait; a pricing run is never behind this.
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        return { updated: 0, moved: [], error: `Rate source returned ${response.status}.` };
      }
      payload = (await response.json()) as { rates?: Record<string, number> };
    } catch (error) {
      return {
        updated: 0,
        moved: [],
        error: error instanceof Error ? `Could not reach the rate source: ${error.message}` : 'Could not reach the rate source.',
      };
    }

    // The source gives GBP -> X. We price in the other direction.
    const gbpTo = payload.rates ?? {};
    if (Object.keys(gbpTo).length === 0) {
      return { updated: 0, moved: [], error: 'The rate source returned no rates.' };
    }

    const supabase = getAdminScopedClient();
    const existing = await fxService.list();
    const previousByCurrency = new Map(existing.map((rate) => [rate.currency, rate.rateToGbp]));

    const { rows, moved } = ratesFromSource(gbpTo, previousByCurrency, new Date().toISOString());

    const { error } = await supabase.from('fx_rates').upsert(rows, { onConflict: 'currency' });
    if (error) return { updated: 0, moved: [], error: `Could not store the rates: ${error.message}` };

    return { updated: rows.length, moved };
  },
};
