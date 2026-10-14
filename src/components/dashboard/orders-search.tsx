'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import { OrdersTable } from './orders-table';
import type { Order } from '@/lib/types';

/**
 * The orders list, with a box to find one in it.
 *
 * ## Why filtering in the browser is right here, and usually is not
 *
 * The marketplace filters in the database because its table is paged, and a
 * filter over a page hides rows from the page it was handed. This page is
 * not paged: `OrdersPage` reads every order the account has and renders all
 * of them, so the browser genuinely holds the whole set and filtering it is
 * filtering everything.
 *
 * If this page ever starts paging, this has to move to the server on the
 * same day. A search box over page one of four is the bug, not the feature.
 *
 * ## What it matches
 *
 * Our reference, their reference, and the website - the three things
 * somebody actually remembers about an order they are looking for. Matching
 * the anchor text as well sounded useful and is not: an agency uses the same
 * anchor across a campaign, so it returns everything.
 */
export function OrdersSearch({ orders }: { orders: Order[] }) {
  const [term, setTerm] = useState('');

  const needle = term.trim().toLowerCase();
  const matching = needle
    ? orders.filter(
        (order) =>
          order.reference.toLowerCase().includes(needle) ||
          (order.customerReference ?? '').toLowerCase().includes(needle) ||
          order.items.some((item) => item.websiteDomain.toLowerCase().includes(needle)),
      )
    : orders;

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-80">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Find an order by reference or website..."
            aria-label="Find an order"
            className="h-9 w-full rounded-lg border border-line bg-white pr-3 pl-9 text-[13px] text-ink placeholder:text-muted focus:border-navy-900 focus:outline-none"
          />
        </div>
        {/* Both numbers whenever it is filtered, so a short list never reads
            as orders having gone missing. */}
        {needle ? (
          <p role="status" className="tabular text-[13px] text-muted">
            <span className="font-semibold text-ink">{matching.length}</span> of {orders.length}
          </p>
        ) : null}
      </div>

      {matching.length === 0 ? (
        <p className="rounded-[var(--radius-card)] border border-line bg-white px-4 py-8 text-center text-[13px] text-muted shadow-[var(--shadow-card)]">
          No orders match &ldquo;{term}&rdquo;. Nothing has been deleted - clear the box to see
          them all.
        </p>
      ) : (
        <OrdersTable orders={matching} />
      )}
    </>
  );
}
