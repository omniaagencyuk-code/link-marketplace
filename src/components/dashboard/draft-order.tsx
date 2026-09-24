'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { AlertCircle, ShoppingBag } from 'lucide-react';
import { startCheckoutAction } from '@/app/dashboard/orders/actions';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { DraftOrderItemCard } from './draft-order-item';
import { useOrderDraft } from '@/lib/providers/order-draft-provider';
import { formatPrice } from '@/lib/utils/format';
import { needsTopic } from '@/lib/utils/pricing';
import type { WebsiteListItem } from '@/lib/types';

/**
 * The current order, and the only place placement details are collected.
 *
 * Websites arrive here from the marketplace with everything blank; the buyer
 * fills in target URL, anchor text, landing page, notes and an optional
 * article per line.
 *
 * The total shown here is the browser's arithmetic and is only ever
 * indicative: checkout re-prices every line against the database before
 * charging, so a stale or edited basket cannot change what is paid.
 */
export function DraftOrder({ websites }: { websites: WebsiteListItem[] }) {
  const { items, totalMinor, incompleteCount, clear, hydrated } = useOrderDraft();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rejected, setRejected] = useState<{ websiteDomain: string; reason: string }[]>([]);

  /*
    Lines that still owe an answer about their topic.

    Counted here rather than in the draft provider because it needs the
    publisher's rates, and the provider deliberately knows nothing but what is
    in local storage. Checkout would reject these anyway - this is so the
    buyer finds out before being sent to Stripe rather than after.
  */
  const missingTopics = items.filter((item) => {
    const website = websites.find((candidate) => candidate.id === item.websiteId);
    return website ? needsTopic(website, item.serviceType) && !item.topic : false;
  }).length;

  function checkout() {
    setError(null);
    setRejected([]);
    startTransition(async () => {
      // On success this redirects to Stripe and never returns.
      const result = await startCheckoutAction(items);
      if (result?.error) setError(result.error);
      if (result?.rejected?.length) setRejected(result.rejected);
    });
  }

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
            {/* Not "excluding VAT" flatly: whether any is due depends on the
                billing address, which Stripe collects at checkout. A UK
                customer pays 20% on top; an overseas business giving a valid
                VAT number pays none. */}
            <span className="ml-2 text-[12px] text-muted">before VAT</span>
          </p>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/marketplace">Add more websites</Link>
            </Button>
            <Button
              variant="accent"
              size="sm"
              onClick={checkout}
              disabled={pending || incompleteCount > 0 || missingTopics > 0}
            >
              {pending ? 'Opening checkout...' : 'Checkout'}
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

        {missingTopics > 0 ? (
          <p className="mt-3 flex items-center gap-1.5 border-t border-line pt-3 text-[13px] text-negative">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {missingTopics} {missingTopics === 1 ? 'placement needs' : 'placements need'} a topic:
            those publishers charge different rates depending on the subject.
          </p>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="mt-3 flex items-start gap-1.5 border-t border-line pt-3 text-[13px] text-negative"
          >
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {error}
          </p>
        ) : null}

        {rejected.length > 0 ? (
          <ul className="mt-2 space-y-1 text-[13px] text-muted">
            {rejected.map((entry) => (
              <li key={entry.websiteDomain}>
                <span className="font-medium text-ink">{entry.websiteDomain}</span> - {entry.reason}
              </li>
            ))}
          </ul>
        ) : null}

        <p className="mt-3 text-[12px] text-muted">
          Your order is saved in this browser. Nothing is charged until you check out, and prices
          are confirmed against the marketplace at that point. VAT is worked out at checkout from
          your billing address and shown before you pay.
        </p>
      </div>
    </section>
  );
}
