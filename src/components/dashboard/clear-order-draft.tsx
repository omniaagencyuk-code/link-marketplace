'use client';

import { useEffect } from 'react';
import { useOrderDraft } from '@/lib/providers/order-draft-provider';

/**
 * Empties the basket once an order has been paid for.
 *
 * The basket lives in this browser, so the server cannot clear it - and
 * leaving it full after checkout would invite the customer to pay twice for
 * the same placements.
 *
 * Runs on the confirmation page only, which is reached after Stripe redirects
 * back. Someone who abandons checkout returns to the basket page instead and
 * keeps their items, which is what they would expect.
 */
export function ClearOrderDraft() {
  const { clear, hydrated, count } = useOrderDraft();

  useEffect(() => {
    // Waits for hydration: clearing before the stored basket has loaded would
    // write an empty value over it and then be undone by the load.
    if (hydrated && count > 0) clear();
  }, [hydrated, count, clear]);

  return null;
}
