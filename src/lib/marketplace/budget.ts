import { getAdminClient } from '@/lib/supabase/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';

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
 * ## Why two thousand
 *
 * The marketplace shows twenty-four to a page. Somebody shortlisting hard -
 * twenty pages, a dozen listings opened, a saved-sites sweep - spends a few
 * hundred. Two thousand is several times that and a sixth of the inventory,
 * so an account would need six clean hours to see all of it once, and a week
 * of them to keep a copy current. It is deliberately not tight: a limit that
 * a real customer meets is a limit that gets raised until it means nothing.
 *
 * It is a constant rather than a setting because a number in the admin is a
 * number somebody raises on a busy Monday. Changing it is a deploy, which is
 * the right amount of friction for the thing standing between our inventory
 * and a competitor's spreadsheet.
 */
export const INVENTORY_BUDGET = {
  /** Shares the `rate_limits` table; this prefix keeps it apart from sign-in. */
  bucket: 'inventory-rows',
  maxRows: 2000,
  windowSeconds: 3600,
} as const;

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
 * ## What the customer is told
 *
 * "Try again shortly", and nothing else. Not the limit, not what they have
 * spent, not how long is left - the rule `mayRunGap` follows, and for a
 * sharper reason here: a refusal that quotes the number is a refusal that
 * teaches somebody exactly how to stay underneath it. The seconds come back
 * from the function for the log, not for the page.
 */
export async function spendInventoryRows(
  userId: string | null | undefined,
  rows: number,
): Promise<BudgetAnswer> {
  /*
    No account, nothing to charge.

    Every caller is behind `requireCustomerSession`, so this is the shape of
    a bug rather than a visitor - and the right answer to a bug here is to
    serve the page, not to refuse a customer because we lost track of who
    they were.
  */
  if (!userId) return ALLOWED;
  if (rows <= 0) return ALLOWED;
  if (!isSupabaseEnabled()) return ALLOWED;

  const supabase = getAdminClient();
  if (!supabase) return ALLOWED;

  try {
    const { data, error } = await supabase.rpc('spend_inventory_budget', {
      p_bucket: `${INVENTORY_BUDGET.bucket}:${userId}`,
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
