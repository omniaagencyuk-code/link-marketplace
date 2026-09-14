import type { Metadata } from 'next';
import Link from 'next/link';
import { PageTitle } from '@/components/dashboard/page-title';
import { OrdersTable } from '@/components/dashboard/orders-table';
import { DraftOrder } from '@/components/dashboard/draft-order';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { orderService, settingsService, userService, websiteService } from '@/lib/services';

export const metadata: Metadata = { title: 'Orders' };

export default async function OrdersPage() {
  const user = await userService.getCurrent();
  const [orders, settings, websites] = await Promise.all([
    orderService.getByUser(user.id),
    settingsService.get(),
    websiteService.getAll(),
  ]);

  return (
    <>
      <PageTitle
        title="Orders"
        description="Fill in the details for each placement in your current order, and track everything you have already ordered."
        action={
          <Button asChild variant="accent">
            <Link href="/websites">New order</Link>
          </Button>
        }
      />

      <DraftOrder websites={websites} />

      <section className="mt-8" aria-labelledby="all-orders">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <h2 id="all-orders" className="text-[15px] font-semibold text-ink">
            Submitted orders
          </h2>
          <span className="text-[13px] text-muted">({orders.length})</span>
        </div>
        <OrdersTable orders={orders} />
      </section>

      <section className="mt-8" aria-labelledby="status-key">
        <h2 id="status-key" className="text-[15px] font-semibold text-ink">
          What the statuses mean
        </h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {settings.orderStatuses.map((status) => (
            <div
              key={status.value}
              className="rounded-[var(--radius-card)] border border-line bg-white p-4 shadow-[var(--shadow-card)]"
            >
              <dt>
                <Badge tone="neutral">{status.label}</Badge>
              </dt>
              <dd className="mt-2 text-[13px] leading-relaxed text-muted">{status.description}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}
