import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PageTitle } from '@/components/dashboard/page-title';
import { CustomerReferenceField } from '@/components/dashboard/customer-reference-field';
import { OrderDelivery } from '@/components/dashboard/order-delivery';
import { LinkGuarantee } from '@/components/dashboard/link-guarantee';
import { OrderStatusBadge, PaymentBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { orderService, settingsService } from '@/lib/services';
import { orderLinks } from '@/lib/services/link-monitor-service';
import { requireCustomerSession } from '@/lib/auth/customer-access';
import { deliveredItems } from '@/lib/orders/delivery';
import { formatDate, formatPrice } from '@/lib/utils/format';
import { linkTypeLabels } from '@/lib/utils/labels';
import { acceptedNicheLabel } from '@/lib/config/accepted-niches';

/*
  Never cached, for the same reason the orders list is not: a placement is
  delivered from the admin and the customer is often looking at this page when
  it happens.
*/
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Order' };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCustomerSession(`/dashboard/orders/${id}`);

  const [order, settings, guaranteedLinks] = await Promise.all([
    orderService.getById(id),
    settingsService.get(),
    // Checks the order is theirs itself rather than trusting the check below,
    // because it reads on the service role. It returns nothing for an order
    // that is not theirs, so the notFound() below is still the only answer
    // they get.
    orderLinks(id, user.id),
  ]);

  /*
    Not theirs is the same answer as not there.

    An order id in the URL must not be a way of discovering that somebody
    else's order exists - a 403 and a 404 are different answers, and the
    difference is the whole leak.
  */
  if (!order || order.userId !== user.id) notFound();

  const delivered = deliveredItems(order.items);
  const outstanding = order.items.filter((item) => !delivered.includes(item));

  /*
    One question asked once. Everything on this page that depends on whether
    the money arrived reads this, rather than each figure deciding for
    itself - which is how "Paid" came to sit above an order nobody had paid
    for.
  */
  const paid = order.paymentStatus === 'paid';

  return (
    <>
      <PageTitle
        title={`Order ${order.reference}`}
        description={
          order.completedAt
            ? `Completed on ${formatDate(order.completedAt)}.`
            : 'Everything you ordered, and anything waiting on you.'
        }
        action={
          <Button asChild variant="outline">
            <Link href="/dashboard/orders">
              <ArrowLeft className="h-4 w-4" />
              All orders
            </Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="grid gap-4 py-4 sm:grid-cols-4">
          <Figure label="Placed" value={formatDate(order.placedAt)} />
          <Figure label="Placements" value={String(order.items.length)} />
          {/* Theirs, editable, because somebody will have forgotten to set
              it at checkout and an order they cannot find is the whole
              problem this solves. */}
          <CustomerReferenceField orderId={order.id} reference={order.customerReference} />
          {/*
            "Paid" only where it was paid.

            This said Paid on every order, including one whose checkout was
            opened and abandoned - the same sentence the status badge was
            getting wrong, in a second place. An unpaid order is told what it
            would cost, in the words of something still owed.
          */}
          <Figure
            label={paid ? 'Paid' : 'To pay'}
            value={formatPrice(paid ? (order.chargedMinor ?? order.totalMinor) : order.totalMinor, {
              currency: order.currency,
            })}
            /*
              VAT and the promo code both belong on this line, because both
              explain why the figure is not simply the sum of the placements.
              The code is named rather than described: an order showing
              "$150 off" with no code on it is a number nobody can account for
              six months later.

              Before payment there is no VAT figure to quote - Stripe works it
              out from the billing address at checkout - so the line says that
              rather than implying the total is final.
            */
            hint={
              paid
                ? [
                    order.taxMinor
                      ? `includes ${formatPrice(order.taxMinor, { currency: order.currency })} VAT`
                      : null,
                    order.promoCode && order.discountMinor
                      ? `${order.promoCode} took off ${formatPrice(order.discountMinor, { currency: order.currency })}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || undefined
                : 'VAT is worked out at checkout'
            }
          />
          <div>
            <p className="text-[12px] text-muted">Status</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {order.completedAt ? (
                <span className="rounded-full bg-accent-50 px-2 py-0.5 text-[11px] font-medium text-accent-700">
                  Complete
                </span>
              ) : (
                <OrderStatusBadge status={order.status} paymentStatus={order.paymentStatus} />
              )}
              {/* Where the work got to, and where the money got to. Two
                  questions, and one badge cannot answer both. */}
              <PaymentBadge paymentStatus={order.paymentStatus} />
            </div>
          </div>
        </CardContent>
      </Card>

      <OrderDelivery
        items={order.items}
        postApprovalDays={settings.postApprovalIssueDays}
        // The clock is read here, on the server. A component that reads it
        // during render produces a different page depending on when React ran.
        nowIso={new Date().toISOString()}
      />

      <LinkGuarantee links={guaranteedLinks} />

      {outstanding.length > 0 ? (
        <section className="mt-8" aria-labelledby="in-progress">
          <h2 id="in-progress" className="mb-3 text-[15px] font-semibold text-ink">
            Still being worked on
            <span className="ml-2 text-[13px] font-normal text-muted">
              {outstanding.length}
            </span>
          </h2>
          <div className="space-y-2">
            {outstanding.map((item) => (
              <Card key={item.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-ink">
                      {item.websiteDomain}
                      <span className="ml-2 text-[12px] font-normal text-muted">
                        {linkTypeLabels[item.serviceType]}
                        {item.topic ? ` · ${acceptedNicheLabel(item.topic)}` : ''}
                      </span>
                    </p>
                    <p className="mt-0.5 truncate text-[12px] text-muted">{item.targetUrl}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <OrderStatusBadge status={item.status} paymentStatus={order.paymentStatus} />
                    <span className="tabular text-[13px] font-semibold text-ink">
                      {formatPrice(item.priceMinor)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-[12px] text-muted">{label}</p>
      <p className="tabular mt-0.5 text-[15px] font-semibold text-ink">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-muted">{hint}</p> : null}
    </div>
  );
}
