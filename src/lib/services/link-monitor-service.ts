import { getAdminScopedClient } from '@/lib/supabase/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { checkLink } from '@/lib/monitoring/check';
import { monitorStore } from '@/lib/monitoring/store';
import { nextCheckAt, nextState } from '@/lib/monitoring/status';
import type { ClaimStatus, GuaranteeClaim, LinkWithClaim, MonitoredLink } from '@/lib/monitoring/types';
import { emailService } from './email-service';
import { settingsService } from './settings-service';
import {
  buyerClaimChoice,
  buyerLinkLost,
  buyerLinkRestored,
  publisherLinkProblem,
  type BrandBits,
} from '@/lib/email/templates';
import { siteUrl } from '@/lib/config/brand';

/**
 * The twelve month guarantee, and the score that comes out of it.
 *
 * Two features, one fact: did this link stay up. The checker writes that fact
 * weekly, claims are opened from it, and the public durability figure on a
 * listing is computed from the same rows - so a number a buyer reads on a
 * card is the same number a publisher is judged by, and neither can drift
 * from the other.
 *
 * Everything here runs on the service-role client, so every customer-facing
 * function proves ownership itself before it writes. A claim id is a uuid
 * that appears in a page, and knowing one must never be enough to spend
 * somebody else's guarantee.
 */

/** Twelve months, which is what the marketing says. */
const GUARANTEE_MONTHS = 12;

/**
 * How long a publisher gets before it becomes the buyer's choice.
 *
 * Fourteen days. Long enough for somebody who only reads their email on
 * Mondays and is halfway through a site migration; short enough that a buyer
 * is not left waiting a month to find out they can have their money back.
 */
const PUBLISHER_GRACE_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

function addMonths(from: Date, months: number): Date {
  const date = new Date(from.getTime());
  date.setUTCMonth(date.getUTCMonth() + months);
  return date;
}

async function brandBits(): Promise<BrandBits> {
  const settings = await settingsService.get();
  return { brandName: settings.brandName, supportEmail: settings.supportEmail, siteUrl };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export interface RegisterResult {
  registered: boolean;
  /** Why not, where it did not. Safe to log; never shown to a customer. */
  reason?: string;
}

/**
 * Start watching a placement.
 *
 * Called from the delivery service the moment an item has a live URL, and
 * again when the customer or the clock approves it - which is why it has to
 * be idempotent, and is: `order_item_id` is unique on the table and a second
 * call is ignored rather than merged. The first registration's
 * `published_at` is the one that counts, because both the guarantee window
 * and the durability window are measured from it and a redelivery must not
 * quietly restart either clock.
 *
 * It never throws. Registering a link is a side effect of delivering one, and
 * a monitor that cannot write must not roll back a delivery the customer has
 * already been emailed about.
 */
export async function registerPlacedLink(orderItemId: string): Promise<RegisterResult> {
  if (!isSupabaseEnabled()) return { registered: false, reason: 'No database' };

  try {
    const { data } = await getAdminScopedClient()
      .from('order_items')
      .select(
        'id, order_id, website_id, live_url, target_url, delivered_at, approved_at, ' +
          'orders!inner (id, user_id), websites (link_attribute)',
      )
      .eq('id', orderItemId)
      .maybeSingle();

    if (!data) return { registered: false, reason: 'No such item' };

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const row = data as any;
    const order = Array.isArray(row.orders) ? row.orders[0] : row.orders;
    const website = Array.isArray(row.websites) ? row.websites[0] : row.websites;
    /* eslint-enable @typescript-eslint/no-explicit-any */

    const placedUrl: string = (row.live_url ?? '').trim();
    // Nothing to check. An item with no live URL has not been placed yet, and
    // a row watching an empty string would fail every check forever.
    if (!placedUrl) return { registered: false, reason: 'No live URL yet' };
    if (!order?.user_id) return { registered: false, reason: 'No buyer on the order' };

    const publishedAt = new Date(row.delivered_at ?? row.approved_at ?? Date.now());

    const result = await monitorStore.insertLink({
      orderItemId: row.id,
      orderId: row.order_id,
      websiteId: row.website_id,
      buyerId: order.user_id,
      placedUrl,
      targetUrl: row.target_url ?? '',
      /*
        What the listing promised, not what we would like.

        A site that sells nofollow links is not in breach for serving one, and
        checking every placement against a dofollow expectation would raise
        claims against publishers who did exactly what they advertised.
      */
      expectsDofollow: (website?.link_attribute ?? 'dofollow') === 'dofollow',
      publishedAt: publishedAt.toISOString(),
      guaranteeEndsAt: addMonths(publishedAt, GUARANTEE_MONTHS).toISOString(),
    });

    if (result.error) return { registered: false, reason: result.error };
    return { registered: result.created, ...(result.created ? {} : { reason: 'Already watched' }) };
  } catch (error) {
    // Logged rather than thrown: see the note above about not rolling back a
    // delivery because the monitor had a bad minute.
    console.error('[link-monitor] could not register a placement:', String(error).slice(0, 200));
    return { registered: false, reason: 'Could not register' };
  }
}

// ---------------------------------------------------------------------------
// Checking
// ---------------------------------------------------------------------------

export interface CheckRunResult {
  checked: number;
  ok: number;
  hard: number;
  soft: number;
  lost: number;
  restored: number;
  claimsOpened: number;
  /** True when the time budget stopped the run before the batch was done. */
  outOfTime: boolean;
  ms: number;
}

/**
 * Run several at a time, stopping when the clock says so.
 *
 * Eight at once rather than all of them: these are other people's servers,
 * and two hundred simultaneous requests from one monitor is indistinguishable
 * from an attack. The deadline is checked before starting each link rather
 * than during one, so a run ends between links and every link it did start is
 * written down.
 */
async function forEachLimited<T>(
  items: T[],
  limit: number,
  deadline: number,
  work: (item: T) => Promise<void>,
): Promise<{ done: number; outOfTime: boolean }> {
  let index = 0;
  let done = 0;
  let outOfTime = false;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      if (Date.now() >= deadline) {
        outOfTime = true;
        return;
      }
      const mine = index;
      index += 1;
      if (mine >= items.length) return;

      await work(items[mine]!);
      done += 1;
    }
  });

  await Promise.all(workers);
  return { done, outOfTime };
}

