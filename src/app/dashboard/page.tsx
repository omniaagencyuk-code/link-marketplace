import Link from 'next/link';
import { ArrowRight, Bookmark, CheckCircle2, PoundSterling, Timer } from 'lucide-react';
import { WelcomeTitle } from '@/components/dashboard/welcome-title';
import { OrdersTable } from '@/components/dashboard/orders-table';
import { SavedCountStat } from '@/components/dashboard/saved-count-stat';
import { Button } from '@/components/ui/button';
import { Stat } from '@/components/ui/stat';
import { EmptyState } from '@/components/ui/empty-state';
import { orderService } from '@/lib/services';
import { requireCustomerSession } from '@/lib/auth/customer-access';
import { formatPrice } from '@/lib/utils/format';

export default async function DashboardPage() {
  const user = await requireCustomerSession('/dashboard');
  const [summary, orders] = await Promise.all([
    orderService.getSummary(user.id),
    orderService.getByUser(user.id),
  ]);

  return (
    <>
      <WelcomeTitle
        fallbackName={user.fullName}
        action={
          <Button asChild variant="accent">
            <Link href="/marketplace">
              Browse websites
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Active orders"
          value={String(summary.activeOrders)}
          hint={`${summary.pendingActionOrders} awaiting content`}
          icon={Timer}
          tone="accent"
        />
        <Stat
          label="Completed orders"
          value={String(summary.completedOrders)}
          hint="Placements live and indexed"
          icon={CheckCircle2}
        />
        <SavedCountStat />
        <Stat
          label="Total spend"
          value={formatPrice(summary.totalSpendMinor)}
          hint="Excluding cancelled orders"
          icon={PoundSterling}
        />
      </div>

      <section className="mt-8" aria-labelledby="recent-orders">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 id="recent-orders" className="text-[15px] font-semibold text-ink">
            Recent orders
          </h2>
          <Button asChild variant="link" size="sm">
            <Link href="/dashboard/orders">View all orders</Link>
          </Button>
        </div>

        {orders.length === 0 ? (
          <EmptyState
            icon={Bookmark}
            title="No orders yet"
            description="Find websites in the marketplace and add them to your first order."
            action={
              <Button asChild variant="accent">
                <Link href="/marketplace">Browse websites</Link>
              </Button>
            }
          />
        ) : (
          <OrdersTable orders={orders} limit={6} />
        )}
      </section>
    </>
  );
}
