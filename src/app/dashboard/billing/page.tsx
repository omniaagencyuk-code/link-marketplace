import type { Metadata } from 'next';
import { CreditCard, Download, Receipt } from 'lucide-react';
import { PageTitle } from '@/components/dashboard/page-title';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { orderService } from '@/lib/services';
import { requireCustomerSession } from '@/lib/auth/customer-access';
import { formatDate, formatPrice } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'Billing' };

export default async function BillingPage() {
  const user = await requireCustomerSession('/dashboard/billing');
  const orders = await orderService.getByUser(user.id);
  const invoiced = orders.filter((order) => order.status !== 'draft');

  return (
    <>
      <PageTitle
        title="Billing"
        description="Invoices, payment method and plan. Payments are not processed in this build."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Current plan</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold text-ink capitalize">{user.plan}</p>
            <p className="mt-1 text-[13px] text-muted">
              7% discount applied automatically to every placement.
            </p>
            <Button variant="outline" size="sm" className="mt-4">
              Change plan
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payment method</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="flex items-center gap-2 text-[14px] text-ink">
              <CreditCard className="h-4 w-4 text-muted" aria-hidden="true" />
              Visa ending 4242
            </p>
            <p className="mt-1 text-[13px] text-muted">Expires 09/2029</p>
            <Button variant="outline" size="sm" className="mt-4" disabled>
              Update card
            </Button>
          </CardContent>
        </Card>

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
                <Th className="text-right">
                  <span className="sr-only">Download</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {invoiced.map((order) => (
                <Tr key={order.id}>
                  <Td className="tabular text-[13px] font-medium text-ink">
                    INV-{order.reference.replace('LM-', '')}
                  </Td>
                  <Td className="tabular hidden text-[13px] text-ink-soft sm:table-cell">
                    {order.reference}
                  </Td>
                  <Td className="tabular text-[13px] whitespace-nowrap text-muted">
                    {formatDate(order.placedAt)}
                  </Td>
                  <Td>
                    <Badge tone={order.status === 'cancelled' ? 'neutral' : 'positive'}>
                      {order.status === 'cancelled' ? 'Refunded' : 'Paid'}
                    </Badge>
                  </Td>
                  <Td className="tabular text-right text-[13px] font-semibold text-ink">
                    {formatPrice(order.totalMinor)}
                  </Td>
                  <Td className="text-right">
                    <Button variant="ghost" size="icon-sm" aria-label="Download invoice" disabled>
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
        <p className="mt-3 flex items-center gap-1.5 text-[12px] text-muted">
          <Receipt className="h-3.5 w-3.5" aria-hidden="true" />
          Invoice PDFs are generated once billing is connected.
        </p>
      </section>
    </>
  );
}
