'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Select } from '@/components/ui/select';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { setOrderStatusAction } from '@/app/admin/actions';
import { formatDate, formatPrice } from '@/lib/utils/format';
import { linkTypeLabels, orderStatusLabels } from '@/lib/utils/labels';
import type { Order, OrderStatus } from '@/lib/types';

const statusOptions = Object.entries(orderStatusLabels) as [OrderStatus, string][];

export function AdminOrdersTable({ orders }: { orders: Order[] }) {
  const [filter, setFilter] = useState<OrderStatus | 'all'>('all');
  const [pending, startTransition] = useTransition();

  const rows = orders.filter((order) => filter === 'all' || order.status === filter);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-48">
          <label htmlFor="order-filter" className="sr-only">
            Filter orders by status
          </label>
          <Select
            id="order-filter"
            size="sm"
            value={filter}
            onChange={(event) => setFilter(event.target.value as OrderStatus | 'all')}
          >
            <option value="all">All statuses</option>
            {statusOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        <p className="tabular text-[13px] text-muted">{rows.length} orders</p>
      </div>

      <TableWrap>
        <Table>
          <caption className="sr-only">Customer orders</caption>
          <thead>
            <tr>
              <Th>Order ID</Th>
              <Th>Customer</Th>
              <Th>Website</Th>
              <Th className="hidden lg:table-cell">Service</Th>
              <Th className="hidden md:table-cell">Date</Th>
              <Th className="text-right">Amount</Th>
              <Th className="w-44">Status</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((order) => (
              <Tr key={order.id}>
                <Td className="tabular text-[13px] font-medium text-ink">{order.reference}</Td>
                <Td>
                  <p className="text-[13px] text-ink">{order.customerName}</p>
                  <p className="truncate text-[11px] text-muted">{order.customerEmail}</p>
                </Td>
                <Td>
                  <ul className="space-y-0.5">
                    {order.items.map((item) => (
                      <li key={item.id}>
                        <Link
                          href={`/websites/${item.websiteSlug}`}
                          className="text-[13px] text-ink hover:text-accent-700"
                        >
                          {item.websiteDomain}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Td>
                <Td className="hidden text-[13px] text-ink-soft lg:table-cell">
                  {Array.from(new Set(order.items.map((item) => linkTypeLabels[item.serviceType]))).join(
                    ', ',
                  )}
                </Td>
                <Td className="tabular hidden text-[13px] whitespace-nowrap text-muted md:table-cell">
                  {formatDate(order.placedAt)}
                </Td>
                <Td className="tabular text-right text-[13px] font-semibold text-ink">
                  {formatPrice(order.totalMinor)}
                </Td>
                <Td>
                  <label htmlFor={`status-${order.id}`} className="sr-only">
                    Status for order {order.reference}
                  </label>
                  <Select
                    id={`status-${order.id}`}
                    size="sm"
                    value={order.status}
                    disabled={pending}
                    onChange={(event) =>
                      startTransition(() =>
                        setOrderStatusAction(order.id, event.target.value as OrderStatus),
                      )
                    }
                  >
                    {statusOptions.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>
    </div>
  );
}
