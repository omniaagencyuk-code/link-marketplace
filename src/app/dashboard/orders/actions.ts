'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { requireCustomerSession } from '@/lib/auth/customer-access';
import { settingsService } from '@/lib/services';
import {
  attachCheckoutSession,
  completeFreeOrder,
  createPendingOrder,
  openOrderFor,
  priceBasket,
  replaceOrderLines,
  type PricingResult,
} from '@/lib/services/checkout-service';
import { cleanCustomerReference } from '@/lib/orders/customer-reference';
import { sessionIsUnpayable } from '@/lib/orders/checkout-session';
import { promoService } from '@/lib/services/promo-service';
import { orderService } from '@/lib/services/order-service';
import { promoSummary } from '@/lib/promos/rules';
import { getStripe } from '@/lib/stripe/client';
import { isStripeEnabled } from '@/lib/stripe/config';
import { linkTypeLabels } from '@/lib/utils/labels';
import { acceptedNicheLabel } from '@/lib/config/accepted-niches';
import { tierFor } from '@/lib/utils/pricing';
import { siteUrl } from '@/lib/config/brand';
import type Stripe from 'stripe';
import type { DraftOrderItem, Order } from '@/lib/types';

/**
 * Checkout.
 *
 * Stripe's hosted Checkout, not an embedded card form. Card details never
 * touch this application, which keeps it out of PCI scope, and Stripe handles
 * 3-D Secure and the bank prompts that come with it - none of which is worth
 * reimplementing.
 *
 * Nothing the browser sends about price is believed. The basket arrives as a
 * list of websites and placement details; the prices are read from the
 * database and the Stripe line items are built from those.
 */

export interface CheckoutResult {
  error?: string;
  /** Lines removed before checkout, e.g. a listing that was paused. */
  rejected?: { websiteDomain: string; reason: string }[];
}

export interface PromoPreview {
  ok: boolean;
  /** Why not, in words a shopper can act on. */
  error?: string;
  code?: string;
  /** '25% off' or '£50 off', for the line in the basket. */
  summary?: string;
  discountMinor?: number;
  payableMinor?: number;
}

/**
 * Check a code without committing to anything.
 *
 * Prices the basket server-side first, because the discount depends on the
 * subtotal and the subtotal in the browser is a number the browser made up.
 * Nothing is written and no code is spent: a code is only ever counted as used
 * when a payment succeeds.
 */
export async function checkPromoCodeAction(
  items: DraftOrderItem[],
  rawCode: string,
): Promise<PromoPreview> {
  const user = await requireCustomerSession('/dashboard/orders');

  if (!rawCode.trim()) return { ok: false, error: 'Type a code first.' };
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: 'Add something to your order first.' };
  }

  const settings = await settingsService.get();
  const pricing = await priceBasket(items, tierFor(user.plan));
  if (pricing.lines.length === 0) {
    return { ok: false, error: 'None of these placements can be ordered right now.' };
  }

  const { verdict, code } = await promoService.validate(
    rawCode,
    user.id,
    pricing.totalMinor,
    settings.currency,
  );

  if (!verdict.ok) return { ok: false, error: verdict.reason };

  return {
    ok: true,
    code: code!.code,
    summary: promoSummary(code!),
    discountMinor: verdict.discountMinor,
    payableMinor: verdict.payableMinor,
  };
}

/** The deployment's own origin, so a preview deploy returns to itself. */
async function currentOrigin(): Promise<string> {
  const store = await headers();
  const host = store.get('x-forwarded-host') ?? store.get('host');
  if (!host) return siteUrl;
  const protocol = store.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${protocol}://${host}`;
}

/**
 * Make a checkout the customer walked away from unpayable.
 *
 * A Stripe session stays payable for 24 hours. Pointing an order at a new
 * session without closing the old one leaves a tab that can still be paid
 * into an order whose `stripe_checkout_session_id` has moved on - and the
 * webhook finds orders by that id, so the money would arrive with nothing
 * to attach it to. Expiring first is what makes reusing the row safe.
 *
 * False means "do not reuse", and the caller writes a new order instead,
 * which is what happened before any of this existed. Two cases reach it:
 *
 *   * The call failed. An order with a live session is left alone.
 *   * Stripe says the session is already **complete** - the customer paid
 *     and the webhook has not landed yet. That order is somebody's
 *     purchase a second before we find out, and rewriting its lines would
 *     change what they just bought.
 *
 * An already-expired session is the one error that means yes: there is
 * nothing left to make unpayable.
 */
