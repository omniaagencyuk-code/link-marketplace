'use server';

import { getCurrentUser } from '@/lib/auth/customer-access';
import { clearInventoryBudget } from '@/lib/marketplace/budget';

/**
 * A customer has put a listing in their basket.
 *
 * The only thing this does is forget what their account has spent against
 * the inventory budget this hour. The basket itself is still entirely in
 * the browser - `OrderDraftProvider` keeps it in local storage and nothing
 * is written until an order is submitted - so this is not a step in buying
 * anything, and nothing about the basket waits on it or fails with it.
 *
 * ## Why it exists
 *
 * 0090's budget is there to make copying the inventory slow. Somebody
 * choosing what to buy is the customer the marketplace is for, so stopping
 * them is the guard doing the opposite of its job - which is what happened,
 * and what `budget.ts` now says in as many words.
 *
 * ## Why it is safe to be callable
 *
 * It is not safe in the sense of being unabusable: it is a reset anybody
 * with an account can ask for, and `clearInventoryBudget` says what that
 * costs. What it cannot do is reach anything else. It takes no arguments,
 * so the only account it can clear is the one in the session; and the
 * function underneath refuses any bucket outside the `inventory-rows`
 * prefix, so a customer's happy path cannot touch the sign-in throttle.
 *
 * `getCurrentUser` rather than `requireCustomerSession`: that one redirects,
 * and redirecting a background call made while somebody clicks Add would
 * throw inside their basket. No session, nothing to clear, nothing to say.
 */
export async function basketGrewAction(): Promise<void> {
  const user = await getCurrentUser();
  await clearInventoryBudget(user?.id);
}
