import { getAdminScopedClient } from '@/lib/supabase/server';
import type { LinkStatus } from './status';
import type { ClaimStatus, GuaranteeClaim, MonitoredLink } from './types';

/**
 * Every read and write the monitor makes.
 *
 * All of it on the service-role client, because none of it is a customer
 * action: the checker is a cron, the claims are opened by the checker, and the
 * three tables have a buyer read policy and no write policy at all. Anything
 * a customer does go on to do with a claim is authorised in the service above
 * by proving the row is theirs, never by the database.
 *
 * Column names live here and nowhere else. The rest of the feature speaks the
 * types in `./types`.
 */

const LINK_COLUMNS =
  'id, order_item_id, order_id, website_id, buyer_id, placed_url, target_url, expects_dofollow, ' +
  'published_at, guarantee_ends_at, status, hard_failures, soft_failures, lost_at, last_checked_at, ' +
  'last_http_status, last_reason, final_url, next_check_at';

const CLAIM_COLUMNS =
  'id, link_id, order_id, order_item_id, buyer_id, website_id, status, reason, opened_at, ' +
  'publisher_deadline, resolved_at, amount_minor, currency';

/* eslint-disable @typescript-eslint/no-explicit-any */

function mapLink(row: any): MonitoredLink {
  return {
    id: row.id,
    orderItemId: row.order_item_id,
    orderId: row.order_id,
    websiteId: row.website_id,
    buyerId: row.buyer_id,
    placedUrl: row.placed_url,
    targetUrl: row.target_url,
    expectsDofollow: row.expects_dofollow !== false,
    publishedAt: row.published_at,
    guaranteeEndsAt: row.guarantee_ends_at,
    status: (row.status ?? 'pending') as LinkStatus,
    hardFailures: row.hard_failures ?? 0,
    softFailures: row.soft_failures ?? 0,
    ...(row.lost_at ? { lostAt: row.lost_at } : {}),
    ...(row.last_checked_at ? { lastCheckedAt: row.last_checked_at } : {}),
    ...(typeof row.last_http_status === 'number' ? { lastHttpStatus: row.last_http_status } : {}),
    ...(row.last_reason ? { lastReason: row.last_reason } : {}),
    ...(row.final_url ? { finalUrl: row.final_url } : {}),
    nextCheckAt: row.next_check_at,
  };
}

function mapClaim(row: any): GuaranteeClaim {
  return {
    id: row.id,
    linkId: row.link_id,
    orderId: row.order_id,
    orderItemId: row.order_item_id,
    buyerId: row.buyer_id,
    websiteId: row.website_id,
    status: (row.status ?? 'awaiting_publisher') as ClaimStatus,
    reason: row.reason ?? '',
    openedAt: row.opened_at,
    publisherDeadline: row.publisher_deadline,
    ...(row.resolved_at ? { resolvedAt: row.resolved_at } : {}),
    amountMinor: row.amount_minor ?? 0,
    currency: row.currency ?? 'GBP',
  };
}

/* eslint-enable @typescript-eslint/no-explicit-any */

export interface NewLink {
  orderItemId: string;
  orderId: string;
  websiteId: string;
  buyerId: string;
  placedUrl: string;
  targetUrl: string;
  expectsDofollow: boolean;
  publishedAt: string;
  guaranteeEndsAt: string;
}

