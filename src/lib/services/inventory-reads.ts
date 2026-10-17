import { getAdminClient } from '@/lib/supabase/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { INVENTORY_BUDGET } from '@/lib/marketplace/budget';

/**
 * What the inventory budget has been doing.
 *
 * 0090 gave every account an hourly ceiling and refuses past it with "try
 * again shortly", which is the right thing to say to a customer and the
 * wrong thing to be the only record. This is the admin half - the same
 * split `mayRunGap` and `describeForAdmin` have, where the refusal says
 * nothing about our figures and the admin screen says all of them.
 *
 * Two questions, and they are not the same question:
 *
 *   * **Who is close to the ceiling right now?** From the live counter, so
 *     it answers "is anybody about to be stopped" before they are.
 *   * **Who has been stopped?** From `inventory_refusals`, because the
 *     counter resets hourly and a refusal at two is gone by three.
 *
 * The second is the one support needs and the one that says whether two
 * thousand rows an hour is the right number. If the only names in it are
 * customers nobody suspects, the limit is too tight.
 */

export interface InventoryAccount {
  /** Null when a bucket does not carry one, rather than a guess. */
  userId: string | null;
  label: string;
  rows: number;
  /** When the window rolls, for a spender; when it happened, for a refusal. */
  at: string;
}

export interface InventoryReadReport {
  capRows: number;
  windowHours: number;
  spenders: InventoryAccount[];
  refusals: InventoryAccount[];
  /** Every refusal ever recorded. Printed so growth is noticed rather than found. */
  refusalsEver: number;
  /** A failed read and a quiet week have to look different. */
  failed: boolean;
}

const EMPTY: InventoryReadReport = {
  capRows: INVENTORY_BUDGET.maxRows,
  windowHours: INVENTORY_BUDGET.windowSeconds / 3600,
  spenders: [],
  refusals: [],
  refusalsEver: 0,
  failed: false,
};

/** `inventory-rows:<uuid>` back to the uuid, or null if it is not one. */
function accountFrom(bucket: string): string | null {
  const id = bucket.slice(bucket.indexOf(':') + 1);
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

export async function inventoryReadReport(): Promise<InventoryReadReport> {
  if (!isSupabaseEnabled()) return EMPTY;
  const supabase = getAdminClient();
  if (!supabase) return EMPTY;

  try {
    const now = new Date().toISOString();
    const [live, refused, total] = await Promise.all([
      supabase
        .from('rate_limits')
        .select('bucket, count, expires_at')
        .like('bucket', `${INVENTORY_BUDGET.bucket}:%`)
        .gt('expires_at', now)
        .order('count', { ascending: false })
        .limit(10),
      supabase
        .from('inventory_refusals')
        .select('bucket, rows_asked, refused_at')
        .order('refused_at', { ascending: false })
        .limit(20),
      supabase.from('inventory_refusals').select('id', { count: 'exact', head: true }),
    ]);

    if (live.error || refused.error) return { ...EMPTY, failed: true };

    const rows = [...(live.data ?? []), ...(refused.data ?? [])] as { bucket: string }[];
    const ids = [...new Set(rows.map((row) => accountFrom(row.bucket)).filter(Boolean))] as string[];

    /*
      One read for the names, not one per row.

      An admin screen that makes a query per line is the shape that stops
      working at the moment somebody is actually interested in it.
    */
    const names = new Map<string, string>();
    if (ids.length) {
      const { data } = await supabase.from('profiles').select('id, email, name').in('id', ids);
      for (const row of (data ?? []) as { id: string; email?: string; name?: string }[]) {
        names.set(row.id, row.name ? `${row.name} (${row.email ?? ''})` : (row.email ?? row.id));
      }
    }

    const label = (bucket: string) => {
      const id = accountFrom(bucket);
      if (!id) return bucket;
      return names.get(id) ?? id;
    };

    return {
      ...EMPTY,
      spenders: (live.data ?? []).map((row) => ({
        userId: accountFrom(row.bucket as string),
        label: label(row.bucket as string),
        rows: Number(row.count ?? 0),
        at: String(row.expires_at),
      })),
      refusals: (refused.data ?? []).map((row) => ({
        userId: accountFrom(row.bucket as string),
        label: label(row.bucket as string),
        rows: Number(row.rows_asked ?? 0),
        at: String(row.refused_at),
      })),
      refusalsEver: total.count ?? 0,
    };
  } catch {
    return { ...EMPTY, failed: true };
  }
}
