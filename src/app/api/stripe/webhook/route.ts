import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type Stripe from 'stripe';
import { getStripe } from '@/lib/stripe/client';
import { stripeWebhookSecret } from '@/lib/stripe/config';
import {
  claimStripeEvent,
  markOrderPaid,
  releaseStripeEvent,
} from '@/lib/services/checkout-service';

/**
 * Stripe webhook.
 *
 * The only trustworthy confirmation that a payment succeeded. The customer's
 * browser returning to the success page is not: they can close the tab, lose
 * signal, or simply visit that URL themselves. Stripe tells us, signed, and
 * keeps telling us until we acknowledge it.
 *
 * Three rules this endpoint follows:
 *
 * 1. The signature is verified against the raw body before anything is read
 *    from it. An unsigned request is an anonymous stranger claiming a payment
 *    happened, and this route is by necessity public.
 *
 * 2. Handling is idempotent. Stripe guarantees at-least-once delivery, so the
 *    same event arrives twice as a matter of course, not as a fault.
 *
 * 3. A failure we cannot resolve returns a 500 so Stripe retries. Returning
 *    200 to make an error go away would silently lose a paid order.
 */

export const dynamic = 'force-dynamic';

/**
 * What was charged, and how much of it was VAT.
 *
 * Taken from the session rather than recalculated: Stripe applied the rate,
 * knowing the billing address and any VAT number the customer entered, and
 * the order should record the figure that actually left their account.
 */
function amountsFrom(session: Stripe.Checkout.Session) {
  return {
    chargedMinor: session.amount_total ?? null,
    taxMinor: session.total_details?.amount_tax ?? null,
    billingCountry: session.customer_details?.address?.country ?? null,
  };
}

export async function POST(request: NextRequest) {
  const stripe = getStripe();
  const secret = stripeWebhookSecret();

  if (!stripe || !secret) {
    // Nothing is configured, so nothing can be verified. Refuse rather than
    // accepting unverified claims about payments.
    return NextResponse.json({ error: 'Webhooks are not configured.' }, { status: 503 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature.' }, { status: 400 });
  }

  // The raw body, byte for byte. Parsing it first would change the bytes the
  // signature was computed over and every verification would fail.
  const payload = await request.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(payload, signature, secret);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid signature';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // First delivery wins; a repeat is acknowledged and dropped.
  const isFirstDelivery = await claimStripeEvent(event.id, event.type);
  if (!isFirstDelivery) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;

        // A session can complete before the money settles, for payment methods
        // that are not instant. Only a paid session is a paid order.
        if (session.payment_status !== 'paid') break;

        const paymentIntent =
          typeof session.payment_intent === 'string' ? session.payment_intent : null;
        await markOrderPaid(session.id, paymentIntent, amountsFrom(session));
        break;
      }

      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object as Stripe.Checkout.Session;
        const paymentIntent =
          typeof session.payment_intent === 'string' ? session.payment_intent : null;
        await markOrderPaid(session.id, paymentIntent, amountsFrom(session));
        break;
      }

      default:
        // Everything else is acknowledged without action, so Stripe stops
        // retrying events this application has no opinion about.
        break;
    }
  } catch (error) {
    // The claim must be given back, or Stripe's retry would be dismissed as a
    // duplicate and a paid order would never be recorded. Releasing then
    // answering 500 is what makes the retry useful.
    await releaseStripeEvent(event.id);

    const message = error instanceof Error ? error.message : 'Handler failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
