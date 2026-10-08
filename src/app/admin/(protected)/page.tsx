import Link from 'next/link';
import {
  ArrowRight,
  Globe,
  Inbox,
  Plus,
  Receipt,
  ShoppingCart,
  Sparkles,
  Tags,
  TicketPercent,
  TrendingUp,
  Users,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { OrderStatusBadge } from '@/components/shared/status-badge';
import { StatCard } from '@/components/admin/dashboard/stat-card';
import { EmptyChart, RevenueArea, Sparkline, StatusRing } from '@/components/admin/dashboard/charts';
import { RangePicker } from '@/components/admin/dashboard/range-picker';
import { adminDashboardService } from '@/lib/services/admin-dashboard-service';
import { requireAdminSession } from '@/lib/auth/admin-access';
import { formatDay, percentChange, resolveRange } from '@/lib/admin/date-range';
import { orderStatusLabels } from '@/lib/utils/labels';
import { formatDate, formatPrice } from '@/lib/utils/format';
import type { OrderStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * The admin dashboard.
 *
 * Every figure here is counted by the database. The page this replaces read
 * `getAllForAdmin()`, `orderService.getAll()` and `userService.getAll()` and
 * did the arithmetic in JavaScript: twelve thousand listings with their costs
 * and contacts joined on, every order and every profile, to render four
 * numbers and six category rows.
 *
 * ## Nothing on it is invented
 *
 * Where the reference design shows a figure this application cannot produce,
 * the card says what it can instead:
 *
 *   * There is no table recording how many listings existed last month, so
 *     that card carries no trend. Orders and revenue do have a history -
 *     `placed_at` - so theirs are real.
 *   * There is no activity tracking anywhere in the schema, so "active users"
 *     is **Customers**, which is a number that means something.
 *   * A percentage against a period that does not exist, or against zero, is
 *     not printed at all rather than printed as 0% or 100%.
 *   * The statuses are the six in the `order_status` enum, under the names
 *     the rest of the application already gives them.
 */
export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAdminSession();
  const params = (await searchParams) ?? {};
  const one = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const range = resolveRange(one('range'), one('from'), one('to'));
  const data = await adminDashboardService.read(range);

  const totals = data.totals;
  const revenue = data.revenue ?? [];

  const revenuePoints = revenue.map((point) => ({
    label: formatDate(point.day),
    value: point.revenueMinor,
  }));
  const orderPoints = revenue.map((point) => ({
    label: formatDate(point.day),
    value: point.orders,
  }));

  const statusColours: Record<string, string> = {
    live: 'var(--color-accent-600)',
    'in-progress': 'var(--color-info)',
    submitted: 'var(--color-navy-500)',
    'awaiting-content': 'var(--color-warning)',
    draft: 'var(--color-muted-soft)',
    cancelled: 'var(--color-negative)',
  };

  const slices = (data.statuses ?? []).map((slice) => ({
    key: slice.status,
    label: orderStatusLabels[slice.status as OrderStatus] ?? slice.status,
    value: slice.orders,
    colour: statusColours[slice.status] ?? 'var(--color-muted-soft)',
  }));
  const sliceTotal = slices.reduce((sum, slice) => sum + slice.value, 0);

  const biggestCategory = Math.max(1, ...(data.categories ?? []).map((row) => row.websites));

  const name = (session.email.split('@')[0] ?? 'there').replace(/[._-]/g, ' ');
  const hour = new Date().getUTCHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[13px] text-muted">
            {greeting}, <span className="capitalize">{name}</span> 👋
          </p>
          <h1 className="mt-1 text-[28px] leading-tight font-semibold tracking-tight text-ink">
            Here&rsquo;s what&rsquo;s happening with Press Parrot
          </h1>
          <p className="mt-1 text-[14px] text-muted">
            An overview of your marketplace, orders, revenue and activity.
          </p>
        </div>
        <RangePicker
          current={range.key}
          from={range.from ? formatDay(range.from) : ''}
          to={range.to ? formatDay(new Date(range.to.getTime() - 86_400_000)) : ''}
        />
      </div>

      {totals === null ? (
        <Card>
          <CardContent className="py-6 text-[13px] text-muted">
            The dashboard figures could not be read. The rest of the admin area is unaffected.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Total websites"
            value={totals.websitesActive.toLocaleString('en-GB')}
            hint={`${totals.websitesTotal.toLocaleString('en-GB')} in the database`}
            icon={Globe}
            tone="accent"
            // No history table for listings, so no trend rather than a made-up one.
            change={null}
          />
          <StatCard
            label="Orders"
            value={totals.ordersInRange.toLocaleString('en-GB')}
            icon={ShoppingCart}
            tone="info"
            change={range.comparable ? percentChange(totals.ordersInRange, totals.ordersPrevious) : null}
            changeLabel="vs the period before"
            hint={range.comparable ? undefined : 'All time'}
            spark={<Sparkline points={orderPoints} />}
          />
          <StatCard
            label="Revenue"
            value={formatPrice(totals.revenueInRange)}
            icon={TrendingUp}
            tone="violet"
            change={range.comparable ? percentChange(totals.revenueInRange, totals.revenuePrevious) : null}
            changeLabel="vs the period before"
            hint="Excludes cancelled and drafts"
            spark={<Sparkline points={revenuePoints} />}
          />
          <StatCard
            // Not "active users": nothing in the schema records when somebody
            // last signed in, so this is the number that can be stood behind.
            label="Customers"
            value={totals.customers.toLocaleString('en-GB')}
            hint="Accounts with the customer role"
            icon={Users}
            tone="amber"
            change={null}
          />
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Revenue overview</CardTitle>
              <p className="mt-0.5 text-[12px] text-muted">
                Completed and in-flight orders, excluding cancelled and drafts &middot; {range.label}
              </p>
            </div>
          </CardHeader>
          <CardContent>
            {data.revenue === null ? (
              <EmptyChart message="The revenue series could not be read." height={200} />
            ) : (
              <RevenueArea points={revenuePoints} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Orders by status</CardTitle>
            <p className="mt-0.5 text-[12px] text-muted">
              Every status, including cancelled &middot; {range.label}
            </p>
          </CardHeader>
          <CardContent>
            {data.statuses === null ? (
              <EmptyChart message="The status breakdown could not be read." height={160} />
            ) : sliceTotal === 0 ? (
              <EmptyChart message="No orders in this period." height={160} />
            ) : (
              <StatusRing slices={slices} total={sliceTotal} />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Recent orders</CardTitle>
              <p className="mt-0.5 text-[12px] text-muted">The latest orders across the marketplace</p>
            </div>
            <Link
              href="/admin/orders"
              className="inline-flex items-center gap-1 text-[13px] font-medium text-accent-700 hover:underline"
            >
              View all orders
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {data.recent === null ? (
              <p className="px-5 py-6 text-[13px] text-muted">The order list could not be read.</p>
            ) : data.recent.length === 0 ? (
              <p className="px-5 py-6 text-[13px] text-muted">No orders yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {data.recent.map((order) => (
                  <li key={order.id}>
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="flex flex-wrap items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-sunken"
                    >
                      <span className="tabular w-20 shrink-0 text-[12px] text-muted">
                        {order.reference}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-ink">
                          {order.websiteDomain ?? 'No placements'}
                          {order.itemCount > 1 ? (
                            <span className="font-normal text-muted"> +{order.itemCount - 1}</span>
                          ) : null}
                        </span>
                        <span className="block truncate text-[12px] text-muted">
                          {order.customer ?? 'Unknown customer'}
                        </span>
                      </span>
                      <span className="tabular shrink-0 text-[13px] font-medium text-ink">
                        {formatPrice(order.totalMinor)}
                      </span>
                      <span className="shrink-0">
                        <OrderStatusBadge status={order.status as OrderStatus} />
                      </span>
                      <span className="hidden shrink-0 text-[12px] text-muted sm:block">
                        {formatDate(order.placedAt)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Top categories</CardTitle>
              <p className="mt-0.5 text-[12px] text-muted">By active listings</p>
            </div>
            <Link
              href="/admin/categories"
              className="text-[13px] font-medium text-accent-700 hover:underline"
            >
              View all
            </Link>
          </CardHeader>
          <CardContent>
            {data.categories === null ? (
              <p className="text-[13px] text-muted">The category counts could not be read.</p>
            ) : data.categories.length === 0 ? (
              <p className="text-[13px] text-muted">No active listings yet.</p>
            ) : (
              <ul className="space-y-3">
                {data.categories.map((row) => (
                  <li key={row.slug}>
                    {/* Straight into the marketplace with that filter already run. */}
                    <Link href={`/marketplace?niche=${row.slug}`} className="group block">
                      <span className="flex items-center justify-between gap-2 text-[13px]">
                        <span className="flex min-w-0 items-center gap-2 text-ink-soft group-hover:text-ink">
                          <Tags className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
                          <span className="truncate">{row.name}</span>
                        </span>
                        <span className="tabular shrink-0 font-medium text-ink">
                          {row.websites.toLocaleString('en-GB')}
                        </span>
                      </span>
                      <span className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
                        <span
                          className="block h-full rounded-full bg-accent-500"
                          style={{ width: `${Math.max(3, (row.websites / biggestCategory) * 100)}%` }}
                        />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Quick actions</CardTitle>
            <p className="mt-0.5 text-[12px] text-muted">Common admin tasks</p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[
                { label: 'Add website', href: '/admin/websites/new', icon: Plus, accent: true },
                { label: 'View orders', href: '/admin/orders', icon: ShoppingCart },
                { label: 'Manage users', href: '/admin/users', icon: Users },
                { label: 'Pricing rules', href: '/admin/pricing', icon: Receipt },
                { label: 'Promo codes', href: '/admin/promo-codes', icon: TicketPercent },
                { label: 'Publisher inbox', href: '/admin/sourcing', icon: Inbox },
              ].map((action) => (
                <Link
                  key={action.href}
                  href={action.href}
                  className={
                    action.accent
                      ? 'flex flex-col items-center gap-2 rounded-lg bg-accent-600 px-3 py-4 text-[12px] font-medium text-white transition-colors hover:bg-accent-700'
                      : 'flex flex-col items-center gap-2 rounded-lg border border-line px-3 py-4 text-[12px] font-medium text-ink-soft transition-colors hover:border-muted-soft hover:bg-surface-sunken hover:text-ink'
                  }
                >
                  <action.icon className="h-4 w-4" aria-hidden="true" />
                  {action.label}
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Waiting for you</CardTitle>
            <p className="mt-0.5 text-[12px] text-muted">Queues with something in them</p>
          </CardHeader>
          <CardContent>
            {data.queues === null ? (
              <p className="text-[13px] text-muted">The queue counts could not be read.</p>
            ) : (
              <ul className="space-y-2">
                {[
                  {
                    label: 'Drafts awaiting review',
                    count: data.queues.draftsPending,
                    href: '/admin/sourcing',
                  },
                  {
                    label: 'Domains offered twice',
                    count: data.queues.duplicateDomains,
                    href: '/admin/sourcing/duplicates',
                  },
                  {
                    label: 'Listings ready to publish',
                    count: data.queues.publishable,
                    href: '/admin/sourcing',
                  },
                ].map((queue) => (
                  <li key={queue.label}>
                    <Link
                      href={queue.href}
                      className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2.5 text-[13px] transition-colors hover:border-muted-soft hover:bg-surface-sunken"
                    >
                      <span className="min-w-0 truncate text-ink-soft">{queue.label}</span>
                      <span
                        className={
                          queue.count > 0
                            ? 'tabular shrink-0 rounded-full bg-accent-50 px-2 py-0.5 text-[12px] font-semibold text-accent-700'
                            : 'tabular shrink-0 text-[12px] text-muted'
                        }
                      >
                        {queue.count.toLocaleString('en-GB')}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            {/* The mascot already drawn for the brand, at a size that does not
                take the page over. */}
            <div className="mt-4 flex items-center gap-3 rounded-lg bg-navy-900 p-4">
              <Sparkles className="h-5 w-5 shrink-0 text-accent-400" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-white">Need assistance?</p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-white/60">
                  The admin notes live in the repository, beside the code they describe.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
