'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { Select } from '@/components/ui/select';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { adminOrderPageAction, setOrderStatusAction } from '@/app/admin/actions';
import { DEFAULT_PAGE_SIZE, type PageSize } from '@/lib/admin/paging';
import { formatDate, formatPrice } from '@/lib/utils/format';
import { linkTypeLabels, orderStatusLabels } from '@/lib/utils/labels';
import type { Order, OrderStatus } from '@/lib/types';

const statusOptions = Object.entries(orderStatusLabels) as [OrderStatus, string][];

/** Long enough that typing a reference is one query rather than twelve. */
const SEARCH_PAUSE_MS = 300;

/**
 * The admin order table, a page at a time.
 *
 * This was handed every order - with every item and every issue joined on -
 * and rendered all of them into one table with no paging. Two problems, and
 * only one of them was visible:
 *
 *   * Thirteen hundred rows of DOM, each carrying a status `<select>`.
 *   * The read behind it is capped by PostgREST at a thousand rows with
 *     nothing in the response saying so. Ordered newest first, what went
 *     missing was the oldest - so the table stayed plausible while it
 *     stopped being complete, and the count above it read the cap.
 *
 * The status filter is unchanged in meaning and answered by the database
 * now. The search is new: it was not possible before, because filtering an
 * array of every order is the thing that could not keep working.
 */
export function AdminOrdersTable() {
  const [typed, setTyped] = useState('');
  const [term, setTerm] = useState('');
  const [status, setStatus] = useState<OrderStatus | 'all'>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  const [pending, startTransition] = useTransition();

  /** Bumped after a status change, so the page is re-read rather than guessed. */
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setTerm(typed), SEARCH_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [typed]);

  interface Answer {
    /** The query this answer is for. Anything else on screen is stale. */
    key: string;
    items: Order[];
    total: number;
    failed: boolean;
  }

  const [answer, setAnswer] = useState<Answer | null>(null);

  const queryKey = JSON.stringify([term, status, page, pageSize, reloadKey]);
  const current = answer?.key === queryKey ? answer : null;

  /*
    Derived rather than set.

    A `loading` flag assigned inside the effect is a second render for every
    change and React's own lint rule refuses it. Whether the answer on hand
    is the answer being asked for is the same fact without the extra render.
  */
  const loading = current === null;
  const total = current?.total ?? 0;
  const failed = current?.failed ?? false;

  // Memoised: `?? []` is a fresh array each render while the answer is stale,
  // and everything downstream of it would recompute with it.
  const rows = useMemo(() => current?.items ?? [], [current]);

  useEffect(() => {
    let live = true;
    adminOrderPageAction({ search: term, status, page, pageSize: pageSize || DEFAULT_PAGE_SIZE })
      .then((found) => {
        if (!live) return;
        setAnswer({ key: queryKey, items: found.items as Order[], total: found.total, failed: false });
      })
      .catch(() => {
        /*
          An empty table and a failure have to look different.

          The read this replaces discarded its error, so a query that failed
          rendered as a marketplace that had never sold anything. Nobody
          would report that as a bug; they would report it as no orders.
        */
        if (!live) return;
        setAnswer({ key: queryKey, items: [], total: 0, failed: true });
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);

  const size = pageSize || DEFAULT_PAGE_SIZE;
  const pages = Math.max(1, Math.ceil(total / size));
  const paged = {
    rows,
    page: Math.min(page, pages),
    pages,
    total,
    from: total === 0 ? 0 : (Math.min(page, pages) - 1) * size + 1,
    to: (Math.min(page, pages) - 1) * size + rows.length,
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-64">
          <label htmlFor="order-search" className="sr-only">
            Search orders
          </label>
          <Input
            id="order-search"
            type="search"
            className="h-9 text-[13px]"
            placeholder="Reference, customer or domain"
            value={typed}
            onChange={(event) => {
              setTyped(event.target.value);
              // Back to the first page: a new search on page seven shows
              // whatever happens to be seventh, which nobody asked for.
              setPage(1);
            }}
          />
        </div>
        <div className="w-48">
          <label htmlFor="order-filter" className="sr-only">
            Filter orders by status
          </label>
          <Select
            id="order-filter"
            size="sm"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as OrderStatus | 'all');
              setPage(1);
            }}
          >
            <option value="all">All statuses</option>
            {statusOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        {/*
          The total, which is now the real one.

          This printed `rows.length` - the length of a capped array - so it
          said "1000 orders" against a larger book. It is counted in the
          database and reported alongside what is on screen.
        */}
        <p className="tabular text-[13px] text-muted" aria-live="polite">
          {failed ? 'Could not load the order list.' : loading ? 'Loading…' : `${total} orders`}
        </p>
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
              <Th className="w-20 text-right">
                <span className="sr-only">Open</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <Tr>
                <Td colSpan={8} className="py-10 text-center text-[13px] text-muted">
                  {failed
                    ? 'Could not load the order list. Try again, or reload the page.'
                    : loading
                      ? 'Loading orders…'
                      : 'No orders match this search.'}
                </Td>
              </Tr>
            ) : null}
            {rows.map((order) => (
              <Tr key={order.id}>
                <Td className="tabular text-[13px] font-medium">
                  {/* The row's way in: cost prices and the publisher's
                      address live on the order rather than in this list. */}
                  <Link
                    href={`/admin/orders/${order.id}`}
                    className="text-ink hover:text-accent-700"
                  >
                    {order.reference}
                  </Link>
                </Td>
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
                      startTransition(async () => {
                        await setOrderStatusAction(order.id, event.target.value as OrderStatus);
                        /*
                          Re-read rather than patch the row in place.

                          The page is a filter's worth of orders, and a
                          status change can move an order out of it. Editing
                          the local copy would leave it sitting under a
                          filter it no longer matches.
                        */
                        setReloadKey((key) => key + 1);
                      })
                    }
                  >
                    {statusOptions.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Td>
                <Td className="text-right">
                  <Link
                    href={`/admin/orders/${order.id}`}
                    className="text-[13px] font-medium text-accent-700 hover:underline"
                  >
                    Open
                  </Link>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>

      <Pagination
        paged={paged}
        size={pageSize}
        noun="orders"
        /*
          No "All". The database pages this table, and "all" here is a
          request for every order with every item joined on - the read that
          was capped at a thousand in the first place.
        */
        allowAll={false}
        onPage={setPage}
        onSize={(next) => {
          setPageSize(next);
          setPage(1);
        }}
      />
    </div>
  );
}
