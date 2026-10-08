import { getServerClient } from '@/lib/supabase/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { blogService } from '@/lib/services/blog-service';
import type { BlogPost } from '@/lib/types';

/**
 * The customer dashboard's data, scoped by the customer's own session.
 *
 * `getServerClient` rather than the admin client, deliberately and on every
 * read here. It carries the signed-in customer's cookies, so row level
 * security applies exactly as it does everywhere else they read - which is
 * what makes "scoped to the authenticated account" a property of the database
 * rather than of this file remembering to filter.
 *
 * Nothing here reads more than it shows: five orders for a list of five,
 * four suggestions for four cards, three posts for three.
 */

export interface CustomerSummary {
  activeOrders: number;
  inProgress: number;
  awaitingContent: number;
  liveLinks: number;
  liveLinksThisMonth: number;
  totalSpendMinor: number;
  ordersAll: number;
}

export interface CustomerOrderRow {
  id: string;
  reference: string;
  status: string;
  totalMinor: number;
  placedAt: string;
  websiteDomain: string | null;
  targetUrl: string | null;
  itemCount: number;
}

export interface CustomerDashboard {
  summary: CustomerSummary | null;
  orders: CustomerOrderRow[];
  /** Ids only: the cards are built by the marketplace's own listing fetch. */
  recommendationIds: string[];
  /**
   * Whether the suggestions came from what this customer has ordered.
   *
   * It decides the heading. False means there was no signal at all, and the
   * section is called "Popular websites" rather than "Recommended for you" -
   * telling a customer with no orders that something was picked for them is
   * the kind of small lie that makes the rest of a page less believable.
   */
  personalised: boolean;
  posts: BlogPost[];
}

const EMPTY: CustomerDashboard = {
  summary: null,
  orders: [],
  recommendationIds: [],
  personalised: false,
  posts: [],
};

export const customerDashboardService = {
  async read(): Promise<CustomerDashboard> {
    if (!isSupabaseEnabled()) return EMPTY;

    const supabase = await getServerClient();

    const [summary, orders, recommendations, posts] = await Promise.allSettled([
      supabase.rpc('customer_dashboard_summary'),
      /*
        Five, with the first placement on each.

        The dashboard used to read every order the customer has - with every
        item on each one - to show five rows. A draft is a basket rather than
        an order and is left out, which is what the orders page does too.
      */
      supabase
        .from('orders')
        .select('id, reference, status, total_minor, placed_at, order_items(website_domain, target_url)')
        .neq('status', 'draft')
        .order('placed_at', { ascending: false })
        .limit(5),
      supabase.rpc('customer_recommendations', { p_limit: 4 }),
      blogService.listPublished({ limit: 3 }),
    ]);

    const ok = <T>(result: PromiseSettledResult<T>): T | null =>
      result.status === 'fulfilled' ? result.value : null;

    const summaryRow = (() => {
      const answer = ok(summary);
      if (!answer || answer.error) return null;
      const row = ((answer.data ?? []) as Record<string, number>[])[0];
      if (!row) return null;
      return {
        activeOrders: Number(row.active_orders ?? 0),
        inProgress: Number(row.in_progress ?? 0),
        awaitingContent: Number(row.awaiting_content ?? 0),
        liveLinks: Number(row.live_links ?? 0),
        liveLinksThisMonth: Number(row.live_links_this_month ?? 0),
        totalSpendMinor: Number(row.total_spend_minor ?? 0),
        ordersAll: Number(row.orders_all ?? 0),
      };
    })();

    const orderRows = (() => {
      const answer = ok(orders);
      if (!answer || answer.error) return [];
      type Row = {
        id: string;
        reference: string;
        status: string;
        total_minor: number;
        placed_at: string;
        order_items: { website_domain: string | null; target_url: string | null }[] | null;
      };
      return ((answer.data ?? []) as unknown as Row[]).map((row) => {
        const items = row.order_items ?? [];
        return {
          id: row.id,
          reference: row.reference,
          status: row.status,
          totalMinor: Number(row.total_minor ?? 0),
          placedAt: row.placed_at,
          websiteDomain: items[0]?.website_domain ?? null,
          targetUrl: items[0]?.target_url ?? null,
          itemCount: items.length,
        };
      });
    })();

    const recommended = (() => {
      const answer = ok(recommendations);
      if (!answer || answer.error) return { ids: [] as string[], personalised: false };
      const rows = (answer.data ?? []) as { id: string; personalised: boolean }[];
      return {
        ids: rows.map((row) => row.id),
        // Every row carries the same flag; an empty list is not personal.
        personalised: rows.length > 0 && Boolean(rows[0]?.personalised),
      };
    })();

    return {
      summary: summaryRow,
      orders: orderRows,
      recommendationIds: recommended.ids,
      personalised: recommended.personalised,
      posts: ok(posts) ?? [],
    };
  },
};
