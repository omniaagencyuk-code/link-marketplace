import { getAdminClient } from '@/lib/supabase/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { getSharedPasswordAdmin, type AdminSession } from '@/lib/auth/admin-access';
import type { UserProfile } from '@/lib/types';

/**
 * How much of the inventory one account may be served in an hour.
 *
 * 0090 closed the fast way of taking it: the publishable key no longer reads
 * `websites` at all, so there is no thousand-row request and no PostgREST. A
 * determined reader is left with the slow way - drive the pages, collect what
 * renders - and this is what makes that slow too.
 *
 * ## Rows rather than requests
 *
 * A request is whatever page size somebody asks for; a row is the thing they
 * are collecting. Charging per row means asking for a hundred at a time costs
 * a hundred, which is the whole difference between a limit and a speed bump.
 *
 * ## Why six thousand
 *
 * It was two, and the sentence above - "a limit that a real customer meets
 * is a limit that gets raised until it means nothing" - turned out to be a
 * prediction rather than a principle. The first account it stopped was one
 * of ours, doing nothing but looking at the marketplace.
 *
 * The marketplace shows twenty-four to a page. Somebody shortlisting hard -
 * twenty pages, a dozen listings opened, a saved-sites sweep - spends a few
 * hundred, so two thousand was only ever a few times a real session and the
 * margin was thinner than the arithmetic suggested. Six thousand is half the
 * inventory in an hour: two clean hours to see all of it once rather than
 * six. That is a weaker guard, and it is the right trade - the guard exists
 * so that copying the inventory is slow, not so that reading it is.
 *
 * It is a constant rather than a setting because a number in the admin is a
 * number somebody raises on a busy Monday. Changing it is a deploy, which is
 * the right amount of friction for the thing standing between our inventory
 * and a competitor's spreadsheet.
 */
export const INVENTORY_BUDGET = {
  /** Shares the `rate_limits` table; this prefix keeps it apart from sign-in. */
  bucket: 'inventory-rows',
  maxRows: 6000,
  windowSeconds: 3600,
} as const;

/** The `rate_limits` key one account's inventory spend is counted under. */
export function inventoryBucket(userId: string): string {
  return `${INVENTORY_BUDGET.bucket}:${userId}`;
}

export interface BudgetAnswer {
  allowed: boolean;
  /** What to tell the customer. Never our figures - see below. */
  message?: string;
}

const ALLOWED: BudgetAnswer = { allowed: true };

/**
 * Spend rows against an account's budget, and say whether the read may run.
 *
 * ## It fails open
 *
 * If the counter is unreachable the read goes ahead. The same choice
 * `consumeRateLimit` makes, for the same reason: refusing to show a paying
 * customer the marketplace because a counter hiccupped is a worse day than
 * the one where somebody scrapes a little faster than they should.
 *
 * ## An administrator is never charged
 *
 * Checked before anything else, and it is not a convenience. This guard
 * exists to slow a stranger copying the inventory; an administrator already
 * has the admin screens, where the whole table is one export away. Charging
 * them buys nothing and costs the one thing the guard must never do, which
 * is stop the people who have to look at the marketplace to run it.
 *
 * It takes the viewer rather than fetching one, and that is a cost
 * decision as much as a design one. `getAdminSession` answers this
 * perfectly and answers it with `auth.getUser()` plus a `profiles` read -
 * two round trips to London on every marketplace page view, for every
 * customer, to be told they are not an administrator. The page already
 * holds the answer: `getCurrentUser` is request-cached and carries
 * `profiles.role`, which is the same column `getAdminSession` reads. So
 * the free half is asked here and the cookie-only half - the transitional
 * shared password, which touches no network - is the only fallback.
 *
 * It is still a role on a session rather than a list of addresses, so an
 * administrator who loses the role loses the exemption on their next
 * request.
 *
 * ## What the customer is told
 *
 * "Try again shortly", and nothing else. Not the limit, not what they have
 * spent, not how long is left - the rule `mayRunGap` follows, and for a
 * sharper reason here: a refusal that quotes the number is a refusal that
 * teaches somebody exactly how to stay underneath it. The seconds come back
 * from the function for the log, not for the page.
 */
