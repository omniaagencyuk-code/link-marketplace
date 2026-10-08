import { getAdminScopedClient } from '@/lib/supabase/server';
import type { TrueCostIndex } from '@/lib/utils/margin';
import { chunk } from '@/lib/utils/chunk';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { readAllPages } from './supabase/paged';
import { fxService } from './fx-service';
import {
  computePrice,
  type MarkupBand,
  type PriceBreakdown,
  type PricingRules,
  type RoundingTier,
} from '@/lib/pricing/engine';

/**
 * Turning every publisher cost into a sell price.
 *
 * The engine decides what a price should be; this decides which costs to feed
 * it and where the answers go. Calculated prices land in `services` and
 * `website_niche_prices`, which customers already read. The workings land in
 * `price_calculations`, which they cannot - a breakdown contains the cost.
 *
 * Nothing here ever touches a price marked as an override. Somebody typed
 * that number for a reason this code does not know.
 */

export interface PricingSettings {
  rules: PricingRules;
  bands: MarkupBand[];
  rounding: RoundingTier[];
}

export interface PriceRow {
  websiteId: string;
  domain: string;
  linkType: 'guest-post' | 'niche-edit' | 'digital-pr';
  /** '' for the general rate. */
  niche: string;
  breakdown: PriceBreakdown;
  /** What the listing currently sells at, before this run. */
  currentMinor: number | null;
  isOverride: boolean;
  /**
   * The cost is this publisher's sensitive rate applied to a topic they never
   * mentioned, not a price they quoted. It prices defensively, but a human
   * should be able to see which it is.
   */
  assumedCost: boolean;
}

const DEFAULT_RULES: PricingRules = {
  fxBufferPct: 4,
  paypalFeePct: 4,
  paypalFeeFixedMinor: 30,
  cryptoFeePct: 1,
  bankFeePct: 0,
  bankFeeFixedMinor: 0,
  vatReclaimable: false,
  minMarginMinor: 4000,
  agencyDiscountPoints: 10,
};

/** How many listings' rows to ask for at once. */
const WEBSITES_PER_READ = 200;

/** How many rows to send in one upsert. */
const ROWS_PER_WRITE = 500;

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Rows for a set of listings, asked for in batches.
 *
 * Batched by listing rather than paged by offset because these tables are
 * keyed on (website_id, niche, link_type) with no single column to order by
 * safely - and an offset walk over an unstable order skips rows, which is the
 * failure this exists to prevent.
 */