export const monitorStore = {
  /**
   * Start watching a placement.
   *
   * `order_item_id` is unique, so a second registration of the same placement
   * is a conflict rather than a duplicate row. Ignored rather than merged:
   * the first registration recorded when the link was published and that date
   * is what the guarantee and the durability window are measured from. A
   * redelivery must not quietly restart the clock.
   */
  async insertLink(link: NewLink): Promise<{ created: boolean; error?: string }> {
    const { data, error } = await getAdminScopedClient()
      .from('monitored_links')
      .upsert(
        {
          order_item_id: link.orderItemId,
          order_id: link.orderId,
          website_id: link.websiteId,
          buyer_id: link.buyerId,
          placed_url: link.placedUrl,
          target_url: link.targetUrl,
          expects_dofollow: link.expectsDofollow,
          published_at: link.publishedAt,
          guarantee_ends_at: link.guaranteeEndsAt,
          status: 'pending',
          // Checked on the next run rather than immediately: a publisher's
          // caches and ours both need a moment, and a brand new placement
          // failing its first check would open a claim on day one.
          next_check_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        },
        { onConflict: 'order_item_id', ignoreDuplicates: true },
      )
      .select('id');

    if (error) return { created: false, error: error.message };
    return { created: (data ?? []).length > 0 };
  },

  /** What is due, oldest first. The checker's only query. */
  async dueLinks(limit: number, now: Date = new Date()): Promise<MonitoredLink[]> {
    const { data } = await getAdminScopedClient()
      .from('monitored_links')
      .select(LINK_COLUMNS)
      .lte('next_check_at', now.toISOString())
      .order('next_check_at', { ascending: true })
      .limit(limit);

    return ((data ?? []) as unknown[]).map(mapLink);
  },

  /**
   * The outcome of one check.
   *
   * The event row is written only when the status moved, which is what keeps
   * a weekly sweep over a few thousand links from writing a quarter of a
   * million rows a year that all say "still fine".
   */
  async recordCheck(
    link: MonitoredLink,
    next: { status: LinkStatus; hardFailures: number; softFailures: number; lostAt: string | null },
    outcome: { reason: string; httpStatus?: number; finalUrl?: string; nextCheckAt: string },
  ): Promise<void> {
    const supabase = getAdminScopedClient();

    await supabase
      .from('monitored_links')
      .update({
        status: next.status,
        hard_failures: next.hardFailures,
        soft_failures: next.softFailures,
        lost_at: next.lostAt,
        last_checked_at: new Date().toISOString(),
        last_http_status: outcome.httpStatus ?? null,
        last_reason: outcome.reason,
        final_url: outcome.finalUrl ?? null,
        next_check_at: outcome.nextCheckAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', link.id);

    if (next.status === link.status) return;

    await supabase.from('link_status_events').insert({
      link_id: link.id,
      from_status: link.status,
      to_status: next.status,
      reason: outcome.reason,
      http_status: outcome.httpStatus ?? null,
    });
  },

  /**
   * Open a claim, unless one is already open.
   *
   * A partial unique index enforces "one open claim per link", so a race
   * between two runs ends as a conflict here rather than two emails to the
   * same publisher about the same article.
   */
  async openClaim(input: {
    linkId: string;
    orderId: string;
    orderItemId: string;
    buyerId: string;
    websiteId: string;
    reason: string;
    publisherDeadline: string;
    amountMinor: number;
    currency: string;
  }): Promise<GuaranteeClaim | null> {
    const { data, error } = await getAdminScopedClient()
      .from('guarantee_claims')
      .insert({
        link_id: input.linkId,
        order_id: input.orderId,
        order_item_id: input.orderItemId,
        buyer_id: input.buyerId,
        website_id: input.websiteId,
        status: 'awaiting_publisher',
        reason: input.reason,
        publisher_deadline: input.publisherDeadline,
        amount_minor: input.amountMinor,
        currency: input.currency,
      })
      .select(CLAIM_COLUMNS)
      .maybeSingle();

    if (error || !data) return null;
    return mapClaim(data);
  },

  /**
   * The publisher put it back.
   *
   * Only claims still waiting on somebody. A buyer who has already asked for
   * a refund is not quietly moved back to "restored" because the article
   * reappeared a fortnight later - that decision has been made and somebody
   * owes them money.
   */
  async restoreOpenClaim(linkId: string): Promise<GuaranteeClaim | null> {
    const { data } = await getAdminScopedClient()
      .from('guarantee_claims')
      .update({ status: 'restored', resolved_at: new Date().toISOString() })
      .eq('link_id', linkId)
      .in('status', ['awaiting_publisher', 'awaiting_buyer_choice'])
      .select(CLAIM_COLUMNS)
      .maybeSingle();

    return data ? mapClaim(data) : null;
  },

  /** Claims the publisher has run out of time on. */
  async claimsPastDeadline(now: Date = new Date()): Promise<GuaranteeClaim[]> {
    const { data } = await getAdminScopedClient()
      .from('guarantee_claims')
      .select(CLAIM_COLUMNS)
      .eq('status', 'awaiting_publisher')
      .lte('publisher_deadline', now.toISOString());

    return ((data ?? []) as unknown[]).map(mapClaim);
  },

  async setClaimStatus(
    claimId: string,
    status: ClaimStatus,
    options: { resolved?: boolean } = {},
  ): Promise<void> {
    await getAdminScopedClient()
      .from('guarantee_claims')
      .update({
        status,
        updated_at: new Date().toISOString(),
        ...(options.resolved ? { resolved_at: new Date().toISOString() } : {}),
      })
      .eq('id', claimId);
  },

  async claimById(claimId: string): Promise<GuaranteeClaim | null> {
    const { data } = await getAdminScopedClient()
      .from('guarantee_claims')
      .select(CLAIM_COLUMNS)
      .eq('id', claimId)
      .maybeSingle();

    return data ? mapClaim(data) : null;
  },

  async linkById(linkId: string): Promise<MonitoredLink | null> {
    const { data } = await getAdminScopedClient()
      .from('monitored_links')
      .select(LINK_COLUMNS)
      .eq('id', linkId)
      .maybeSingle();

    return data ? mapLink(data) : null;
  },

  /** Every watched link on one order. */
  async linksForOrder(orderId: string): Promise<MonitoredLink[]> {
    const { data } = await getAdminScopedClient()
      .from('monitored_links')
      .select(LINK_COLUMNS)
      .eq('order_id', orderId);

    return ((data ?? []) as unknown[]).map(mapLink);
  },

  /** Open claims on one order, so a page can pair them with their links. */
  async claimsForOrder(orderId: string): Promise<GuaranteeClaim[]> {
    const { data } = await getAdminScopedClient()
      .from('guarantee_claims')
      .select(CLAIM_COLUMNS)
      .eq('order_id', orderId)
      .order('opened_at', { ascending: false });

    return ((data ?? []) as unknown[]).map(mapClaim);
  },

  /**
   * Links we have given up on seeing.
   *
   * The admin queue that matters most: three soft failures in a row is a site
   * the monitor cannot read, and until somebody looks by hand nobody knows
   * whether the link is fine behind a firewall or gone.
   */
  async unverifiableLinks(limit = 200): Promise<{ link: MonitoredLink; domain: string }[]> {
    const { data } = await getAdminScopedClient()
      .from('monitored_links')
      .select(`${LINK_COLUMNS}, order_items (website_domain)`)
      .eq('status', 'unverifiable')
      .order('last_checked_at', { ascending: true })
      .limit(limit);

    /* eslint-disable @typescript-eslint/no-explicit-any */
    return ((data ?? []) as any[]).map((row) => {
      const item = Array.isArray(row.order_items) ? row.order_items[0] : row.order_items;
      return { link: mapLink(row), domain: (item?.website_domain as string) ?? '' };
    });
    /* eslint-enable @typescript-eslint/no-explicit-any */
  },

  /** Claims that still need something from somebody. */
  async openClaims(limit = 200): Promise<
    { claim: GuaranteeClaim; domain: string; orderReference: string; buyerEmail: string }[]
  > {
    const { data } = await getAdminScopedClient()
      .from('guarantee_claims')
      .select(
        `${CLAIM_COLUMNS}, order_items (website_domain), orders (reference, customer_email)`,
      )
      .in('status', ['awaiting_publisher', 'awaiting_buyer_choice', 'replacement_requested', 'refund_requested'])
      .order('opened_at', { ascending: true })
      .limit(limit);

    /* eslint-disable @typescript-eslint/no-explicit-any */
    return ((data ?? []) as any[]).map((row) => {
      const item = Array.isArray(row.order_items) ? row.order_items[0] : row.order_items;
      const order = Array.isArray(row.orders) ? row.orders[0] : row.orders;
      return {
        claim: mapClaim(row),
        domain: (item?.website_domain as string) ?? '',
        orderReference: (order?.reference as string) ?? '',
        buyerEmail: (order?.customer_email as string) ?? '',
      };
    });
    /* eslint-enable @typescript-eslint/no-explicit-any */
  },

  /** How many links are waiting, for the admin's summary line. */
  async counts(): Promise<Record<LinkStatus | 'total', number>> {
    const supabase = getAdminScopedClient();
    const statuses: LinkStatus[] = ['pending', 'live', 'failing', 'unverifiable', 'lost'];
    const counts = { total: 0 } as Record<LinkStatus | 'total', number>;

    const { count: total } = await supabase
      .from('monitored_links')
      .select('id', { count: 'exact', head: true });
    counts.total = total ?? 0;

    for (const status of statuses) {
      const { count } = await supabase
        .from('monitored_links')
        .select('id', { count: 'exact', head: true })
        .eq('status', status);
      counts[status] = count ?? 0;
    }

    return counts;
  },

  /** The nightly score rebuild. Returns how many listings were written. */
  async recomputeDurability(minSample = 5): Promise<number> {
    const { data, error } = await getAdminScopedClient().rpc('recompute_durability_scores', {
      min_sample: minSample,
    });

    if (error) throw new Error(`Could not recompute durability: ${error.message}`);
    return typeof data === 'number' ? data : 0;
  },
};
