'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminSession } from '@/lib/auth/admin-access';
import { pricingService, type PricingSettings } from '@/lib/services/pricing-service';
import { fxService } from '@/lib/services/fx-service';
import { getAdminScopedClient } from '@/lib/supabase/server';
import type { PricingRules } from '@/lib/pricing/engine';

/**
 * The pricing screen's actions.
 *
 * The rule that shapes all of them: a change that moves prices is previewed
 * before it is applied. Editing a markup band is a decision about several
 * hundred listings at once, and "how many change, by how much" is the only
 * way to make that decision with your eyes open.
 */

/**
 * What a rule change would do, without doing it.
 *
 * Calculated with the proposed settings against the same function that will
 * apply them, so the preview cannot disagree with the run it previews.
 */
export async function previewRulesAction(patch: Partial<PricingRules>) {
  await requireAdminSession();

  const current = await pricingService.getSettings();
  const proposed: PricingSettings = {
    ...current,
    rules: { ...current.rules, ...patch },
  };

  const [before, after] = await Promise.all([
    pricingService.calculate(current),
    pricingService.calculate(proposed),
  ]);

  const beforeByKey = new Map(
    before.rows.map((row) => [`${row.websiteId}:${row.linkType}:${row.niche}`, row]),
  );

  let changed = 0;
  let totalMove = 0;
  let largest = { domain: '', fromMinor: 0, toMinor: 0, moveMinor: 0 };
  let belowMinimum = 0;

  for (const row of after.rows) {
    if (row.isOverride) continue;
    const was = beforeByKey.get(`${row.websiteId}:${row.linkType}:${row.niche}`);
    if (!was) continue;

    const move = row.breakdown.sellMinor - was.breakdown.sellMinor;
    if (move !== 0) {
      changed += 1;
      totalMove += Math.abs(move);
      if (Math.abs(move) > Math.abs(largest.moveMinor)) {
        largest = {
          domain: row.domain,
          fromMinor: was.breakdown.sellMinor,
          toMinor: row.breakdown.sellMinor,
          moveMinor: move,
        };
      }
    }
    if (row.breakdown.marginMinor < proposed.rules.minMarginMinor) belowMinimum += 1;
  }

  return {
    ok: true,
    total: after.rows.length,
    changed,
    averageMoveMinor: changed > 0 ? Math.round(totalMove / changed) : 0,
    largest,
    belowMinimum,
    missingRates: after.missingRates,
  };
}

export async function saveRulesAction(patch: Partial<PricingRules>) {
  const session = await requireAdminSession();
  await pricingService.updateRules(patch, session.email ?? undefined);

  // Editing the rules is one of the three things the brief says reprices
  // everything, and doing it here rather than leaving a button means the
  // stored prices cannot sit out of step with the rules that made them.
  const applied = await pricingService.apply();

  revalidatePath('/admin/pricing');
  revalidatePath('/admin/websites');
  return { ok: true, ...applied };
}

export async function recalculateAction() {
  await requireAdminSession();
  const applied = await pricingService.apply();
  revalidatePath('/admin/pricing');
  revalidatePath('/admin/websites');
  return { ok: true, ...applied };
}

/**
 * Replace the markup bands.
 *
 * No preview gate on this one, unlike the rules: a band edit is followed by
 * the same Recalculate with its own preview, and making somebody preview
 * twice to change one number is how a screen stops being used.
 */
export async function saveBandsAction(
  bands: { minCostMinor: number; markupPct: number | null; flatMinor: number | null }[],
) {
  await requireAdminSession();
  const result = await pricingService.replaceBands(bands);
  revalidatePath('/admin/pricing');
  return result;
}

export async function refreshRatesAction() {
  await requireAdminSession();
  const result = await fxService.refresh();
  revalidatePath('/admin/pricing');
  return result;
}

/**
 * Fix a price by hand.
 *
 * An override is a statement that the engine is wrong about this one, so it
 * is remembered as such and left alone by every recalculation afterwards.
 * Clearing it hands the price back to the engine.
 */
export async function setOverrideAction(input: {
  websiteId: string;
  linkType: string;
  niche: string;
  priceMinor: number | null;
}) {
  await requireAdminSession();
  const supabase = getAdminScopedClient();

  if (input.niche === '') {
    await supabase
      .from('services')
      .update(
        input.priceMinor == null
          ? { price_override: false }
          : // Sellable for the same reason a calculated price is: somebody
            // has now said what this costs a customer.
            { price_minor: input.priceMinor, price_override: true, available: true },
      )
      .eq('website_id', input.websiteId)
      .eq('type', input.linkType);
  } else {
    await supabase
      .from('website_niche_prices')
      .update(
        input.priceMinor == null
          ? { price_override: false }
          : { price_minor: input.priceMinor, price_override: true },
      )
      .eq('website_id', input.websiteId)
      .eq('niche', input.niche)
      .eq('link_type', input.linkType);
  }

  // Clearing an override hands the price straight back to the engine rather
  // than leaving the typed number sitting there until the next run.
  if (input.priceMinor == null) await pricingService.apply([input.websiteId]);

  revalidatePath('/admin/pricing');
  revalidatePath(`/admin/websites/${input.websiteId}`);
  return { ok: true };
}
