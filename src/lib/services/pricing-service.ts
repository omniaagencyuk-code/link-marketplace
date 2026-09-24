import { getAdminScopedClient } from '@/lib/supabase/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';
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
   * What each listing actually costs us, in GBP.
   *
   * Read from `price_calculations` rather than recomputed, so the figure in
   * the websites table is the same one the pricing screen and the listing
   * breakdown show. Three screens disagreeing about a cost would be worse
   * than the table showing nothing.
   *
   * Only the general rate per placement type: the niche rows are a rate card,
   * not additional cost, and adding them would treat one placement as several.
   *
   * It is the true cost - converted, buffered, and with the payment fee and
   * any publisher VAT in it - because that is what leaves our account, and a
   * profit worked out against anything less is one we do not make.
   */
  async trueCostsByWebsite(
    websiteIds?: string[],
  ): Promise<Record<string, Record<string, number>>> {
    if (!isSupabaseEnabled()) return {};

    const supabase = getAdminScopedClient();
    let query = supabase
      .from('price_calculations')
      .select('website_id, link_type, true_cost_minor')
      .eq('niche', '');
    if (websiteIds?.length) query = query.in('website_id', websiteIds);

    const { data } = await query;

    const byWebsite: Record<string, Record<string, number>> = {};
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      const websiteId = String(row.website_id);
      const linkType = String(row.link_type);
      const cost = Number(row.true_cost_minor);
      if (!Number.isFinite(cost)) continue;
      (byWebsite[websiteId] ??= {})[linkType] = cost;
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
  ): Promise<{ rows: PriceRow[]; missingRates: string[]; noCurrency: string[] }> {
    if (!isSupabaseEnabled()) return { rows: [], missingRates: [], noCurrency: [] };

    const supabase = getAdminScopedClient();
    const resolved = settings ?? (await pricingService.getSettings());
    const rates = await fxService.rateMap();

    let websiteQuery = supabase
      .from('websites')
      .select(
        'id, domain, status, website_commercials (cost_currency, payment_methods, prices_exclude_vat, vat_rate_pct)',
      )
      .neq('status', 'archived');
    if (websiteIds?.length) websiteQuery = websiteQuery.in('id', websiteIds);

    const [websiteRows, serviceRows, nicheCostRows, nichePriceRows] = await Promise.all([
      websiteQuery,
      supabase.from('services').select('id, website_id, type, price_minor, price_override, service_costs (cost_price_minor)'),
      supabase.from('website_niche_costs').select('website_id, niche, link_type, cost_minor'),
      supabase.from('website_niche_prices').select('website_id, niche, link_type, price_minor, price_override'),
    ]);

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const websites = (websiteRows.data ?? []) as any[];
    const services = (serviceRows.data ?? []) as any[];
    const nicheCosts = (nicheCostRows.data ?? []) as any[];
    const nichePrices = (nichePriceRows.data ?? []) as any[];
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

    /** One cost, priced, or skipped with a reason we can report. */
    const price = (
      websiteId: string,
      linkType: PriceRow['linkType'],
      niche: string,
      costMinor: number,
      current: { priceMinor: number; isOverride: boolean } | null,
    ) => {
      if (!costMinor || costMinor <= 0) return;

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
      );
    }

    return { rows, missingRates: [...missingRates], noCurrency: [...noCurrency] };
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
    skippedOverrides: number;
    missingRates: string[];
    noCurrency: string[];
  }> {
    const supabase = getAdminScopedClient();
    const { rows, missingRates, noCurrency } = await pricingService.calculate(
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
        cost_gbp_minor: row.breakdown.costGbpMinor,
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

    // Services are updated rather than upserted: the row already exists, and
    // an upsert on (website_id, type) would need a unique constraint that
    // does not exist.
    for (const service of services) {
      await supabase
        .from('services')
        .update({
          price_minor: service.price_minor,
          agency_price_minor: service.agency_price_minor,
        })
        .eq('website_id', service.website_id)
        .eq('type', service.type)
        .eq('price_override', false);
    }

    if (nichePrices.length > 0) {
      await supabase
        .from('website_niche_prices')
        .upsert(nichePrices, { onConflict: 'website_id,niche,link_type' });
    }

    if (calculations.length > 0) {
      await supabase
        .from('price_calculations')
        .upsert(calculations, { onConflict: 'website_id,link_type,niche' });
    }

    return {
      priced: rows.length - skippedOverrides,
      skippedOverrides,
      missingRates,
      noCurrency,
    };
  },
};
