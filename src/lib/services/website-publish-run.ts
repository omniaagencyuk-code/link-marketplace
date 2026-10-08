import { getAdminScopedClient } from '@/lib/supabase/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { publishBlocker, publishBlockerMessage } from '@/lib/websites/publishing';
import type { TrueCostIndex } from '@/lib/utils/margin';
import { pricingService } from './pricing-service';
import { supabaseWebsiteRepository } from './supabase/website-repository';

/**
 * Publishing the backlog, a slice at a time.
 *
 * 7,174 draft listings are priced and ready. The admin table publishes
 * twenty-five per request, and each listing costs about four round trips -
 * read it, read its true costs, check, update - so the backlog is the best
 * part of an hour with a tab that has to stay open, and it starts by asking
 * somebody to select seven thousand rows in a table that shows twenty-five.
 *
 * One press starts a run and cron carries it on, whether or not anybody is
 * still logged in. The shape is the approve-all's, for the same reasons.
 *
 * ## What it does not change
 *
 * The guard. `publishBlocker` still decides, unchanged, and it is the only
 * thing that does. A listing with nothing sellable, or one selling at or
 * below what we pay the publisher, is refused here exactly as it is refused
 * when somebody publishes it by hand. Nothing about "ready" is re-decided in
 * SQL - `website_publish_candidates` only narrows to drafts with a priced,
 * switched-on placement, which is the cheap half; the half that needs the
 * converted cost and the rate card is asked of the real function.
 *
 * ## What it does change
 *
 * The round trips. Listings are read in batches and their costs in one query
 * per batch, so a hundred listings cost three reads rather than four hundred.
 * `publishBlocker` then runs a hundred times in memory, which is free, and the
 * ones that pass go live in a single update.
 */

/** How many to weigh before checking the clock again. */
const CHUNK = 100;

/** A claim older than this is treated as abandoned by a killed function. */
const STALE_CLAIM_SECONDS = 600;

const DEFAULT_BUDGET_MS = 240_000;

export interface PublishRun {
  id: string;
  status: 'running' | 'finished' | 'cancelled' | 'failed';
  total: number;
  published: number;
  skipped: number;
  firstError: string | null;
  ticks: number;
  startedBy: string;
  startedAt: string;
  finishedAt: string | null;
  statusReason: string | null;
}

function toRun(row: Record<string, unknown>): PublishRun {
  return {
    id: String(row.id),
    status: row.status as PublishRun['status'],
    total: Number(row.total ?? 0),
    published: Number(row.published ?? 0),
    skipped: Number(row.skipped ?? 0),
    firstError: (row.first_error as string | null) ?? null,
    ticks: Number(row.ticks ?? 0),
    startedBy: String(row.started_by ?? ''),
    startedAt: String(row.started_at ?? ''),
    finishedAt: (row.finished_at as string | null) ?? null,
    statusReason: (row.status_reason as string | null) ?? null,
  };
}

/** How many drafts have something sellable on them right now. */
export async function publishableCount(): Promise<number> {
  if (!isSupabaseEnabled()) return 0;
  const { data } = await getAdminScopedClient().rpc('website_publish_eligible_count');
  return typeof data === 'number' ? data : 0;
}

export async function latestPublishRun(): Promise<PublishRun | null> {
  if (!isSupabaseEnabled()) return null;
  const { data } = await getAdminScopedClient()
    .from('website_publish_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? toRun(data as Record<string, unknown>) : null;
}

export async function startPublishRun(
  by: string,
): Promise<{ ok: true; run: PublishRun } | { ok: false; error: string }> {
  if (!isSupabaseEnabled()) return { ok: false, error: 'The database is not connected.' };

  const running = await latestPublishRun();
  if (running?.status === 'running') {
    return { ok: false, error: 'A publish run is already going. Watch that one, or cancel it.' };
  }

  const total = await publishableCount();
  if (total === 0) {
    return { ok: false, error: 'No draft listing has a priced, switched-on placement to publish.' };
  }

  const { data, error } = await getAdminScopedClient()
    .from('website_publish_runs')
    .insert({ total, started_by: by })
    .select('*')
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? 'Could not start the run.' };
  return { ok: true, run: toRun(data as Record<string, unknown>) };
}

export async function cancelPublishRun(): Promise<{ ok: boolean }> {
  if (!isSupabaseEnabled()) return { ok: false };
  const { error } = await getAdminScopedClient()
    .from('website_publish_runs')
    .update({
      status: 'cancelled',
      finished_at: new Date().toISOString(),
      status_reason: 'Cancelled from the admin screen.',
    })
    .eq('status', 'running');
  return { ok: !error };
}