async function expirePreviousSession(stripe: Stripe, sessionId: string): Promise<boolean> {
  try {
    await stripe.checkout.sessions.expire(sessionId);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (sessionIsUnpayable(message)) return true;
    console.error('Could not expire the previous checkout session', error);
    return false;
  }
}

/**
 * One open order per customer, rewritten, rather than a row per attempt.
 *
 * Returns null when there is nothing to reuse or reusing would not be safe,
 * and the caller creates an order exactly as it always did.
 */
async function reuseOpenOrder(
  stripe: Stripe | null,
  userId: string,
  pricing: PricingResult,
  promo?: { codeId: string; code: string; discountMinor: number },
  customerReference?: string,
): Promise<Order | null> {
  const open = await openOrderFor(userId);
  if (!open) return null;

  if (open.sessionId) {
    // No client, no way to close the old checkout, so no reuse. Writing a
    // new order is always safe; this is only ever an optimisation.
    if (!stripe) return null;
    if (!(await expirePreviousSession(stripe, open.sessionId))) return null;
  }

  return replaceOrderLines(open.id, pricing, promo, customerReference);
}

export async function startCheckoutAction(
  items: DraftOrderItem[],
  rawPromoCode?: string,
  /**
   * The customer's own label for this order.
   *
   * Cleaned in `cleanCustomerReference` rather than here, so the two places
   * an order can be labelled - checkout and the order page afterwards -
   * cannot come to disagree about what a label may contain.
   */
  rawCustomerReference?: string,
): Promise<CheckoutResult> {
  const user = await requireCustomerSession('/dashboard/orders');

  if (!Array.isArray(items) || items.length === 0) {
    return { error: 'Your order is empty.' };
  }

  if (!isStripeEnabled()) {
    return { error: 'Payments are not available yet. Please contact us to place this order.' };
  }

  const settings = await settingsService.get();
  // The buyer's own tier, read from their profile on the server. A basket
  // that asked for the agency rate would be a basket that could claim it.
  const pricing = await priceBasket(items, tierFor(user.plan));

  if (pricing.lines.length === 0) {
    return {
      error: 'None of these placements can be ordered right now.',
      rejected: pricing.rejected,
    };
  }

  /*
    The code is re-validated here, against the prices just re-read.

    Never trusted from the preview: the field that showed "£50 off" ran a
    minute ago, against a basket that may since have lost a line, and the code
    itself may have been switched off or used up by somebody else in between.
    A refusal stops checkout rather than quietly charging full price, because
    the buyer has been shown a discounted figure and is expecting it.
  */
  let promo: { codeId: string; code: string; couponId: string; discountMinor: number; payableMinor: number } | undefined;

  if (rawPromoCode?.trim()) {
    const { verdict, code } = await promoService.validate(
      rawPromoCode,
      user.id,
      pricing.totalMinor,
      settings.currency,
    );

    if (!verdict.ok) return { error: verdict.reason, rejected: pricing.rejected };

    promo = {
      codeId: code!.id,
      code: code!.code,
      couponId: code!.stripeCouponId!,
      discountMinor: verdict.discountMinor,
      payableMinor: verdict.payableMinor,
    };
  }

  /*
    A code that covers the whole order never reaches Stripe.

    A Checkout session for a zero total is rejected, so sending one would turn
    a working 100% code into an error page. The order is settled directly
    instead and the customer goes straight to the confirmation they would have
    come back to anyway.
  */
  if (promo && promo.payableMinor === 0) {
    const applied = { codeId: promo.codeId, code: promo.code, discountMinor: promo.discountMinor };
    const order =
      (await reuseOpenOrder(getStripe(), user.id, pricing, applied, rawCustomerReference)) ??
      (await createPendingOrder(user, pricing, settings.currency, applied, rawCustomerReference));

    const settled = await completeFreeOrder({
      orderId: order.id,
      userId: user.id,
      promoCodeId: promo.codeId,
      discountMinor: promo.discountMinor,
    });

    if (!settled.ok) return { error: settled.error ?? 'Could not place that order.' };

    redirect(`/dashboard/orders/confirmed?order=${order.reference}`);
  }

  const stripe = getStripe();
  if (!stripe) return { error: 'Payments are not available yet.' };

  const origin = await currentOrigin();

  // Everything that can fail against a network is inside one try. The redirect
  // below is deliberately outside it: redirect() works by throwing, and
  // catching that would strand the customer on a page that looks broken.
  let checkoutUrl: string;

  try {
    const applied = promo
      ? { codeId: promo.codeId, code: promo.code, discountMinor: promo.discountMinor }
      : undefined;

    /*
      The customer's own open order where there is one, rewritten with this
      basket, rather than a fourth row for a fourth attempt at the same
      purchase. Falls back to a new order whenever reuse would not be safe -
      see `reuseOpenOrder`.
    */
    const order =
      (await reuseOpenOrder(stripe, user.id, pricing, applied, rawCustomerReference)) ??
      (await createPendingOrder(user, pricing, settings.currency, applied, rawCustomerReference));

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      // Stripe emails the receipt here, and prefilling saves the customer
      // typing an address we already hold.
      customer_email: user.email,
      client_reference_id: order.id,
      // Stripe works out the VAT. It knows the billing address it just
      // collected and whether a valid VAT number made the sale a reverse
      // charge; a rate calculated in this codebase would only ever be a way
      // to disagree with the amount actually taken.
      automatic_tax: { enabled: true },
      // Required for that: there is no VAT rate without knowing where the
      // customer is.
      billing_address_collection: 'required',
      // A business customer can give their VAT number, which is what makes an
      // overseas B2B sale zero-rated instead of charged at 20%.
      tax_id_collection: { enabled: true },
      line_items: pricing.lines.map((line) => ({
        quantity: 1,
        price_data: {
          currency: settings.currency.toLowerCase(),
          unit_amount: line.priceMinor,
          // Our prices are net: VAT goes on top rather than being carved out
          // of the figure the publisher and the customer both saw.
          tax_behavior: 'exclusive' as const,
          product_data: {
            name: `${linkTypeLabels[line.serviceType]} - ${line.websiteDomain}`,
            // Where a premium applied, the Stripe page and the receipt say
            // which topic produced the higher figure. A customer comparing
            // the receipt with the listing should not have to work that out.
            description: [
              line.priceMinor !== line.listPriceMinor
                ? `${acceptedNicheLabel(line.topic ?? '')} rate`
                : null,
              `Target: ${line.targetUrl}`,
            ]
              .filter(Boolean)
              .join(' - ')
              .slice(0, 500),
          },
        },
      })),
      /*
        Stripe does the discount arithmetic, not this codebase.

        Handing over the coupon rather than discounted line items means Stripe
        spreads a percentage across the lines, applies VAT to the discounted
        figure, shows the buyer a discount row on its own page and reports back
        what it actually took off. Subtracting it here would only ever be a way
        to disagree with the amount charged.
      */
      ...(promo ? { discounts: [{ coupon: promo.couponId }] } : {}),
      // The order id travels with the payment so the webhook can find it even
      // if the customer never returns to the success page.
      metadata: {
        orderId: order.id,
        reference: order.reference,
        ...(promo ? { promoCode: promo.code } : {}),
      },
      success_url: `${origin}/dashboard/orders/confirmed?order=${order.reference}`,
      cancel_url: `${origin}/dashboard/orders?checkout=cancelled`,
    });

    if (!session.url) return { error: 'Could not open checkout. Please try again.' };

    await attachCheckoutSession(order.id, session.id);
    checkoutUrl = session.url;
  } catch (error) {
    // The customer has not been charged - nothing got as far as a payment - so
    // the honest message is that checkout could not be opened. The order row,
    // if one was written, stays unpaid and is simply never used.
    console.error('Checkout could not be started', error);
    return {
      error: 'We could not open checkout just now. Nothing has been charged - please try again.',
    };
  }

  redirect(checkoutUrl);
}

