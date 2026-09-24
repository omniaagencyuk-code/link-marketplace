import { isSupabaseEnabled } from '@/lib/supabase/config';
import { getServerClient, getAdminScopedClient } from '@/lib/supabase/server';
import { websiteService } from './website-service';
import { needsTopic, placementPrice } from '@/lib/utils/pricing';
import { mockStore } from './mock-store';
import { mapOrder, type OrderRow } from '@/lib/supabase/mappers';
import type { DraftOrderItem, Order, UserProfile } from '@/lib/types';

/**
 * Turning a basket into an order.
 *
 * The basket lives in the browser, so nothing in it can be trusted: prices
 * especially. Every line is re-priced from the database before an order is
 * written, and the total is the sum of those server-side prices. A basket
 * claiming a £500 placement costs £5 produces a £500 order.
 *
 * The order is written *before* the customer is sent to Stripe, in the
 * 'draft' state and unpaid. That ordering matters: if it were created after
 * payment, a customer who paid and then lost their connection would have been
 * charged with nothing on record to connect the payment to.
 */

const ORDER_SELECT = '*, order_items (*)';

export interface PricedLine {
  websiteId: string;
  websiteDomain: string;
  websiteSlug: string;
  serviceType: DraftOrderItem['serviceType'];
  /** The topic the buyer declared, where the publisher prices them apart. */
  topic?: string;
  /** The price the database holds, not the one the browser sent. */
  priceMinor: number;
  /** The standard rate, recorded so the premium is legible on the order. */
  listPriceMinor: number;
  targetUrl: string;
  anchorText: string;
  preferredLandingPage?: string;
  notes?: string;
}

export interface PricingResult {
  lines: PricedLine[];
  totalMinor: number;
  /** Lines dropped because the listing or service no longer exists. */
  rejected: { websiteDomain: string; reason: string }[];
}

/**
 * Re-price a basket against the database.
 *
 * Also the place where a listing that has been paused, archived or repriced
 * since it went in the basket is caught. Those lines are rejected rather than
 * silently charged at the old price.
 */
export async function priceBasket(items: DraftOrderItem[]): Promise<PricingResult> {
  const lines: PricedLine[] = [];
  const rejected: PricingResult['rejected'] = [];

  const websites = await websiteService.getByIds(items.map((item) => item.websiteId));
  const byId = new Map(websites.map((website) => [website.id, website]));

  for (const item of items) {
    const website = byId.get(item.websiteId);

    if (!website || website.status !== 'active') {
      rejected.push({
        websiteDomain: item.websiteDomain,
        reason: 'This website is no longer available.',
      });
      continue;
    }

    // The topic the browser sent is a declaration, not a price. It selects
    // which stored rate applies; it can never be a number.
    const topic = item.topic?.trim() || undefined;

    // Asked for only where this publisher prices topics apart. A basket saved
    // before that rate existed arrives without an answer, and is stopped here
    // rather than billed at a rate the publisher no longer honours.
    if (needsTopic(website, item.serviceType) && !topic) {
      rejected.push({
        websiteDomain: website.domain,
        reason: 'Tell us what this placement is about - this publisher prices some topics differently.',
      });
      continue;
    }

    const price = placementPrice(website, item.serviceType, topic);
    if (!price) {
      rejected.push({
        websiteDomain: website.domain,
        reason: 'That placement type is no longer offered on this website.',
      });
      continue;
    }

    if (!item.targetUrl.trim()) {
      rejected.push({ websiteDomain: website.domain, reason: 'Needs a target URL.' });
      continue;
    }

    lines.push({
      websiteId: website.id,
      websiteDomain: website.domain,
      websiteSlug: website.slug,
      serviceType: item.serviceType,
      topic,
      priceMinor: price.priceMinor,
      listPriceMinor: price.listPriceMinor,
      targetUrl: item.targetUrl.trim(),
      anchorText: item.anchorText.trim(),
      preferredLandingPage: item.preferredLandingPage?.trim() || undefined,
      notes: item.notes?.trim() || undefined,
    });
  }

  return {
    lines,
    totalMinor: lines.reduce((total, line) => total + line.priceMinor, 0),
    rejected,
  };
}

