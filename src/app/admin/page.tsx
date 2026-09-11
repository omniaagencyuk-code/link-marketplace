import Link from 'next/link';
import { Globe, PauseCircle, ShoppingCart, TrendingUp, Users } from 'lucide-react';
import { PageTitle } from '@/components/dashboard/page-title';
import { Stat } from '@/components/ui/stat';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { OrderStatusBadge } from '@/components/shared/status-badge';
import { orderService, userService, websiteService } from '@/lib/services';
import { nicheName } from '@/lib/data/categories';
import { formatDate, formatPrice } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  const [websites, orders, users] = await Promise.all([
    websiteService.getAllForAdmin(),
    orderService.getAll(),
    userService.getAll(),
  ]);

  const active = websites.filter((website) => website.status === 'active');
  const paused = websites.filter((website) => website.status !== 'active');
  const revenueMinor = orders
    .filter((order) => order.status !== 'cancelled' && order.status !== 'draft')
    .reduce((sum, order) => sum + order.totalMinor, 0);

  const byNiche = Object.entries(
    active.reduce<Record<string, number>>((counts, website) => {
      counts[website.niche] = (counts[website.niche] ?? 0) + 1;
      return counts;
    }, {}),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  return (
    <>
      <PageTitle
        title="Admin dashboard"
        description="Marketplace inventory, orders and customers at a glance."
        action={
          <Button asChild variant="accent">
            <Link href="/admin/websites/new">Add website</Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Active websites"
          value={String(active.length)}
          hint={`${websites.length} total in database`}
          icon={Globe}
          tone="accent"
        />
        <Stat
          label="Orders"
          value={String(orders.length)}
          hint={`${orders.filter((order) => order.status === 'live').length} live placements`}
          icon={ShoppingCart}
        />
        <Stat
          label="Revenue"
          value={formatPrice(revenueMinor)}
          hint="Excluding cancelled and drafts"
          icon={TrendingUp}
        />
        <Stat label="Customers" value={String(users.length)} hint="All roles" icon={Users} />
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Latest orders</CardTitle>
            <Button asChild variant="link" size="sm">
              <Link href="/admin/orders">View all</Link>
            </Button>
          </CardHeader>
          <CardContent className="px-0 py-0">
            <ul className="divide-y divide-line">
              {orders.slice(0, 6).map((order) => (
                <li key={order.id} className="flex items-center justify-between gap-4 px-5 py-3">
                  <div className="min-w-0">
                    <p className="tabular text-[13px] font-medium text-ink">{order.reference}</p>
                    <p className="truncate text-[12px] text-muted">
                      {order.customerName} &middot; {formatDate(order.placedAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <OrderStatusBadge status={order.status} />
                    <span className="tabular text-[13px] font-semibold text-ink">
                      {formatPrice(order.totalMinor)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Inventory by niche</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {byNiche.map(([niche, count]) => (
                <div key={niche} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 text-[13px] text-ink-soft">
                    {nicheName(niche as never)}
                  </span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken">
                    <span
                      className="block h-full rounded-full bg-navy-900"
                      style={{ width: `${(count / active.length) * 100}%` }}
                    />
                  </span>
                  <span className="tabular w-6 text-right text-[13px] text-muted">{count}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex items-center gap-2">
              <PauseCircle className="h-4 w-4 text-muted" aria-hidden="true" />
              <CardTitle>Needs attention</CardTitle>
            </CardHeader>
            <CardContent>
              {paused.length === 0 ? (
                <p className="text-[13px] text-muted">Every listing is active.</p>
              ) : (
                <ul className="space-y-2">
                  {paused.slice(0, 5).map((website) => (
                    <li key={website.id} className="flex items-center justify-between gap-3">
                      <Link
                        href={`/admin/websites/${website.id}`}
                        className="text-[13px] font-medium text-ink hover:text-accent-700"
                      >
                        {website.domain}
                      </Link>
                      <span className="text-[12px] text-muted capitalize">{website.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