export interface CheckRunOptions {
  limit?: number;
  concurrency?: number;
  budgetMs?: number;
}

/**
 * One pass over the links that are due.
 *
 * Bounded three ways - how many links, how many at once, how long - because
 * this runs on a serverless function with a hard ceiling and a run that is
 * killed halfway has written some rows and not others. Finishing early and
 * picking the rest up fifteen minutes later costs nothing; being killed costs
 * the ability to reason about what happened.
 */
export async function runDueChecks(options: CheckRunOptions = {}): Promise<CheckRunResult> {
  const started = Date.now();
  const limit = options.limit ?? 200;
  const concurrency = options.concurrency ?? 8;
  const deadline = started + (options.budgetMs ?? 240_000);

  const result: CheckRunResult = {
    checked: 0,
    ok: 0,
    hard: 0,
    soft: 0,
    lost: 0,
    restored: 0,
    claimsOpened: 0,
    outOfTime: false,
    ms: 0,
  };

  if (!isSupabaseEnabled()) {
    result.ms = Date.now() - started;
    return result;
  }

  const due = await monitorStore.dueLinks(limit);
  if (due.length === 0) {
    result.ms = Date.now() - started;
    return result;
  }

  const brand = await brandBits();

  const run = await forEachLimited(due, concurrency, deadline, async (link) => {
    const { verdict, page } = await checkLink({
      placedUrl: link.placedUrl,
      targetUrl: link.targetUrl,
      expectsDofollow: link.expectsDofollow,
    });

    const next = nextState(
      {
        status: link.status,
        hardFailures: link.hardFailures,
        softFailures: link.softFailures,
        lostAt: link.lostAt ?? null,
        guaranteeEndsAt: link.guaranteeEndsAt,
      },
      verdict.kind,
    );

    await monitorStore.recordCheck(link, next, {
      reason: verdict.reason,
      ...(page ? { httpStatus: page.status, finalUrl: page.finalUrl } : {}),
      nextCheckAt: nextCheckAt(verdict.kind, link.guaranteeEndsAt),
    });

    if (verdict.kind === 'ok') result.ok += 1;
    else if (verdict.kind === 'hard') result.hard += 1;
    else result.soft += 1;

    if (next.becameLost) {
      result.lost += 1;
      const claim = await openClaimFor(link, verdict.reason, brand);
      if (claim) result.claimsOpened += 1;
    }

    if (next.becameLive) {
      result.restored += 1;
      await announceRestoration(link, brand);
    }
  });

  result.checked = run.done;
  result.outOfTime = run.outOfTime;
  result.ms = Date.now() - started;
  return result;
}

