import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { OrderStatusBadge, PaymentBadge } from '@/components/shared/status-badge';
import { formatDate, formatPrice } from '@/lib/utils/format';
import { linkTypeLabels } from '@/lib/utils/labels';
import { acceptedNicheLabel } from '@/lib/config/accepted-niches';
import type { Order } from '@/lib/types';

/** Flattened order-item view used on the dashboard and orders page. */
export function OrdersTable({ orders, limit }: { orders: Order[]; limit?: number }) {
  const rows = orders
    .flatMap((order) => order.items.map((item) => ({ order, item })))
    .slice(0, limit);

  return (
    <TableWrap>
      <Table>
        <caption className="sr-only">Your orders</caption>
        <thead>
          <tr>
            <Th>Order</Th>
            <Th>Website</Th>
            <Th className="hidden sm:table-cell">Service</Th>
            <Th className="hidden lg:table-cell">Anchor text</Th>
            <Th className="hidden md:table-cell">Date</Th>
            <Th>Status</Th>
            <Th className="text-right">Amount</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ order, item }) => (
            <Tr key={item.id}>
              <Td className="tabular text-[13px] font-medium">
                <Link
                  href={`/dashboard/orders/${order.id}`}
                  className="text-ink hover:text-accent-700"
                >
                  {order.reference}
                </Link>
                {/*
                  Theirs under ours. An agency with one login and five people
                  ordering through it reads this column looking for their own
                  work, and every row's company name is the same - so the
                  label somebody typed is the only thing that tells them
                  apart. Ours stays the link, because ours is what support
                  quotes.
                */}
                {order.customerReference ? (
                  <span
                    className="mt-0.5 block max-w-[14rem] truncate text-[11px] font-normal text-muted"
                    title={order.customerReference}
                  >
                    {order.customerReference}
                  </span>
                ) : null}
                {/* Where the customer has something to do, say so here: the
                    table is the page they land on, not the detail view. */}
                {item.deliveredAt && item.approval !== 'approved' ? (
                  <span className="mt-0.5 block text-[11px] font-normal text-accent-700">
                    {item.approval === 'issue-raised' ? 'Problem reported' : 'Check it over'}
                  </span>
                ) : null}
              </Td>
              <Td>
                <Link
                  href={`/websites/${item.websiteSlug}`}
                  className="text-[13px] font-medium text-ink hover:text-accent-700"
                >
                  {item.websiteDomain}
                </Link>
                {item.liveUrl ? (
                  <a
                    href={item.liveUrl}
                    rel="noreferrer noopener"
                    className="mt-0.5 flex items-center gap-1 text-[11px] text-accent-700 hover:underline"
                  >
                    View live placement
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                ) : (
                  <p className="mt-0.5 truncate text-[11px] text-muted">{item.targetUrl}</p>
                )}
              </Td>
              <Td className="hidden text-[13px] text-ink-soft sm:table-cell">
                {linkTypeLabels[item.serviceType]}
                {/* What they declared, where it set the price they paid. */}
                {item.topic ? (
                  <span className="mt-0.5 block text-[11px] text-muted">
                    {acceptedNicheLabel(item.topic)}
                  </span>
                ) : null}
              </Td>
              <Td className="hidden max-w-40 truncate text-[13px] text-ink-soft lg:table-cell">
                {item.anchorText || '—'}
              </Td>
              <Td className="tabular hidden text-[13px] whitespace-nowrap text-muted md:table-cell">
                {formatDate(order.placedAt)}
              </Td>
              <Td>
                <div className="flex flex-col items-start gap-1">
                  <OrderStatusBadge status={item.status} paymentStatus={order.paymentStatus} />
                  {/*
                    Beside the status, not folded into it. "Awaiting Content"
                    answers where the work is; it says nothing about whether
                    the customer's money arrived, which is the thing they
                    came to this page to check.
                  */}
                  <PaymentBadge
                    paymentStatus={order.paymentStatus}
                    amount={formatPrice(order.chargedMinor ?? order.totalMinor, {
                      currency: order.currency,
                    })}
                  />
                </div>
              </Td>
              <Td className="tabular text-right text-[13px] font-semibold text-ink">
                {formatPrice(item.priceMinor)}
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </TableWrap>
  );
}