/** A short human reference. Uniqueness is enforced by the column, not by this. */
function newReference(): string {
  const random = Math.floor(Math.random() * 90_000) + 10_000;
  return `PP-${random}`;
}

const mockOrders = mockStore<Order>('orders');

/**
 * Write the order. Unpaid, in draft, ready to be sent to Stripe.
 */
export async function createPendingOrder(
  user: UserProfile,
  pricing: PricingResult,
  currency: Order['currency'],
): Promise<Order> {
  const now = new Date().toISOString();
  const reference = newReference();

  if (!isSupabaseEnabled()) {
    const order: Order = {
      id: `ord_${Date.now().toString(36)}`,
      reference,
      userId: user.id,
      customerName: user.fullName,
      customerEmail: user.email,
      status: 'draft',
      totalMinor: pricing.totalMinor,
      currency,
      items: pricing.lines.map((line, index) => ({
        id: `itm_${Date.now().toString(36)}_${index}`,
        orderId: reference,
        websiteId: line.websiteId,
        websiteDomain: line.websiteDomain,
        websiteSlug: line.websiteSlug,
        serviceType: line.serviceType,
        topic: line.topic,
        priceMinor: line.priceMinor,
        listPriceMinor: line.listPriceMinor,
        targetUrl: line.targetUrl,
        anchorText: line.anchorText,
        preferredLandingPage: line.preferredLandingPage,
        notes: line.notes,
        status: 'draft',
        createdAt: now,
        updatedAt: now,
      })),
      placedAt: now,
      updatedAt: now,
    };
    mockOrders.set(order.id, order);
    return order;
  }

  // Written as the signed-in customer, so row level security confirms the
  // order is being created for them and not on someone else's behalf.
  const supabase = await getServerClient();

  const { data: orderRow, error: orderError } = await supabase
    .from('orders')
    .insert({
      reference,
      user_id: user.id,
      status: 'draft',
      payment_status: 'unpaid',
      total_minor: pricing.totalMinor,
      currency,
    })
    .select('id')
    .single();

  if (orderError || !orderRow) {
    throw new Error(`Could not create the order: ${orderError?.message ?? 'unknown error'}`);
  }

  const { error: itemsError } = await supabase.from('order_items').insert(
    pricing.lines.map((line) => ({
      order_id: orderRow.id,
      website_id: line.websiteId,
      // Copied in rather than joined: `websites` is readable only while a
      // listing is active, so a join would blank the domain on a customer's
      // own order the day the publisher was archived.
      website_domain: line.websiteDomain,
      website_slug: line.websiteSlug,
      service_type: line.serviceType,
      topic: line.topic ?? null,
      price_minor: line.priceMinor,
      list_price_minor: line.listPriceMinor,
      target_url: line.targetUrl,
      anchor_text: line.anchorText,
      preferred_landing_page: line.preferredLandingPage ?? null,
      notes: line.notes ?? null,
      status: 'draft',
    })),
  );

  if (itemsError) {
    // An order with no lines would be charged for nothing. Remove it rather
    // than leaving a husk that looks like a real order in the dashboard.
    await supabase.from('orders').delete().eq('id', orderRow.id);
    throw new Error(`Could not create the order: ${itemsError.message}`);
  }

  const { data } = await supabase.from('orders').select(ORDER_SELECT).eq('id', orderRow.id).single();
  return mapOrder(data as unknown as OrderRow);
}