// ---------------------------------------------------------------------------
// Claims
// ---------------------------------------------------------------------------

/** What an email about a claim needs, read in one query after the fact. */
interface ClaimContext {
  domain: string;
  orderReference: string;
  buyerEmail: string;
  pricePaidMinor: number;
  currency: string;
  publisherEmail: string;
}

async function claimContext(link: MonitoredLink): Promise<ClaimContext> {
  const supabase = getAdminScopedClient();

  const [{ data: item }, { data: contact }] = await Promise.all([
    supabase
      .from('order_items')
      .select('website_domain, price_minor, orders!inner (reference, customer_email, currency)')
      .eq('id', link.orderItemId)
      .maybeSingle(),
    // Admin-only table, which is the only reason this runs on the service
    // role. A publisher is a contact row, not an account.
    supabase.from('website_contacts').select('email').eq('website_id', link.websiteId).maybeSingle(),
  ]);

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const row = item as any;
  const order = Array.isArray(row?.orders) ? row.orders[0] : row?.orders;
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return {
    domain: (row?.website_domain as string) ?? '',
    orderReference: (order?.reference as string) ?? '',
    buyerEmail: (order?.customer_email as string) ?? '',
    pricePaidMinor: (row?.price_minor as number) ?? 0,
    currency: (order?.currency as string) ?? 'GBP',
    publisherEmail: ((contact as { email: string | null } | null)?.email ?? '').trim(),
  };
}

/**
 * A link has gone. Open the claim and tell both sides.
 *
 * The claim is written before either email, and the emails only go out if it
 * was written: the partial unique index means a second run that reaches the
 * same link gets nothing back and sends nothing, rather than mailing the same
 * publisher about the same article twice.
 *
 * The price is copied onto the claim here, at the moment it opens. An item's
 * price can be edited afterwards and a refund has to be for what was actually
 * charged.
 */
async function openClaimFor(
  link: MonitoredLink,
  reason: string,
  brand: BrandBits,
): Promise<GuaranteeClaim | null> {
  const context = await claimContext(link);
  const deadline = new Date(Date.now() + PUBLISHER_GRACE_DAYS * DAY_MS).toISOString();

  const claim = await monitorStore.openClaim({
    linkId: link.id,
    orderId: link.orderId,
    orderItemId: link.orderItemId,
    buyerId: link.buyerId,
    websiteId: link.websiteId,
    reason,
    publisherDeadline: deadline,
    amountMinor: context.pricePaidMinor,
    currency: context.currency,
  });

  if (!claim) return null;

  if (context.publisherEmail) {
    await emailService.send({
      ...publisherLinkProblem(
        {
          domain: context.domain,
          placedUrl: link.placedUrl,
          targetUrl: link.targetUrl,
          reason,
          deadline,
        },
        brand,
      ),
      to: context.publisherEmail,
      template: 'publisher-link-problem',
      orderId: link.orderId,
      orderItemId: link.orderItemId,
      // One notice per claim, whatever runs the job.
      idempotencyKey: `claim-publisher:${claim.id}`,
    });
  }

  if (context.buyerEmail) {
    await emailService.send({
      ...buyerLinkLost(
        {
          domain: context.domain,
          placedUrl: link.placedUrl,
          reason,
          orderReference: context.orderReference,
          orderId: link.orderId,
          deadline,
        },
        brand,
      ),
      to: context.buyerEmail,
      template: 'buyer-link-lost',
      orderId: link.orderId,
      orderItemId: link.orderItemId,
      idempotencyKey: `claim-buyer:${claim.id}`,
    });
  }

  return claim;
}

/** The publisher put it back. Close the claim and say so. */
async function announceRestoration(link: MonitoredLink, brand: BrandBits): Promise<void> {
  const claim = await monitorStore.restoreOpenClaim(link.id);
  // No open claim means nobody was ever told it was gone, so there is nothing
  // to take back. A link that recovered before its second hard failure never
  // reached `lost` at all.
  if (!claim) return;

  const context = await claimContext(link);
  if (!context.buyerEmail) return;

  await emailService.send({
    ...buyerLinkRestored(
      {
        domain: context.domain,
        placedUrl: link.placedUrl,
        orderReference: context.orderReference,
        orderId: link.orderId,
      },
      brand,
    ),
    to: context.buyerEmail,
    template: 'buyer-link-restored',
    orderId: link.orderId,
    orderItemId: link.orderItemId,
    idempotencyKey: `claim-restored:${claim.id}`,
  });
}

