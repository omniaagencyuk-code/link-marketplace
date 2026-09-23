'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { requireCustomerSession } from '@/lib/auth/customer-access';
import { settingsService } from '@/lib/services';
import {
  attachCheckoutSession,
  createPendingOrder,
  priceBasket,
} from '@/lib/services/checkout-service';
import { getStripe } from '@/lib/stripe/client';
import { isStripeEnabled } from '@/lib/stripe/config';
import { linkTypeLabels } from '@/lib/utils/labels';
import { acceptedNicheLabel } from '@/lib/config/accepted-niches';
import { siteUrl } from '@/lib/config/brand';
import type { DraftOrderItem } from '@/lib/types';

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

/** The deployment's own origin, so a preview deploy returns to itself. */
async function currentOrigin(): Promise<string> {
  const store = await headers();
  const host = store.get('x-forwarded-host') ?? store.get('host');
  if (!host) return siteUrl;
  const protocol = store.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${protocol}://${host}`;
}

export async function startCheckoutAction(items: DraftOrderItem[]): Promise<CheckoutResult> {
  const user = await requireCustomerSession('/dashboard/orders');

  if (!Array.isArray(items) || items.length === 0) {
    return { error: 'Your order is empty.' };
  }

  if (!isStripeEnabled()) {
    return { error: 'Payments are not available yet. Please contact us to place this order.' };
  }

  const settings = await settingsService.get();
  const pricing = await priceBasket(items);

  if (pricing.lines.length === 0) {
    return {
      error: 'None of these placements can be ordered right now.',
      rejected: pricing.rejected,
    };
  }

  const stripe = getStripe();
  if (!stripe) return { error: 'Payments are not available yet.' };

  const origin = await currentOrigin();

  // Everything that can fail against a network is inside one try. The redirect
  // below is deliberately outside it: redirect() works by throwing, and
  // catching that would strand the customer on a page that looks broken.
  let checkoutUrl: string;

  try {
    const order = await createPendingOrder(user, pricing, settings.currency);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      // Stripe emails the receipt here, and prefilling saves the customer
      // typing an address we already hold.
      customer_email: user.email,
      client_reference_id: order.id,
      line_items: pricing.lines.map((line) => ({
        quantity: 1,
        price_data: {
          currency: settings.currency.toLowerCase(),
          unit_amount: line.priceMinor,
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
      // The order id travels with the payment so the webhook can find it even
      // if the customer never returns to the success page.
      metadata: { orderId: order.id, reference: order.reference },
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
