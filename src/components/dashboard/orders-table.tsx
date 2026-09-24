import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { OrderStatusBadge } from '@/components/shared/status-badge';
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
              <Td className="tabular text-[13px] font-medium text-ink">{order.reference}</Td>
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
                <OrderStatusBadge status={item.status} paymentStatus={order.paymentStatus} />
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