export async function spendInventoryRows(
  viewer: Pick<UserProfile, 'id' | 'role'> | null | undefined,
  rows: number,
): Promise<BudgetAnswer> {
  const userId = viewer?.id;
  /*
    No account, nothing to charge.

    Every caller is behind `requireCustomerSession`, so this is the shape of
    a bug rather than a visitor - and the right answer to a bug here is to
    serve the page, not to refuse a customer because we lost track of who
    they were.
  */
  if (!userId) return ALLOWED;
  if (rows <= 0) return ALLOWED;
  if (await isExemptFromBudget(viewer)) return ALLOWED;
  if (!isSupabaseEnabled()) return ALLOWED;

  const supabase = getAdminClient();
  if (!supabase) return ALLOWED;

  try {
    const { data, error } = await supabase.rpc('spend_inventory_budget', {
      p_bucket: inventoryBucket(userId),
      p_rows: rows,
      p_max: INVENTORY_BUDGET.maxRows,
      p_window_seconds: INVENTORY_BUDGET.windowSeconds,
    });

    if (error) return ALLOWED;

    const retryAfter = typeof data === 'number' ? data : 0;
    if (retryAfter <= 0) return ALLOWED;

    return {
      allowed: false,
      message:
        'You have opened a lot of listings in the last hour. The marketplace will be back shortly - nothing is wrong with your account.',
    };
  } catch {
    return ALLOWED;
  }
}

/**
 * Who is never charged, as a rule rather than a lookup.
 *
 * A verified administrator, by either route into the admin: the account
 * carrying `role = 'admin'` on its own profile, and the transitional
 * shared password. Both prove the same thing, and exempting only the first
 * would stop the team the second exists to keep working.
 *
 * What it takes is proof, which is the part worth writing down. An address
 * in `ADMIN_EMAILS` is not an administrator; a customer account whose email
 * happens to be on that list is not one either. Only the role the database
 * holds, or a signed admin cookie that `getSharedPasswordAdmin` has already
 * verified against the allowlist, gets past this.
 */
export function exemptFromBudget(
  viewer: Pick<UserProfile, 'role'> | null | undefined,
  admin: AdminSession | null,
): boolean {
  return viewer?.role === 'admin' || admin !== null;
}

/**
 * The same question, asked of the request in hand.
 *
 * The role is already in hand and costs nothing. The cookie is only read
 * when it is not an admin's, and reading it is a signature check rather
 * than a round trip - so a customer's marketplace page is no slower than
 * it was before any of this.
 *
 * Fails *closed*, unlike everything else here: a thrown session read means
 * we do not know who this is, and the safe answer to that is to charge
 * them. Being charged is a counter going up, which the budget's own
 * fail-open already handles; wrongly exempting is a hole.
 */
export async function isExemptFromBudget(
  viewer: Pick<UserProfile, 'role'> | null | undefined,
): Promise<boolean> {
  if (viewer?.role === 'admin') return true;
  try {
    return exemptFromBudget(viewer, await getSharedPasswordAdmin());
  } catch {
    return false;
  }
}

/**
 * Forget what this account has spent this hour.
 *
 * Called when a customer puts a listing in their basket. The budget is
 * there to make copying the inventory slow, and somebody choosing what to
 * buy is the person the marketplace is for - stopping them is the guard
 * doing the opposite of its job, which is how this one came to be raised in
 * the first place.
 *
 * **What this gives up, said plainly.** A reset anybody can ask for is a
 * ceiling anybody can lift: somebody collecting the inventory can add a
 * listing to their basket every few hundred rows and never meet the limit
 * again. The budget is now a guard against a reader who never touches the
 * basket, which is a real but much smaller class than it was. It is the
 * deliberate shape of what was asked for, and `inventory_refusals` plus the
 * live counters on /admin/diagnostics are still where that would show up.
 *
 * It clears rather than crediting back: the question this answers is "is
 * this person buying?", and the answer is not worth expressing in rows.
 *
 * Never throws and never reports. The caller is a customer putting
 * something in a basket, and nothing about their basket should fail because
 * a counter did.
 */
export async function clearInventoryBudget(
  userId: string | null | undefined,
): Promise<void> {
  if (!userId) return;
  if (!isSupabaseEnabled()) return;

  const supabase = getAdminClient();
  if (!supabase) return;

  try {
    await supabase.rpc('clear_inventory_budget', { p_bucket: inventoryBucket(userId) });
  } catch {
    // Nothing to do and nobody to tell: the next read simply costs as before.
  }
}