// ---------------------------------------------------------------------------
// Maintenance
// ---------------------------------------------------------------------------

export interface MaintenanceResult {
  handedToBuyer: number;
  scored: number;
  error?: string;
}

/**
 * The daily tidy-up.
 *
 * Two jobs that both want to run once a day and after the night's checks: move
 * claims the publisher has run out of time on into the buyer's hands, and
 * rebuild the durability scores. The scores run second because a claim that
 * moved tonight does not change whether a link was lost - but a link that was
 * lost tonight does, and the checker has just finished.
 */
export async function runMaintenance(): Promise<MaintenanceResult> {
  const result: MaintenanceResult = { handedToBuyer: 0, scored: 0 };
  if (!isSupabaseEnabled()) return result;

  const brand = await brandBits();

  for (const claim of await monitorStore.claimsPastDeadline()) {
    const link = await monitorStore.linkById(claim.linkId);
    /*
      Never past a link that came back.

      The checker clears `lost` on a good check and restores the claim with
      it, but a claim whose deadline passed in the same window as a
      restoration could still be read here. Asking the link rather than
      trusting the claim's status means a buyer is never asked to choose
      between a refund and a replacement for a link that is live.
    */
    if (!link || link.status !== 'lost') continue;

    await monitorStore.setClaimStatus(claim.id, 'awaiting_buyer_choice');
    result.handedToBuyer += 1;

    const context = await claimContext(link);
    if (!context.buyerEmail) continue;

    await emailService.send({
      ...buyerClaimChoice(
        {
          domain: context.domain,
          orderReference: context.orderReference,
          orderId: claim.orderId,
        },
        brand,
      ),
      to: context.buyerEmail,
      template: 'buyer-claim-choice',
      orderId: claim.orderId,
      orderItemId: claim.orderItemId,
      idempotencyKey: `claim-choice:${claim.id}`,
    });
  }

  try {
    result.scored = await monitorStore.recomputeDurability();
  } catch (error) {
    result.error = String(error).slice(0, 200);
  }

  return result;
}

// ---------------------------------------------------------------------------
// What a buyer sees, and what they may do about it
// ---------------------------------------------------------------------------

/**
 * The watched links on one order, with any claim against them.
 *
 * Takes the user id and checks the order is theirs. The order page has
 * already done that, but this reads on the service role and a function that
 * trusts its caller to have checked is a function that will one day be
 * called from somewhere that did not.
 */
export async function orderLinks(orderId: string, userId: string): Promise<LinkWithClaim[]> {
  if (!isSupabaseEnabled()) return [];

  const { data: order } = await getAdminScopedClient()
    .from('orders')
    .select('id, user_id')
    .eq('id', orderId)
    .maybeSingle();

  if (!order || (order as { user_id: string }).user_id !== userId) return [];

  const [links, claims] = await Promise.all([
    monitorStore.linksForOrder(orderId),
    monitorStore.claimsForOrder(orderId),
  ]);

  const domains = await domainsByItem(links.map((link) => link.orderItemId));

  return links.map((link) => {
    // Newest first out of the store, so the first match is the current one. A
    // link lost twice a year apart has two claims and only one of them is
    // what the buyer is being asked about.
    const claim = claims.find((entry) => entry.linkId === link.id);
    return {
      link,
      domain: domains.get(link.orderItemId) ?? '',
      ...(claim ? { claim } : {}),
    };
  });
}

async function domainsByItem(itemIds: string[]): Promise<Map<string, string>> {
  if (itemIds.length === 0) return new Map();

  const { data } = await getAdminScopedClient()
    .from('order_items')
    .select('id, website_domain')
    .in('id', itemIds);

  return new Map(
    ((data ?? []) as { id: string; website_domain: string | null }[]).map((row) => [
      row.id,
      row.website_domain ?? '',
    ]),
  );
}

export interface ChoiceResult {
  ok: boolean;
  error?: string;
}

/**
 * The buyer's claim, but only if it really is theirs and still open.
 *
 * Returns null for "no such claim", "not yours" and "not open" alike. The
 * caller must not tell them apart: a different message for a claim that
 * exists turns this into a way of discovering other people's orders.
 */