/**
 * Carry the run on for as long as the budget allows.
 *
 * Claimed first, so two cron ticks overlapping cannot both publish the same
 * listings. Counters are written after every chunk rather than at the end: a
 * function killed mid-slice should leave a run that says what it managed, not
 * one that says nothing happened.
 */
export async function advancePublishRun(
  budgetMs = DEFAULT_BUDGET_MS,
): Promise<{ claimed: boolean; published: number; skipped: number; done: boolean }> {
  if (!isSupabaseEnabled()) return { claimed: false, published: 0, skipped: 0, done: true };

  const supabase = getAdminScopedClient();
  const { data: claimed } = await supabase.rpc('claim_website_publish_run', {
    p_stale_seconds: STALE_CLAIM_SECONDS,
  });

  const runId = typeof claimed === 'string' ? claimed : null;
  if (!runId) return { claimed: false, published: 0, skipped: 0, done: true };

  const started = Date.now();
  let published = 0;
  let skipped = 0;
  let firstError: string | null = null;

  // The ones this run has already refused, so the next slice asks for
  // different listings rather than the same ones for ever.
  const { data: runRow } = await supabase
    .from('website_publish_runs')
    .select('skipped_ids, published, skipped, first_error')
    .eq('id', runId)
    .maybeSingle();

  const refused = new Set<string>(
    ((runRow as { skipped_ids?: string[] } | null)?.skipped_ids ?? []) as string[],
  );
  let totalPublished = Number((runRow as { published?: number } | null)?.published ?? 0);
  let totalSkipped = Number((runRow as { skipped?: number } | null)?.skipped ?? 0);
  firstError = ((runRow as { first_error?: string | null } | null)?.first_error ?? null) as string | null;

  while (Date.now() - started < budgetMs) {
    const { data: candidates } = await supabase.rpc('website_publish_candidates', {
      p_limit: CHUNK,
      p_exclude: [...refused],
    });

    const ids = ((candidates ?? []) as { id: string }[]).map((row) => row.id);
    if (ids.length === 0) break;

    /*
      Three reads for a hundred listings, not four hundred.

      `setStatus` reads one listing and its costs per publish, which is right
      for one press of a button and ruinous seven thousand times. The guard it
      runs is the same guard; only the fetching is batched.
    */
    const websites = await supabaseWebsiteRepository.getByIds(ids);
    const costs: Record<string, TrueCostIndex | undefined> = await pricingService
      .trueCostsByWebsite(ids)
      // A costs read that fails must not stop the run: `publishBlocker` falls
      // back to the checks it can make without them, which is what the
      // one-at-a-time path does too.
      .catch(() => ({}));

    const ready: string[] = [];
    for (const website of websites) {
      const blocker = publishBlocker(website, costs[website.id]);
      if (blocker) {
        refused.add(website.id);
        totalSkipped += 1;
        skipped += 1;
        firstError ??= `${website.domain}: ${publishBlockerMessage(blocker)}`;
      } else {
        ready.push(website.id);
      }
    }

    // A candidate the read did not return - deleted since, or no longer
    // visible - is refused rather than retried for ever.
    for (const id of ids) {
      if (!websites.some((website) => website.id === id) && !refused.has(id)) {
        refused.add(id);
        totalSkipped += 1;
        skipped += 1;
      }
    }

    if (ready.length > 0) {
      const { error } = await supabase
        .from('websites')
        .update({ status: 'active' })
        .in('id', ready)
        .eq('status', 'draft');

      if (error) {
        firstError ??= `Could not publish a batch: ${error.message}`;
        // Not marked refused: the listings are fine, the write failed, and the
        // next slice should try them again rather than writing them off.
        break;
      }
      totalPublished += ready.length;
      published += ready.length;
    }

    await supabase
      .from('website_publish_runs')
      .update({
        published: totalPublished,
        skipped: totalSkipped,
        skipped_ids: [...refused],
        first_error: firstError,
      })
      .eq('id', runId);
  }

  const left = await publishableCount();
  const done = left === 0 || left === refused.size;

  await supabase
    .from('website_publish_runs')
    .update({
      published: totalPublished,
      skipped: totalSkipped,
      skipped_ids: [...refused],
      first_error: firstError,
      ...(done
        ? {
            status: 'finished',
            finished_at: new Date().toISOString(),
            status_reason: `Published ${totalPublished}. ${totalSkipped} were not ready.`,
          }
        : {}),
    })
    .eq('id', runId);

  return { claimed: true, published, skipped, done };
}