/** Record which Stripe session is paying for an order. */
export async function attachCheckoutSession(orderId: string, sessionId: string): Promise<void> {
  if (!isSupabaseEnabled()) {
    const order = mockOrders.get(orderId);
    if (order) mockOrders.set(orderId, { ...order, updatedAt: new Date().toISOString() });
    return;
  }

  const supabase = await getServerClient();
  await supabase
    .from('orders')
    .update({ stripe_checkout_session_id: sessionId, payment_status: 'processing' })
    .eq('id', orderId);
}

/**
 * Mark an order paid, from the webhook.
 *
 * Runs as the service role: a webhook arrives from Stripe with no customer
 * session attached to it, so there is no `auth.uid()` for row level security
 * to work from. The request's authenticity is established by the signature
 * check before this is called.
 */
export interface PaidAmounts {
  /** What Stripe actually took, including VAT. */
  chargedMinor?: number | null;
  /** The VAT within it. Zero on a zero-rated or reverse-charge sale. */
  taxMinor?: number | null;
  /** Where they said they were, which is what decides whether zero is right. */
  billingCountry?: string | null;
}

export async function markOrderPaid(
  sessionId: string,
  paymentIntentId: string | null,
  amounts: PaidAmounts = {},
): Promise<{ orderId: string; alreadyPaid: boolean } | null> {
  if (!isSupabaseEnabled()) return null;

  const supabase = getAdminScopedClient();

  const { data: order } = await supabase
    .from('orders')
    .select('id, payment_status')
    .eq('stripe_checkout_session_id', sessionId)
    .maybeSingle();

  if (!order) return null;
  if (order.payment_status === 'paid') return { orderId: order.id as string, alreadyPaid: true };

  await supabase
    .from('orders')
    .update({
      payment_status: 'paid',
      stripe_payment_intent_id: paymentIntentId,
      paid_at: new Date().toISOString(),
      // Recorded from the session rather than computed. Stripe decided the
      // rate; this is the amount that left the customer's account.
      ...(amounts.chargedMinor == null ? {} : { charged_minor: amounts.chargedMinor }),
      ...(amounts.taxMinor == null ? {} : { tax_minor: amounts.taxMinor }),
      ...(amounts.billingCountry == null ? {} : { billing_country: amounts.billingCountry }),
    })
    .eq('id', order.id);

  // Payment moves the order out of draft and into the queue, and records why.
  await supabase.rpc('set_order_status', {
    p_order_id: order.id,
    p_status: 'awaiting-content',
    p_note: 'Payment received.',
    p_changed_by: null,
  });

  return { orderId: order.id as string, alreadyPaid: false };
}

/**
 * Claim a Stripe event, so that only one delivery of it is acted on.
 *
 * Stripe guarantees at-least-once delivery, so the same event genuinely does
 * arrive twice. Inserting the id and treating a conflict as "already seen"
 * makes the handler idempotent without needing a lock.
 *
 * The claim has to be released if handling then fails - see
 * `releaseStripeEvent`. Without that, a handler that threw would have marked
 * the event as done, and Stripe's retry would be dismissed as a duplicate,
 * losing a payment permanently.
 */
export async function claimStripeEvent(eventId: string, type: string): Promise<boolean> {
  if (!isSupabaseEnabled()) return true;

  const supabase = getAdminScopedClient();
  const { error } = await supabase.from('stripe_events').insert({ id: eventId, type });

  // 23505 is unique_violation: another delivery got here first.
  if (error && error.code === '23505') return false;
  return true;
}

/**
 * Give up a claim so Stripe's retry is processed rather than dismissed.
 *
 * Called only when handling failed. The window between the failure and this
 * running is the one case where a concurrent retry could be dropped; Stripe
 * spaces retries over hours, so in practice it does not arise, and the
 * alternative - never releasing - loses the order outright.
 */
export async function releaseStripeEvent(eventId: string): Promise<void> {
  if (!isSupabaseEnabled()) return;

  const supabase = getAdminScopedClient();
  await supabase.from('stripe_events').delete().eq('id', eventId);
}
