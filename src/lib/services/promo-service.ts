import { getAdminScopedClient } from '@/lib/supabase/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { getStripe } from '@/lib/stripe/client';
import {
  normaliseCode,
  validatePromo,
  type PromoCode,
  type PromoContext,
  type PromoVerdict,
} from '@/lib/promos/rules';

/**
 * Promo codes: storing them, mirroring them into Stripe, and counting them.
 *
 * Everything here runs on the service role, because `promo_codes` has no
 * policy for anybody else - see the migration for why a customer-readable
 * promo table is a published list of every code in the business. Validation
 * is therefore a server action that answers one question about one code, and
 * never hands the browser a row.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapPromo(row: any): PromoCode {
  return {
    id: row.id,
    code: row.code,
    description: row.description ?? '',
    kind: row.kind,
    ...(row.percent_off == null ? {} : { percentOff: row.percent_off }),
    ...(row.amount_off_minor == null ? {} : { amountOffMinor: row.amount_off_minor }),
    ...(row.currency ? { currency: row.currency } : {}),
    ...(row.starts_at ? { startsAt: row.starts_at } : {}),
    ...(row.expires_at ? { expiresAt: row.expires_at } : {}),
    ...(row.max_redemptions == null ? {} : { maxRedemptions: row.max_redemptions }),
    ...(row.max_per_customer == null ? {} : { maxPerCustomer: row.max_per_customer }),
    ...(row.min_order_minor == null ? {} : { minOrderMinor: row.min_order_minor }),
    firstOrderOnly: row.first_order_only === true,
    active: row.active !== false,
    ...(row.stripe_coupon_id ? { stripeCouponId: row.stripe_coupon_id } : {}),
    createdAt: row.created_at,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const COLUMNS =
  'id, code, description, kind, percent_off, amount_off_minor, currency, starts_at, expires_at, ' +
  'max_redemptions, max_per_customer, min_order_minor, first_order_only, active, ' +
  'stripe_coupon_id, created_at';

export interface CreatePromoInput {
  code: string;
  description: string;
  kind: 'percent' | 'fixed';
  percentOff?: number;
  amountOffMinor?: number;
  currency?: string;
  startsAt?: string;
  expiresAt?: string;
  maxRedemptions?: number;
  maxPerCustomer?: number;
  minOrderMinor?: number;
  firstOrderOnly: boolean;
}

export interface PromoWithUsage {
  code: PromoCode;
  /** Paid redemptions. Counted from rows, never from a stored tally. */
  redemptions: number;
  discountedMinor: number;
}

/**
 * Create the Stripe coupon that will do the arithmetic.
 *
 * Deliberately created without Stripe's own `max_redemptions`. The limit lives
 * in our table, counted from paid orders, and mirroring it into Stripe would
 * be a second source of truth that drifts the first time an order is refunded.
 */
async function createStripeCoupon(input: CreatePromoInput, code: string): Promise<string | null> {
  const stripe = getStripe();
  if (!stripe) return null;

  const coupon = await stripe.coupons.create({
    name: code,
    duration: 'once',
    ...(input.kind === 'percent'
      ? { percent_off: input.percentOff! }
      : { amount_off: input.amountOffMinor!, currency: (input.currency ?? 'GBP').toLowerCase() }),
    metadata: { promoCode: code },
  });

  return coupon.id;
}

export interface CreateResult {
  ok: boolean;
  error?: string;
  /** Set when the code was stored but Stripe could not be told about it. */
  warning?: string;
}

