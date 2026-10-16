import type { Metadata } from 'next';
import Link from 'next/link';
import { PageTitle } from '@/components/dashboard/page-title';
import { OrdersSearch } from '@/components/dashboard/orders-search';
import { OrdersTable } from '@/components/dashboard/orders-table';
import { DraftOrder } from '@/components/dashboard/draft-order';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { orderService, settingsService } from '@/lib/services';
import { requireCustomerSession } from '@/lib/auth/customer-access';
import { splitOrders } from '@/lib/orders/placed';

/*
  Never cached. An order's status changes from a Stripe webhook seconds after
  the customer gets back from paying, and a cached copy of this page shows
  somebody who has just paid that their order is a draft they never submitted.
*/
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Orders' };

export default async function OrdersPage() {
  const user = await requireCustomerSession('/dashboard/orders');
  const [orders, settings] = await Promise.all([
    orderService.getByUser(user.id),
    settingsService.get(),
  ]);

  /*
    An order row exists from the moment somebody opens checkout, so this list
    holds two different things: what they bought, and what they started and
    left. Listing them together under "Submitted orders" told a customer who
    had bought one placement that they had submitted four.
  */
  const { placed, abandoned } = splitOrders(orders);

  return (
    <>
      <PageTitle
        title="Orders"
        description="Fill in the details for each placement in your current order, and track everything you have already ordered."
        action={
          <Button asChild variant="accent">
            <Link href="/marketplace">New order</Link>
          </Button>
        }
      />

      <DraftOrder />

      <section className="mt-8" aria-labelledby="all-orders">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <h2 id="all-orders" className="text-[15px] font-semibold text-ink">
            Submitted orders
          </h2>
          <span className="text-[13px] text-muted">({placed.length})</span>
        </div>
        <OrdersSearch orders={placed} />
      </section>

      {/*
        Kept, and kept quiet. These are not orders and the heading says so,
        but they are not nothing either: somebody who thinks they bought a
        placement and cannot find it should be able to see what happened
        rather than conclude the site lost it. Listed below the real ones,
        unsearched, with the only sentence that matters next to them.
      */}
      {abandoned.length > 0 ? (
        <section className="mt-8" aria-labelledby="not-completed">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <h2 id="not-completed" className="text-[15px] font-semibold text-ink">
              Not completed
            </h2>
            <span className="text-[13px] text-muted">({abandoned.length})</span>
          </div>
          <p className="mb-4 text-[13px] text-muted">
            Checkout was opened for these and payment was never finished, so nothing was charged.
            Add the websites again from the marketplace to order them.
          </p>
          <OrdersTable orders={abandoned} />
        </section>
      ) : null}

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
