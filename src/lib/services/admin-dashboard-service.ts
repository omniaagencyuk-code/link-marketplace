import { getAdminScopedClient } from '@/lib/supabase/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import type { DateRange } from '@/lib/admin/date-range';

/**
 * The admin dashboard's figures, counted by the database.
 *
 * Every one of these is an aggregate. The page this replaces read
 * `getAllForAdmin()`, `orderService.getAll()` and `userService.getAll()` and
 * did the arithmetic in JavaScript - twelve thousand listings with costs and
 * contacts joined on, every order and every profile, to render four numbers.
 *
 * Six calls, run together. They do not depend on each other, so running them
 * in sequence would be six round trips of waiting for a page that is mostly
 * one screen of numbers.
 *
 * A failure in one does not empty the page. The dashboard is the screen
 * somebody opens to find out whether anything is wrong, so it must not be the
 * screen that disappears when something is: each section falls back to its own
 * empty state and says so, rather than throwing the lot away.
 */

export interface DashboardTotals {
  websitesActive: number;
  websitesTotal: number;
  customers: number;
  ordersInRange: number;
  ordersPrevious: number;
  revenueInRange: number;
  revenuePrevious: number;
}

export interface RevenuePoint {
  day: string;
  revenueMinor: number;
  orders: number;
}

export interface StatusSlice {
  status: string;
  orders: number;
  totalMinor: number;
}

export interface CategoryCount {
  slug: string;
  name: string;
  websites: number;
}

export interface RecentOrder {
  id: string;
  reference: string;
  status: string;
  totalMinor: number;
  placedAt: string;
  customer: string | null;
  websiteDomain: string | null;
  itemCount: number;
}

export interface QueueCounts {
  draftsPending: number;
  duplicateDomains: number;
  publishable: number;
}

export interface DashboardData {
  totals: DashboardTotals | null;
  revenue: RevenuePoint[] | null;
  statuses: StatusSlice[] | null;
  categories: CategoryCount[] | null;
  recent: RecentOrder[] | null;
  queues: QueueCounts | null;
}

/** ISO strings for the RPCs, or null for an unbounded end. */
function bounds(range: DateRange): { from: string | null; to: string | null } {
  return {
    from: range.from ? range.from.toISOString() : null,
    to: range.to ? range.to.toISOString() : null,
  };
}

const EMPTY: DashboardData = {
  totals: null,
  revenue: null,
  statuses: null,
  categories: null,
  recent: null,
  queues: null,
};

export const adminDashboardService = {
  async read(range: DateRange): Promise<DashboardData> {
    if (!isSupabaseEnabled()) return EMPTY;

    const supabase = getAdminScopedClient();
    const { from, to } = bounds(range);

    /*
      `allSettled`, not `all`.

      One function failing - a migration not yet run, a timeout - would
      otherwise take the whole dashboard down, including the five sections
      that were fine. Each result is read on its own and a rejected one
      becomes null, which the page renders as that card's empty state.
    */
    const [totals, revenue, statuses, categories, recent, queues] = await Promise.allSettled([
      supabase.rpc('admin_dashboard_totals', { p_from: from, p_to: to }),
      /*
        The series always has ends, even when the range does not. A chart of
        "all time" still has to be drawn across something, and a year back
        from today is the window that shows the shape of the recent business
        rather than a flat line with one spike in it.
      */
      supabase.rpc('admin_revenue_series', {
        p_from: from ?? new Date(Date.now() - 365 * 86_400_000).toISOString(),
        p_to: to ?? new Date().toISOString(),
      }),
      supabase.rpc('admin_orders_by_status', { p_from: from, p_to: to }),
      supabase.rpc('admin_top_categories', { p_limit: 8 }),
      supabase.rpc('admin_recent_orders', { p_limit: 6 }),
      supabase.rpc('admin_queue_counts', {}),
    ]);

    const rows = <T>(result: PromiseSettledResult<{ data: unknown; error: unknown }>): T[] | null => {
      if (result.status !== 'fulfilled' || result.value.error) return null;
      return (result.value.data ?? []) as T[];
    };

    const totalRow = rows<Record<string, number>>(totals)?.[0] ?? null;
    const queueRow = rows<Record<string, number>>(queues)?.[0] ?? null;

    return {
      totals: totalRow
        ? {
            websitesActive: Number(totalRow.websites_active ?? 0),
            websitesTotal: Number(totalRow.websites_total ?? 0),
            customers: Number(totalRow.customers ?? 0),
            ordersInRange: Number(totalRow.orders_in_range ?? 0),
            ordersPrevious: Number(totalRow.orders_previous ?? 0),
            revenueInRange: Number(totalRow.revenue_in_range ?? 0),
            revenuePrevious: Number(totalRow.revenue_previous ?? 0),
          }
        : null,
      revenue:
        rows<{ day: string; revenue_minor: number; orders: number }>(revenue)?.map((row) => ({
          day: row.day,
          revenueMinor: Number(row.revenue_minor ?? 0),
          orders: Number(row.orders ?? 0),
        })) ?? null,
      statuses:
        rows<{ status: string; orders: number; total_minor: number }>(statuses)?.map((row) => ({
          status: row.status,
          orders: Number(row.orders ?? 0),
          totalMinor: Number(row.total_minor ?? 0),
        })) ?? null,
      categories:
        rows<{ slug: string; name: string; websites: number }>(categories)?.map((row) => ({
          slug: row.slug,
          name: row.name,
          websites: Number(row.websites ?? 0),
        })) ?? null,
      recent:
        rows<Record<string, unknown>>(recent)?.map((row) => ({
          id: String(row.id),
          reference: String(row.reference ?? ''),
          status: String(row.status ?? ''),
          totalMinor: Number(row.total_minor ?? 0),
          placedAt: String(row.placed_at ?? ''),
          customer: (row.customer as string | null) ?? null,
          websiteDomain: (row.website_domain as string | null) ?? null,
          itemCount: Number(row.item_count ?? 0),
        })) ?? null,
      queues: queueRow
        ? {
            draftsPending: Number(queueRow.drafts_pending ?? 0),
            duplicateDomains: Number(queueRow.duplicate_domains ?? 0),
            publishable: Number(queueRow.publishable ?? 0),
          }
        : null,
    };
  },
};