export const promoService = {
  /** Every code, newest first, with what it has actually given away. */
  async list(): Promise<PromoWithUsage[]> {
    if (!isSupabaseEnabled()) return [];

    const supabase = getAdminScopedClient();
    const [{ data: codes }, { data: redemptions }] = await Promise.all([
      supabase.from('promo_codes').select(COLUMNS).order('created_at', { ascending: false }),
      supabase.from('promo_redemptions').select('promo_code_id, discount_minor'),
    ]);

    const tally = new Map<string, { count: number; total: number }>();
    for (const row of (redemptions ?? []) as { promo_code_id: string; discount_minor: number }[]) {
      const entry = tally.get(row.promo_code_id) ?? { count: 0, total: 0 };
      entry.count += 1;
      entry.total += row.discount_minor ?? 0;
      tally.set(row.promo_code_id, entry);
    }

    return ((codes ?? []) as unknown[]).map((row) => {
      const code = mapPromo(row);
      const usage = tally.get(code.id) ?? { count: 0, total: 0 };
      return { code, redemptions: usage.count, discountedMinor: usage.total };
    });
  },

  /**
   * Create a code.
   *
   * The Stripe coupon is made first. If that fails the code is still stored,
   * switched off, with a warning handed back: a code that exists but cannot
   * discount anything is better than a silent half-creation, and the admin can
   * delete it and try again. Checkout refuses any code with no coupon, so
   * there is no path where this charges somebody full price after telling them
   * a discount applied.
   */
  async create(input: CreatePromoInput, createdBy?: string): Promise<CreateResult> {
    if (!isSupabaseEnabled()) return { ok: false, error: 'The database is not connected.' };

    const code = normaliseCode(input.code);
    if (!code) return { ok: false, error: 'Give the code some letters.' };
    if (!/^[A-Z0-9-]+$/.test(code)) {
      return { ok: false, error: 'Use letters, numbers and dashes only - people have to type this.' };
    }

    if (input.kind === 'percent' && !(input.percentOff && input.percentOff >= 1 && input.percentOff <= 100)) {
      return { ok: false, error: 'A percentage discount needs a figure between 1 and 100.' };
    }
    if (input.kind === 'fixed' && !(input.amountOffMinor && input.amountOffMinor > 0)) {
      return { ok: false, error: 'A fixed discount needs an amount.' };
    }

    let couponId: string | null = null;
    let warning: string | undefined;
    try {
      couponId = await createStripeCoupon(input, code);
      if (!couponId) {
        warning =
          'Stripe is not configured, so the code is saved but switched off. ' +
          'Add the Stripe keys and create it again.';
      }
    } catch (error) {
      warning =
        'The code is saved but switched off: Stripe would not create the coupon ' +
        `(${error instanceof Error ? error.message : 'unknown error'}).`;
    }

    const { error } = await getAdminScopedClient()
      .from('promo_codes')
      .insert({
        code,
        description: input.description.trim(),
        kind: input.kind,
        percent_off: input.kind === 'percent' ? input.percentOff : null,
        amount_off_minor: input.kind === 'fixed' ? input.amountOffMinor : null,
        currency: input.kind === 'fixed' ? (input.currency ?? 'GBP') : null,
        starts_at: input.startsAt ?? null,
        expires_at: input.expiresAt ?? null,
        max_redemptions: input.maxRedemptions ?? null,
        max_per_customer: input.maxPerCustomer ?? null,
        min_order_minor: input.minOrderMinor ?? null,
        first_order_only: input.firstOrderOnly,
        // Off when there is no coupon behind it, so it cannot be typed in
        // before it would work.
        active: Boolean(couponId),
        stripe_coupon_id: couponId,
        created_by: createdBy ?? null,
      });

    if (error) {
      return {
        ok: false,
        error:
          error.code === '23505'
            ? `${code} already exists.`
            : `Could not save the code: ${error.message}`,
      };
    }

    return { ok: true, ...(warning ? { warning } : {}) };
  },

  async setActive(id: string, active: boolean): Promise<void> {
    if (!isSupabaseEnabled()) return;
    await getAdminScopedClient()
      .from('promo_codes')
      .update({ active, updated_at: new Date().toISOString() })
      .eq('id', id);
  },

  /**
   * Delete a code, but only one nobody has used.
   *
   * A used code cascades its redemptions away with it, and those rows are the
   * record of discounts actually given. Switching it off leaves the history
   * intact and has the same effect on anybody trying to type it.
   */
  async remove(id: string): Promise<{ ok: boolean; error?: string }> {
    if (!isSupabaseEnabled()) return { ok: false, error: 'The database is not connected.' };

    const supabase = getAdminScopedClient();
    const { count } = await supabase
      .from('promo_redemptions')
      .select('id', { count: 'exact', head: true })
      .eq('promo_code_id', id);

    if ((count ?? 0) > 0) {
      return {
        ok: false,
        error: 'This code has been used. Switch it off instead - deleting it would erase the record of the discounts it gave.',
      };
    }

    const { error } = await supabase.from('promo_codes').delete().eq('id', id);
    return error ? { ok: false, error: error.message } : { ok: true };
  },

  /** One code, by the text somebody typed. */
  async byCode(raw: string): Promise<PromoCode | null> {
    if (!isSupabaseEnabled()) return null;

    const code = normaliseCode(raw);
    if (!code) return null;

    const { data } = await getAdminScopedClient()
      .from('promo_codes')
      .select(COLUMNS)
      .eq('code', code)
      .maybeSingle();

    return data ? mapPromo(data) : null;
  },

  /**
   * The verdict on a code for this buyer and this basket.
   *
   * The counts are read here and the decision is made by `validatePromo`,
   * which is pure and tested. Keeping the two apart is what stops a rule
   * being enforced slightly differently by the field that previews the
   * discount and the checkout that applies it - they call this.
   */
  async validate(
    raw: string,
    userId: string,
    subtotalMinor: number,
    currency: string,
  ): Promise<{ verdict: PromoVerdict; code: PromoCode | null }> {
    const code = await this.byCode(raw);
    if (!code) return { verdict: { ok: false, reason: 'That code is not valid.' }, code: null };

    const supabase = getAdminScopedClient();

    const [{ count: total }, { count: mine }, { count: paidOrders }] = await Promise.all([
      supabase
        .from('promo_redemptions')
        .select('id', { count: 'exact', head: true })
        .eq('promo_code_id', code.id),
      supabase
        .from('promo_redemptions')
        .select('id', { count: 'exact', head: true })
        .eq('promo_code_id', code.id)
        .eq('user_id', userId),
      supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('payment_status', 'paid'),
    ]);

    const context: PromoContext = {
      subtotalMinor,
      currency,
      now: new Date(),
      totalRedemptions: total ?? 0,
      customerRedemptions: mine ?? 0,
      customerHasPaidOrder: (paidOrders ?? 0) > 0,
    };

    return { verdict: validatePromo(code, context), code };
  },

  /**
   * Record that a code was actually used.
   *
   * Called when a payment succeeds, never when checkout opens. A code limited
   * to fifty must not be exhausted by fifty people who opened Stripe and
   * closed the tab.
   *
   * `order_id` is unique on the table, so a webhook Stripe delivers twice
   * inserts once. The conflict is swallowed rather than reported: a duplicate
   * delivery is the normal case, not a fault.
   */
  async recordRedemption(input: {
    promoCodeId: string;
    orderId: string;
    userId: string;
    discountMinor: number;
  }): Promise<void> {
    if (!isSupabaseEnabled()) return;

    await getAdminScopedClient()
      .from('promo_redemptions')
      .upsert(
        {
          promo_code_id: input.promoCodeId,
          order_id: input.orderId,
          user_id: input.userId,
          discount_minor: input.discountMinor,
        },
        { onConflict: 'order_id', ignoreDuplicates: true },
      );
  },
};