async function readByWebsite<T>(
  what: string,
  websiteIds: string[],
  build: (group: string[]) => any,
): Promise<T[]> {
  const all: T[] = [];
  for (const group of chunk(websiteIds, WEBSITES_PER_READ)) {
    const { data, error } = await build(group);
    // Throws rather than skipping the batch. A skipped batch is a few hundred
    // listings priced from costs that were never read - the sell price comes
    // out wrong and the run reports success, which is the failure this file
    // is full of comments about.
    if (error) throw new Error(`Failed to load ${what}: ${error.message}`);
    all.push(...((data ?? []) as T[]));
  }
  return all;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const pricingService = {
  async getSettings(): Promise<PricingSettings & { reason?: string }> {
    if (!isSupabaseEnabled()) {
      return {
        rules: DEFAULT_RULES,
        bands: [],
        rounding: [],
        reason: 'The database is not connected on this deployment.',
      };
    }

    const supabase = getAdminScopedClient();
    const [rulesRow, bandRows, roundingRows] = await Promise.all([
      supabase.from('pricing_rules').select('*').eq('id', 1).maybeSingle(),
      supabase.from('pricing_bands').select('*').order('min_cost_minor'),
      supabase.from('pricing_rounding').select('*').order('min_minor'),
    ]);

    if (rulesRow.error || !rulesRow.data) {
      return {
        rules: DEFAULT_RULES,
        bands: [],
        rounding: [],
        reason: rulesRow.error
          ? `Could not read the pricing rules: ${rulesRow.error.message}`
          : 'Migration 0022 has not been run yet.',
      };
    }

    const row = rulesRow.data as Record<string, unknown>;
    return {
      rules: {
        fxBufferPct: Number(row.fx_buffer_pct),
        paypalFeePct: Number(row.paypal_fee_pct),
        paypalFeeFixedMinor: Number(row.paypal_fee_fixed_minor),
        cryptoFeePct: Number(row.crypto_fee_pct),
        bankFeePct: Number(row.bank_fee_pct),
        bankFeeFixedMinor: Number(row.bank_fee_fixed_minor),
        vatReclaimable: Boolean(row.vat_reclaimable),
        minMarginMinor: Number(row.min_margin_minor),
        agencyDiscountPoints: Number(row.agency_discount_points),
      },
      bands: ((bandRows.data ?? []) as Record<string, unknown>[]).map((band) => ({
        minCostMinor: Number(band.min_cost_minor),
        markupPct: band.markup_pct == null ? null : Number(band.markup_pct),
        flatMinor: band.flat_minor == null ? null : Number(band.flat_minor),
      })),
      rounding: ((roundingRows.data ?? []) as Record<string, unknown>[]).map((tier) => ({
        minMinor: Number(tier.min_minor),
        allowedLastDigits: (tier.allowed_last_digits as number[]) ?? [],
      })),
    };
  },

  /**
   * Which currencies our publishers actually charge in.
   *
   * The rates panel used to show the first sixteen alphabetically, which put
   * USD - the currency most of the inventory is quoted in - off the end of
   * the list. A panel that cannot show the one currency you need is worse
   * than no panel: it reads as a missing rate when the rate is there.
   */
  async currenciesInUse(): Promise<{ currency: string; listings: number }[]> {
    if (!isSupabaseEnabled()) return [];

    const supabase = getAdminScopedClient();
    const { data } = await supabase
      .from('website_commercials')
      .select('cost_currency, websites!inner (status)')
      .neq('websites.status', 'archived');

    const counts = new Map<string, number>();
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      // Trimmed because the column is char(3): a code stored short comes back
      // padded, and 'US ' would look like a currency of its own.
      const currency = String(row.cost_currency ?? '').trim().toUpperCase();
      if (!currency) continue;
      counts.set(currency, (counts.get(currency) ?? 0) + 1);
    }

    return [...counts.entries()]
      .map(([currency, listings]) => ({ currency, listings }))
      .sort((a, b) => b.listings - a.listings || a.currency.localeCompare(b.currency));
  },

  /**
   * Replace the markup bands.
   *
   * Written as a set rather than row by row: bands are only meaningful in
   * relation to each other, and a half-applied edit could leave a gap that
   * prices nothing, or an overlap that prices twice. Deleted and reinserted
   * in one call so the table is never in an order nobody chose.
   */
  async replaceBands(bands: MarkupBand[]): Promise<{ ok: boolean; error?: string }> {
    if (!isSupabaseEnabled()) return { ok: false, error: 'The database is not connected.' };

    const sorted = [...bands]
      .filter((band) => Number.isFinite(band.minCostMinor) && band.minCostMinor >= 0)
      .sort((a, b) => a.minCostMinor - b.minCostMinor);

    if (sorted.length === 0) return { ok: false, error: 'There has to be at least one band.' };
    // The first has to start at zero or the cheapest placements fall through
    // every band and get no markup at all.
    if (sorted[0]!.minCostMinor !== 0) {
      return { ok: false, error: 'The first band has to start at 0, or cheap listings get no markup.' };
    }
    if (new Set(sorted.map((band) => band.minCostMinor)).size !== sorted.length) {
      return { ok: false, error: 'Two bands cannot start at the same cost.' };
    }
    for (const band of sorted) {
      const hasPct = band.markupPct != null && band.markupPct > 0;
      const hasFlat = band.flatMinor != null && band.flatMinor > 0;
      if (hasPct === hasFlat) {
        return { ok: false, error: 'Each band needs either a percentage or a flat amount, not both and not neither.' };
      }
    }

    const supabase = getAdminScopedClient();
    const { error: clearError } = await supabase
      .from('pricing_bands')
      .delete()
      .gte('min_cost_minor', 0);
    if (clearError) return { ok: false, error: clearError.message };

    const { error } = await supabase.from('pricing_bands').insert(
      sorted.map((band) => ({
        min_cost_minor: Math.round(band.minCostMinor),
        markup_pct: band.markupPct != null && band.markupPct > 0 ? band.markupPct : null,
        flat_minor: band.flatMinor != null && band.flatMinor > 0 ? Math.round(band.flatMinor) : null,
      })),
    );

    return error ? { ok: false, error: error.message } : { ok: true };
  },

  /**
   * What each listing actually costs us, in the currency we sell in.
   *
   * Read from `price_calculations` rather than recomputed, so the figure in
   * the websites table is the same one the pricing screen and the listing
   * breakdown show. Three screens disagreeing about a cost would be worse
   * than the table showing nothing.
   *
   * Every row, general and per niche. It used to be the general rate only,
   * on the grounds that the niche rows are a rate card rather than extra
   * cost - true of a total, and the reason a gambling placement sold at the
   * general price while costing the publisher's sensitive rate showed a
   * healthy margin on the only screen anybody checks. They are not extra
   * cost; they are a different cost for a different thing somebody can buy,
   * and each needs its own margin.
   *
   * It is the true cost - converted, buffered, and with the payment fee and
   * any publisher VAT in it - because that is what leaves our account, and a
   * profit worked out against anything less is one we do not make.
   */
  async trueCostsByWebsite(websiteIds?: string[]): Promise<Record<string, TrueCostIndex>> {
    if (!isSupabaseEnabled()) return {};

    const supabase = getAdminScopedClient();
    const byWebsite: Record<string, TrueCostIndex> = {};

    /*
      Read in pages.

      This used to be the general rates alone - two rows a listing, a few
      hundred in all, comfortably inside any default row cap. With the rate
      card it is a row per topic per placement, so three hundred listings that
      price eight topics is nearer eight thousand. A silently truncated read
      would leave the listings in the tail showing no cost and no margin,
      which is the same table lying quietly that this whole change is about.
    */
    const rows = await readAllPages<Record<string, unknown>>('the true costs', (from, to) => {
      let query = supabase
        .from('price_calculations')
        .select('website_id, link_type, niche, true_cost_minor')
        // `website_id` alone is not unique here - there is a row per topic per
        // placement - and an offset walk over an order with ties the database
        // may break differently each request skips rows. Ordering by the key
        // as well makes the walk total.
        .order('website_id', { ascending: true })
        .order('niche', { ascending: true })
        .order('link_type', { ascending: true })
        .range(from, to);
      if (websiteIds?.length) query = query.in('website_id', websiteIds);
      return query;
    });

    for (const row of rows) {
      const websiteId = String(row.website_id);
      const linkType = String(row.link_type);
      // The general rate is stored with an empty niche, which is the key
      // the margin helpers look under.
      const niche = String(row.niche ?? '');
      const cost = Number(row.true_cost_minor);
      if (!Number.isFinite(cost)) continue;
      ((byWebsite[websiteId] ??= {})[niche] ??= {})[linkType] = cost;
    }

    return byWebsite;
  },

  async updateRules(patch: Partial<PricingRules>, updatedBy?: string): Promise<void> {
    const supabase = getAdminScopedClient();
    const columns: Record<string, unknown> = { updated_by: updatedBy ?? null };
    const map: Record<keyof PricingRules, string> = {
      fxBufferPct: 'fx_buffer_pct',
      paypalFeePct: 'paypal_fee_pct',
      paypalFeeFixedMinor: 'paypal_fee_fixed_minor',
      cryptoFeePct: 'crypto_fee_pct',
      bankFeePct: 'bank_fee_pct',
      bankFeeFixedMinor: 'bank_fee_fixed_minor',
      vatReclaimable: 'vat_reclaimable',
      minMarginMinor: 'min_margin_minor',
      agencyDiscountPoints: 'agency_discount_points',
    };
    for (const [key, column] of Object.entries(map)) {
      const value = patch[key as keyof PricingRules];
      if (value !== undefined) columns[column] = value;
    }
    await supabase.from('pricing_rules').update(columns).eq('id', 1);
  },

  /**
   * Work out what every price would be, without writing anything.
   *
   * The same function backs the preview and the run: a preview that computed
   * prices differently from the run it previews would be worse than no
   * preview at all.
   */
  async calculate(
    settings?: PricingSettings,
    websiteIds?: string[],
  ): Promise<{ rows: PriceRow[]; missingRates: string[]; noCurrency: string[]; noCost: string[] }> {
    if (!isSupabaseEnabled()) return { rows: [], missingRates: [], noCurrency: [], noCost: [] };

    const supabase = getAdminScopedClient();
    const resolved = settings ?? (await pricingService.getSettings());
    const rates = await fxService.rateMap();

    /*
      Read the listings first, then everything else keyed to them.

      The three tables below used to be fetched whole, with no filter and no
      paging, and then narrowed in the loops. That works until the inventory
      outgrows one page of rows - and then it fails in the worst possible way,
      because the rows that fall off the end are simply never priced and
      nothing says so. Nine hundred listings is around two and a half thousand
      services; the ones past the first page came back from approval with
      their cost recorded, their sell price still zero, and no error anywhere.

      Reading by website id fixes both halves: a single-listing run asks for
      that listing's rows and nothing else, and a full run asks in batches
      small enough that no batch can be truncated.
    */
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const websites = await readAllPages<any>('the listings to price', (from, to) => {
      let query = supabase
        .from('websites')
        .select('id, domain, status, website_commercials (cost_currency, payment_methods, prices_exclude_vat, vat_rate_pct)')
        .neq('status', 'archived')
        .order('id', { ascending: true })
        .range(from, to);
      if (websiteIds?.length) query = query.in('id', websiteIds);
      return query;
    });

    const ids = websites.map((site) => String(site.id));
    const [services, nicheCosts, nichePrices] = await Promise.all([
      readByWebsite<any>('the services', ids, (group) =>
        supabase
          .from('services')
          .select('id, website_id, type, price_minor, price_override, service_costs (cost_price_minor)')
          .in('website_id', group),
      ),
      readByWebsite<any>('the niche costs', ids, (group) =>
        supabase
          .from('website_niche_costs')
          .select('website_id, niche, link_type, cost_minor, assumed')
          .in('website_id', group),
      ),
      readByWebsite<any>('the niche prices', ids, (group) =>
        supabase
          .from('website_niche_prices')
          .select('website_id, niche, link_type, price_minor, price_override')
          .in('website_id', group),
      ),
    ]);
    /* eslint-enable @typescript-eslint/no-explicit-any */

    const commercialsFor = new Map(
      websites.map((site) => {
        const raw = Array.isArray(site.website_commercials)
          ? site.website_commercials[0]
          : site.website_commercials;
        return [site.id as string, raw ?? null];
      }),
    );
    const domainFor = new Map(websites.map((site) => [site.id as string, site.domain as string]));

    const overrideNichePrice = new Map(
      nichePrices.map((price) => [
        `${price.website_id}:${price.niche}:${price.link_type}`,
        { priceMinor: Number(price.price_minor), isOverride: Boolean(price.price_override) },
      ]),
    );

    const rows: PriceRow[] = [];
    const missingRates = new Set<string>();
    const noCurrency = new Set<string>();
    const noCost = new Set<string>();

    /** One cost, priced, or skipped with a reason we can report. */
    const price = (
      websiteId: string,
      linkType: PriceRow['linkType'],
      niche: string,
      costMinor: number,
      current: { priceMinor: number; isOverride: boolean } | null,
      assumedCost = false,
    ) => {
      /*
        Nothing to price from.

        This used to return in silence, and silence is what made a page of
        listings at zero impossible to explain: they were in none of the
        lists the run reports, because the run had no list for them. A
        placement with no cost is the commonest reason of the three and it
        was the only one nobody could see.

        Niche rows cannot reach this - their cost column is constrained
        positive - so it only ever describes a general placement.
      */
      if (!costMinor || costMinor <= 0) {
        noCost.add(domainFor.get(websiteId) ?? websiteId);
        return;
      }

      const commercials = commercialsFor.get(websiteId);
      const currency = (commercials?.cost_currency as string | null)?.trim().toUpperCase();

      // No currency recorded is not an invitation to assume ours. It used to
      // default to GBP, which reads a $109 publisher as a £109 one and prices
      // the listing off a cost out by a third. Absence is reported, like a
      // missing rate, and the listing waits for a human to say.
      if (!currency) {
        noCurrency.add(domainFor.get(websiteId) ?? websiteId);
        return;
      }

      const rate = rates.get(currency);

      // A cost in a currency we have no rate for is not priced at a guess.
      if (!rate) {
        missingRates.add(currency);
        return;
      }

      rows.push({
        websiteId,
        domain: domainFor.get(websiteId) ?? '',
        linkType,
        niche,
        currentMinor: current?.priceMinor ?? null,
        isOverride: current?.isOverride ?? false,
        assumedCost,
        breakdown: computePrice(
          {
            costMinor,
            currency,
            fxRate: rate,
            paymentMethods: (commercials?.payment_methods as string[] | null) ?? [],
            pricesExcludeVat: (commercials?.prices_exclude_vat as boolean | null) ?? null,
            vatRatePct: commercials?.vat_rate_pct == null ? null : Number(commercials.vat_rate_pct),
          },
          resolved.rules,
          resolved.bands,
          resolved.rounding,
        ),
      });
    };

    for (const service of services) {
      if (websiteIds?.length && !websiteIds.includes(service.website_id)) continue;
      if (!domainFor.has(service.website_id)) continue;

      const cost = Array.isArray(service.service_costs)
        ? service.service_costs[0]
        : service.service_costs;
      price(
        service.website_id,
        service.type,
        '',
        Number(cost?.cost_price_minor ?? 0),
        {
          priceMinor: Number(service.price_minor),
          isOverride: Boolean(service.price_override),
        },
      );
    }

    for (const nicheCost of nicheCosts) {
      if (websiteIds?.length && !websiteIds.includes(nicheCost.website_id)) continue;
      if (!domainFor.has(nicheCost.website_id)) continue;

      price(
        nicheCost.website_id,
        nicheCost.link_type,
        nicheCost.niche,
        Number(nicheCost.cost_minor),
        overrideNichePrice.get(
          `${nicheCost.website_id}:${nicheCost.niche}:${nicheCost.link_type}`,
        ) ?? null,
        Boolean(nicheCost.assumed),
      );
    }

    return {
      rows,
      missingRates: [...missingRates],
      noCurrency: [...noCurrency],
      noCost: [...noCost],
    };
  },

  /**
   * Write the calculated prices.
   *
   * Overrides are skipped rather than filtered out earlier, so the preview can
   * still show what they would have been - which is the number the margin
   * warning needs when a cost moves underneath a fixed price.
   */
  async apply(websiteIds?: string[]): Promise<{
    priced: number;
    /**
     * Service rows the database actually wrote.
     *
     * Reported rather than inferred from the length of what was sent, because
     * the two differ for a real reason - a `price_override` row is sent and
     * deliberately not written - and because a recalculation that half
     * finished is exactly the thing nobody noticed last time. A number that
     * comes back from the write is the only one that can disagree with the
     * plan, which is the whole point of printing it.
     */
    servicesWritten: number;
    skippedOverrides: number;
    missingRates: string[];
    noCurrency: string[];
    noCost: string[];
  }> {
    const supabase = getAdminScopedClient();
    const { rows, missingRates, noCurrency, noCost } = await pricingService.calculate(
      undefined,
      websiteIds,
    );

    const services: Record<string, unknown>[] = [];
    const nichePrices: Record<string, unknown>[] = [];
    const calculations: Record<string, unknown>[] = [];
    let skippedOverrides = 0;

    for (const row of rows) {
      calculations.push({
        website_id: row.websiteId,
        link_type: row.linkType,
        niche: row.niche,
        cost_minor: row.breakdown.costMinor,
        currency: row.breakdown.currency,
        fx_rate: row.breakdown.fxRate,
        fx_buffer_pct: row.breakdown.fxBufferPct,
        cost_base_minor: row.breakdown.costBaseMinor,
        fee_minor: row.breakdown.feeMinor,
        vat_minor: row.breakdown.vatMinor,
        true_cost_minor: row.breakdown.trueCostMinor,
        band_label: row.breakdown.bandLabel,
        markup_minor: row.breakdown.markupMinor,
        unrounded_minor: row.breakdown.unroundedMinor,
        sell_minor: row.breakdown.sellMinor,
        agency_minor: row.breakdown.agencyMinor,
        margin_minor: row.breakdown.marginMinor,
        calculated_at: new Date().toISOString(),
      });

      if (row.isOverride) {
        skippedOverrides += 1;
        continue;
      }

      if (row.niche === '') {
        services.push({
          website_id: row.websiteId,
          type: row.linkType,
          price_minor: row.breakdown.sellMinor,
          agency_price_minor: row.breakdown.agencyMinor,
        });
      } else {
        nichePrices.push({
          website_id: row.websiteId,
          niche: row.niche,
          link_type: row.linkType,
          price_minor: row.breakdown.sellMinor,
          agency_price_minor: row.breakdown.agencyMinor,
        });
      }
    }

    /*
      Every service in one statement.

      This used to be one `UPDATE` per service, ten in flight at a time, and
      the comment here said an upsert "would need a unique constraint that does
      not exist". That was wrong - `0001_init.sql:161` declares
      `unique (website_id, type)` - but the instinct was right, which is why
      this is a function rather than an upsert: a PostgREST upsert rewrites the
      whole row, so it would reset `turnaround_min_days`, `turnaround_max_days`
      and `note` to their defaults on every service it touched.

      The round trips were what killed it. Against 4,954 services, ten at a
      time is 496 sequential waves - about fifty seconds before the niche
      prices and calculations are even written - and the recalculation was cut
      off part way, leaving 3,479 services on the new rules and 1,475 on the
      old ones. That is the failure the old comment predicted and the reason
      this is now a single call.

      `price_override = false` is enforced inside the function rather than
      here, so a hand-set price survives a bulk recalculation whoever runs it.
    */
    const { data: pricedServices, error: serviceError } = await supabase.rpc(
      'pricing_apply_service_prices',
      {
        p_rows: services.map((service) => ({
          website_id: service.website_id,
          service_type: service.type,
          price_minor: service.price_minor,
          agency_price_minor: service.agency_price_minor,
        })),
      },
    );

    if (serviceError) {
      throw new Error(`Could not write the service prices: ${serviceError.message}`);
    }

    for (const group of chunk(nichePrices, ROWS_PER_WRITE)) {
      await supabase
        .from('website_niche_prices')
        .upsert(group, { onConflict: 'website_id,niche,link_type' });
    }

    for (const group of chunk(calculations, ROWS_PER_WRITE)) {
      await supabase
        .from('price_calculations')
        .upsert(group, { onConflict: 'website_id,link_type,niche' });
    }

    return {
      priced: rows.length - skippedOverrides,
      servicesWritten: typeof pricedServices === 'number' ? pricedServices : 0,
      skippedOverrides,
      missingRates,
      noCurrency,
      noCost,
    };
  },
};