async function ownedOpenClaim(claimId: string, userId: string): Promise<GuaranteeClaim | null> {
  const claim = await monitorStore.claimById(claimId);
  if (!claim || claim.buyerId !== userId) return null;
  if (claim.status !== 'awaiting_buyer_choice') return null;
  return claim;
}

/**
 * They want the link replaced.
 *
 * A new order at no cost, carrying the same target URL and anchor, which the
 * team then places somewhere else. Written as a real order rather than a note
 * on the claim because a replacement is a placement: it needs delivering,
 * approving and - when it goes live - monitoring, and every one of those is
 * machinery that already exists and works on orders.
 */
export async function requestReplacement(claimId: string, userId: string): Promise<ChoiceResult> {
  if (!isSupabaseEnabled()) return { ok: false, error: 'The database is not connected.' };

  const claim = await ownedOpenClaim(claimId, userId);
  if (!claim) return { ok: false, error: 'That claim is not open for a choice.' };

  const supabase = getAdminScopedClient();

  const { data: original } = await supabase
    .from('order_items')
    .select(
      'website_id, website_domain, website_slug, service_type, topic, target_url, anchor_text, ' +
        'preferred_landing_page, orders!inner (reference, currency)',
    )
    .eq('id', claim.orderItemId)
    .maybeSingle();

  if (!original) return { ok: false, error: 'Could not find the original placement.' };

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const item = original as any;
  const parent = Array.isArray(item.orders) ? item.orders[0] : item.orders;
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const reference = `PP-R${Math.floor(Math.random() * 90_000) + 10_000}`;

  const { data: orderRow, error: orderError } = await supabase
    .from('orders')
    .insert({
      reference,
      user_id: userId,
      // Nothing to collect, so it starts where a paid order starts rather
      // than in draft - a draft would sit in the checkout flow waiting for a
      // payment that is never coming.
      status: 'awaiting-content',
      payment_status: 'paid',
      total_minor: 0,
      currency: claim.currency || parent?.currency || 'GBP',
      paid_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (orderError || !orderRow) {
    return { ok: false, error: `Could not create the replacement: ${orderError?.message ?? 'unknown'}` };
  }

  const { error: itemError } = await supabase.from('order_items').insert({
    order_id: (orderRow as { id: string }).id,
    // The same listing to begin with. The team moves it to another site when
    // they place it; recording the original is what makes the replacement
    // traceable back to what it replaces.
    website_id: item.website_id,
    website_domain: item.website_domain,
    website_slug: item.website_slug,
    service_type: item.service_type,
    topic: item.topic ?? null,
    price_minor: 0,
    list_price_minor: 0,
    target_url: item.target_url,
    anchor_text: item.anchor_text ?? '',
    preferred_landing_page: item.preferred_landing_page ?? null,
    notes: `Replacement under the link guarantee for order ${parent?.reference ?? ''}.`,
    status: 'awaiting-content',
  });

  if (itemError) {
    // An order with no line would show in their dashboard as a replacement
    // that is never coming.
    await supabase.from('orders').delete().eq('id', (orderRow as { id: string }).id);
    return { ok: false, error: `Could not create the replacement: ${itemError.message}` };
  }

  await monitorStore.setClaimStatus(claim.id, 'replacement_requested');
  return { ok: true };
}

/**
 * They want their money back.
 *
 * Recorded, not paid. The refund itself is a person in the Stripe dashboard,
 * because this application does not hold a balance and a refund it issued
 * automatically would be a payout with no second pair of eyes on it. The
 * claim carries the amount it was opened with, so whoever processes it does
 * not have to work out what was charged.
 */
export async function requestRefund(claimId: string, userId: string): Promise<ChoiceResult> {
  if (!isSupabaseEnabled()) return { ok: false, error: 'The database is not connected.' };

  const claim = await ownedOpenClaim(claimId, userId);
  if (!claim) return { ok: false, error: 'That claim is not open for a choice.' };

  await monitorStore.setClaimStatus(claim.id, 'refund_requested');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export const linkMonitorAdmin = {
  unverifiable: () => monitorStore.unverifiableLinks(),
  openClaims: () => monitorStore.openClaims(),
  counts: () => monitorStore.counts(),

  /** Mark a claim settled once the refund has been paid or the case dropped. */
  async closeClaim(claimId: string): Promise<void> {
    await monitorStore.setClaimStatus(claimId, 'closed', { resolved: true });
  },
};

export type { ClaimStatus, GuaranteeClaim, LinkWithClaim, MonitoredLink };
