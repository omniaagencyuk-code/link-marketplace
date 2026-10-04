'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminSession } from '@/lib/auth/admin-access';
import { promoService, type CreatePromoInput } from '@/lib/services/promo-service';

/**
 * Creating and retiring promo codes.
 *
 * Every figure arrives as a string from a form and is parsed here rather than
 * trusted: a blank box means "no limit" and must become null, never a zero. A
 * code with `max_redemptions = 0` would be a code nobody can ever use, created
 * by somebody who simply left the field empty.
 */

export interface PromoActionResult {
  ok: boolean;
  message?: string;
  error?: string;
  /** Created, but something needs saying - usually that Stripe refused. */
  warning?: string;
}

/** A positive integer, or undefined when the box was left empty. */
function optionalCount(raw: unknown): number | undefined {
  if (typeof raw !== 'string' || raw.trim() === '') return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 1) return undefined;
  return Math.floor(value);
}

/**
 * Pounds in the box, pence in the database.
 *
 * The admin types 50 and means £50. Everything downstream is minor units, and
 * the one place that conversion happens is here - a form that stored 50 would
 * be a 50p discount nobody could explain.
 */
function optionalMoneyMinor(raw: unknown): number | undefined {
  if (typeof raw !== 'string' || raw.trim() === '') return undefined;
  const value = Number(raw.replace(/[£$€,\s]/g, ''));
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return Math.round(value * 100);
}

/** A date from a date input, as the end of that day where it is an expiry. */
function optionalDate(raw: unknown, endOfDay = false): string | undefined {
  if (typeof raw !== 'string' || raw.trim() === '') return undefined;
  const parsed = new Date(endOfDay ? `${raw}T23:59:59.999Z` : `${raw}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

export interface PromoFormValues {
  code: string;
  description: string;
  kind: string;
  percentOff: string;
  amountOff: string;
  currency: string;
  startsAt: string;
  expiresAt: string;
  maxRedemptions: string;
  maxPerCustomer: string;
  minOrder: string;
  firstOrderOnly: boolean;
}

export async function createPromoCodeAction(values: PromoFormValues): Promise<PromoActionResult> {
  const session = await requireAdminSession();

  const kind = values.kind === 'fixed' ? 'fixed' : 'percent';

  const input: CreatePromoInput = {
    code: values.code,
    description: values.description ?? '',
    kind,
    ...(kind === 'percent'
      ? { percentOff: optionalCount(values.percentOff) }
      : {
          amountOffMinor: optionalMoneyMinor(values.amountOff),
          currency: (values.currency || 'GBP').toUpperCase().slice(0, 3),
        }),
    ...(optionalDate(values.startsAt) ? { startsAt: optionalDate(values.startsAt)! } : {}),
    // The end of the chosen day, not the start of it. A code set to expire on
    // the 30th should work all day on the 30th, which is what anybody filling
    // in that box means.
    ...(optionalDate(values.expiresAt, true) ? { expiresAt: optionalDate(values.expiresAt, true)! } : {}),
    ...(optionalCount(values.maxRedemptions) ? { maxRedemptions: optionalCount(values.maxRedemptions)! } : {}),
    ...(optionalCount(values.maxPerCustomer) ? { maxPerCustomer: optionalCount(values.maxPerCustomer)! } : {}),
    ...(optionalMoneyMinor(values.minOrder) ? { minOrderMinor: optionalMoneyMinor(values.minOrder)! } : {}),
    firstOrderOnly: values.firstOrderOnly === true,
  };

  const result = await promoService.create(input, session.email);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath('/admin/promo-codes');
  return {
    ok: true,
    message: `${input.code.toUpperCase()} created.`,
    ...(result.warning ? { warning: result.warning } : {}),
  };
}

export async function setPromoActiveAction(id: string, active: boolean): Promise<PromoActionResult> {
  await requireAdminSession();
  await promoService.setActive(id, active);
  revalidatePath('/admin/promo-codes');
  return { ok: true, message: active ? 'Code switched on.' : 'Code switched off.' };
}

export async function deletePromoCodeAction(id: string): Promise<PromoActionResult> {
  await requireAdminSession();
  const result = await promoService.remove(id);
  revalidatePath('/admin/promo-codes');
  return result.ok ? { ok: true, message: 'Code deleted.' } : { ok: false, error: result.error };
}
