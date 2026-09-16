import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PageTitle } from '@/components/dashboard/page-title';
import { ClearOrderDraft } from '@/components/dashboard/clear-order-draft';
import { requireCustomerSession } from '@/lib/auth/customer-access';
import { orderService } from '@/lib/services';
import { formatPrice } from '@/lib/utils/format';

export const metadata: Metadata = {
  title: 'Order confirmed',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * Where Stripe returns the customer after a successful payment.
 *
 * Deliberately reads the order rather than trusting the visit. Anyone can open
 * this URL - it is a plain GET with a reference in the query string - so it
 * confirms nothing by itself. The authority on whether payment succeeded is
 * the webhook, and this page reports what the database says.
 *
 * That also means the page can legitimately be reached a moment before the
 * webhook lands, so a paid order still showing as unpaid is a normal race
 * rather than a failure, and is described as such.
 */
export default async function OrderConfirmedPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const user = await requireCustomerSession('/dashboard/orders');
  const { order: reference } = await searchParams;

  const order = reference ? await orderService.getByReference(reference) : null;
  // Someone else's reference reveals nothing.
  const visible = order && order.userId === user.id ? order : null;

  return (
    <>
      <ClearOrderDraft />

      <PageTitle title="Thank you" description="Your order has been placed." />

      <Card>
        <CardContent className="py-8 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent-50 text-accent-700">
            <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
          </span>

          <h2 className="mt-4 text-lg font-semibold text-ink">
            {visible ? `Order ${visible.reference} received` : 'Payment received'}
          </h2>

          {visible ? (
            <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-muted">
              {visible.items.length} {visible.items.length === 1 ? 'placement' : 'placements'} for{' '}
              <span className="font-medium text-ink">
                {formatPrice(visible.totalMinor, { currency: visible.currency })}
              </span>
              . We will contact the publishers and keep you updated as each placement progresses.
            </p>
          ) : (
            <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-muted">
              Your payment went through. The order takes a moment to appear here - it will be in
              your orders shortly.
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button asChild variant="accent">
              <Link href="/dashboard/orders">
                View your orders
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/marketplace">Back to the marketplace</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