/**
 * Change the label on an order after it was placed.
 *
 * Somebody will forget to set it, and an order they cannot find is the whole
 * problem this solves - so it has to be fixable. Nothing else about a placed
 * order is editable by the customer, which is why this is its own narrow
 * action rather than a general update: it writes one column and it writes it
 * only on an order the signed-in account owns.
 *
 * Our own `reference` is untouched and untouchable. That one is what support
 * quotes and what Stripe carries; an identity the customer could rewrite is
 * not an identity.
 */
export async function setCustomerReferenceAction(
  orderId: string,
  rawReference: string,
): Promise<{ reference?: string; error?: string }> {
  const user = await requireCustomerSession('/dashboard/orders');

  const order = await orderService.getById(String(orderId));
  /*
    The same answer for "no such order" and "not yours", because telling a
    stranger which order ids exist is telling them how many orders we have
    taken.
  */
  if (!order || order.userId !== user.id) {
    return { error: 'That order could not be found.' };
  }

  const reference = cleanCustomerReference(rawReference);

  try {
    const saved = await orderService.setCustomerReference(order.id, user.id, reference);
    if (!saved) return { error: 'That did not save. Try again.' };
    revalidatePath('/dashboard/orders');
    revalidatePath(`/dashboard/orders/${order.id}`);
    return { reference: reference ?? '' };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'That did not save.' };
  }
}
