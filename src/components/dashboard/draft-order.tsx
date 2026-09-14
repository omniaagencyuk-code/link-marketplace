'use client';

import Link from 'next/link';
import { AlertCircle, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { DraftOrderItemCard } from './draft-order-item';
import { useOrderDraft } from '@/lib/providers/order-draft-provider';
import { formatPrice } from '@/lib/utils/format';
import type { WebsiteListItem } from '@/lib/types';

/**
 * The current order, and the only place placement details are collected.
 *
 * Websites arrive here from the marketplace with everything blank; the buyer
 * fills in target URL, anchor text, landing page, notes and an optional
 * article per line. Checkout and payment are not connected yet.
 */
export function DraftOrder({ websites }: { websites: WebsiteListItem[] }) {
  const { items, totalMinor, incompleteCount, clear, hydrated } = useOrderDraft();

  if (!hydrated) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 2 }).map((_, index) => (
          <div
            key={index}
            className="h-64 animate-pulse rounded-[var(--radius-card)] border border-line bg-white"
          />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={ShoppingBag}
        title="Your order is empty"
        description="Add websites from the marketplace, then fill in the target URL and anchor text for each placement here."
        action={
          <Button asChild variant="accent">
            <Link href="/marketplace">Browse websites</Link>
          </Button>
        }
      />
    );
  }

  return (
    <section aria-labelledby="draft-order">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="draft-order" className="text-[15px] font-semibold text-ink">
          Current order
          <span className="ml-2 text-[13px] font-normal text-muted">
            ({items.length} {items.length === 1 ? 'placement' : 'placements'})
          </span>
        </h2>
        <Button variant="ghost" size="sm" onClick={clear}>
          Clear order
        </Button>
      </div>

      <ul className="space-y-3">
        {items.map((item, index) => (
          <DraftOrderItemCard
            key={item.id}
            item={item}
            index={index}
            website={websites.find((website) => website.id === item.websiteId)}
          />
        ))}
      </ul>

      <div className="mt-4 rounded-[var(--radius-card)] border border-line bg-white px-4 py-4 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="tabular text-[14px] text-ink-soft">
            Order total
            <span className="ml-2 text-[17px] font-semibold text-ink">
              {formatPrice(totalMinor)}
            </span>
            <span className="ml-2 text-[12px] text-muted">excluding VAT</span>
          </p>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/marketplace">Add more websites</Link>
            </Button>
            <Button
              variant="accent"
              size="sm"
              disabled
              title="Checkout ships with payments"
            >
              Submit order
            </Button>
          </div>
        </div>

        {incompleteCount > 0 ? (
          <p className="mt-3 flex items-center gap-1.5 border-t border-line pt-3 text-[13px] text-negative">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {incompleteCount} {incompleteCount === 1 ? 'placement needs' : 'placements need'} a
            target URL before this order can be submitted.
          </p>
        ) : null}

        <p className="mt-3 text-[12px] text-muted">
          Checkout is disabled in this build. Your order is saved on this device until payments are
          connected.
        </p>
      </div>
    </section>
  );
}
