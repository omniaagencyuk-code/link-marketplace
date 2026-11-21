'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useOrderDraft } from '@/lib/providers/order-draft-provider';
import type { DraftOrderItem } from '@/lib/types';

type NewLine = Omit<DraftOrderItem, 'id' | 'addedAt'>;

/**
 * Put a package's placements into the basket.
 *
 * The basket is local storage, so this is the client's job rather than a
 * server action - `OrderDraftProvider` owns it and the marketplace's own Add
 * button goes through the same `add`.
 *
 * ## A site already in the basket is not added twice
 *
 * `has` is the provider's own test, and the marketplace's selection bar uses
 * it for the same purpose. Somebody who shortlisted three sites by hand and
 * then took a package would otherwise find those three in their order twice,
 * at twice the price, with nothing on the page explaining why.
 *
 * ## Nothing is bought here
 *
 * The lines arrive with no target URL and no anchor text, which the basket
 * requires before it will submit - and where a publisher prices topics
 * apart, a blank topic blocks that line rather than quietly billing the
 * standard rate. So this fills the order in and hands it over; what gets
 * paid for is still what the buyer presses the button on.
 */
export function AddPackageToOrder({
  lines,
  count,
}: {
  lines: NewLine[];
  count: number;
}) {
  const { add, has, hydrated } = useOrderDraft();
  const router = useRouter();
  const [working, setWorking] = useState(false);

  const onClick = () => {
    setWorking(true);

    const added = lines.filter((line) => !has(line.websiteId));
    for (const line of added) add(line);

    router.push('/dashboard/orders');
  };

  return (
    <Button onClick={onClick} disabled={!hydrated || working} size="lg">
      {working ? 'Adding…' : `Add these ${count} placements to my order`}
    </Button>
  );
}
