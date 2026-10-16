import type { Metadata } from 'next';
import { Receipt } from 'lucide-react';
import { PageTitle } from '@/components/dashboard/page-title';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { PaymentBadge } from '@/components/shared/status-badge';
import { orderService } from '@/lib/services';
import { requireCustomerSession } from '@/lib/auth/customer-access';
import { isPlaced } from '@/lib/orders/placed';
import { formatDate, formatPrice } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'Billing' };

export default async function BillingPage() {
  const user = await requireCustomerSession('/dashboard/billing');
  const orders = await orderService.getByUser(user.id);
  /*
    What they bought, by the same rule the orders page uses. `status !==
    'draft'` missed an order paid a second ago whose webhook had not landed,
    and a second copy of "is this real" is how two screens come to disagree
    about somebody's money.
  */
  const invoiced = orders.filter((order) => isPlaced(order));

  return (
    <>
      <PageTitle
        title="Billing"
        description="Your invoices, payment method and plan."
      />

      {/*
        One card, where there were three.

        **The plan card went** because there are no plans. Nobody can sign up
        to one, nothing charges for one, and the line under it - "7% discount
        applied automatically to every placement" - was a hardcoded sentence
        that was true of nobody. A promo code is the only discount there is.

        **The payment method card went** because no card is stored. Checkout
        runs in `mode: 'payment'` with no customer and no
        `setup_future_usage`, so Stripe keeps nothing to charge again; the
        Visa ending 4242 was a placeholder that had been sitting on a real
        customer's billing page saying otherwise. A screen claiming to hold
        somebody's card is worse than one that holds none.
      */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Billing contact</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-[14px] text-ink">{user.fullName}</p>
            <p className="mt-1 text-[13px] text-muted">{user.email}</p>
            <p className="mt-1 text-[13px] text-muted">{user.company}</p>
          </CardContent>
        </Card>
      </div>

      <section className="mt-8" aria-labelledby="invoices">
        <h2 id="invoices" className="mb-4 text-[15px] font-semibold text-ink">
          Invoices
        </h2>
        <TableWrap>
          <Table>
            <caption className="sr-only">Invoice history</caption>
            <thead>
              <tr>
                <Th>Invoice</Th>
                <Th className="hidden sm:table-cell">Order</Th>
                <Th>Date</Th>
                <Th>Status</Th>
                <Th className="text-right">Amount</Th>

              </tr>
            </thead>
            <tbody>
              {invoiced.map((order) => (
                <Tr key={order.id}>
                  <Td className="tabular text-[13px] font-medium text-ink">
                    {/* The reference as it is. The `replace('LM-', '')` here
                        was left over from the old prefix and had nothing to
                        strip, so it printed INV-PP-12753 either way. */}
                    INV-{order.reference}
                  </Td>
                  <Td className="tabular hidden text-[13px] text-ink-soft sm:table-cell">
                    {order.reference}
                  </Td>
                  <Td className="tabular text-[13px] whitespace-nowrap text-muted">
                    {formatDate(order.placedAt)}
                  </Td>
                  <Td>
                    {/* Read from the payment, not from the fulfilment status.
                        This said "Paid" for anything that was not a draft,
                        including an order whose payment failed - the same
                        sentence the orders table was getting wrong. */}
                    <PaymentBadge paymentStatus={order.paymentStatus} />
                  </Td>
                  {/* What was charged, including VAT, in the currency it was
                      charged in - an invoice showing the net is an invoice
                      that disagrees with the customer's card statement. */}
                  <Td className="tabular text-right text-[13px] font-semibold text-ink">
                    {formatPrice(order.chargedMinor ?? order.totalMinor, {
                      currency: order.currency,
                    })}
                  </Td>

                </Tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
        {/* The download button and "PDFs are generated once billing is
            connected" both went: billing is connected, nothing generates a
            PDF, and the button had been disabled since the day it was
            drawn. A control that has never worked is a promise. */}
        <p className="mt-3 flex items-center gap-1.5 text-[12px] text-muted">
          <Receipt className="h-3.5 w-3.5" aria-hidden="true" />
          Amounts are what was charged, including VAT where it applied.
        </p>
      </section>
    </>
  );
}
