import { getAdminScopedClient } from '@/lib/supabase/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { describeFromHtml } from '@/lib/websites/site-description';
import { brand } from '@/lib/config/brand';

/**
 * Filling in what each publisher says their own site is about.
 *
 * `description` is empty on almost every listing - the importer writes `''` and
 * the only thing that has ever filled it is somebody typing into the admin
 * editor. It is also the field the listing overview leads with, and the one the
 * marketplace card, the table row and the expanded snippet all print, so one
 * empty column shows up in five places.
 *
 * A publisher's own meta description fills it, costs nothing but an HTTP
 * request, and is better copy than anything that could be generated: it is
 * written by them, about them, for strangers.
 *
 * ## What this will not do
 *
 * Overwrite. A description somebody typed, or one a previous run found, is left
 * alone - the run only fills blanks, so it is safe to run repeatedly and
 * cannot undo an edit.
 *
 * Guess. A homepage that answers with boilerplate, a parking page or a block
 * page contributes nothing rather than a sentence about WordPress. An empty
 * description is a paragraph the overview leaves out; a wrong one is a claim on
 * a page somebody spends money from.
 */

export interface DescriptionRun {
  looked: number;
  filled: number;
  nothingUseful: number;
  failed: number;
  /** The first failure, so a run that fills nothing can say why. */
  firstError?: string;
}

/** Long enough for a slow publisher, short enough that a dead host is cheap. */
const TIMEOUT_MS = 12_000;

/** A homepage is HTML. Reading more than this is reading a payload, not a page. */
const MAX_BYTES = 400_000;

/**
 * How many at once.
 *
 * These are other people's servers. A burst of hundreds of simultaneous
 * requests from one address is how a crawler gets blocked, and being blocked
 * loses the publisher relationship as well as the description.
 */
const AT_ONCE = 8;

/**
 * Identifies itself, and says why.
 *
 * A bot that will not say who it is gets blocked by anybody paying attention,
 * and these are sites we have a commercial relationship with - being
 * recognisable is worth more than the handful of extra responses a browser
 * string would win.
 */
const USER_AGENT = `Mozilla/5.0 (compatible; ${brand.name.replace(/\s+/g, '')}Bot/1.0; +https://pressparrot.com/)`;

async function homepageDescription(domain: string): Promise<string | undefined> {
  /*
    https first, http second.

    A publisher still on plain http is rare and is not a reason to skip them,
    but trying http first would mean a redirect on almost every site.
  */
  for (const url of [`https://${domain}/`, `http://${domain}/`]) {
    try {
      const response = await fetch(url, {
        headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml' },
        redirect: 'follow',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) continue;

      const type = response.headers.get('content-type') ?? '';
      if (!type.includes('html')) continue;

      // Read a bounded prefix: the meta tags are in the head, and a homepage
      // that streams a megabyte of markup should not cost a megabyte to read.
      const html = (await response.text()).slice(0, MAX_BYTES);
      const found = describeFromHtml(html);
      if (found) return found;
    } catch {
      // A timeout, a refused connection, a bad certificate. The next scheme
      // gets a go; if both fail the domain is simply counted as failed.
    }
  }
  return undefined;
}

/**
 * The sweep, as a job rather than a button press.
 *
 * A run is a row in `description_runs`. Whoever picks it up claims it, works
 * until their time budget is spent, writes what they did and releases it. The
 * admin button does the first slice so something visibly happens; the cron
 * does the rest, which is what lets somebody start it and close the tab.
 *
 * ## Why a run cannot simply ask for "still blank"
 *
 * It used to, and that was the bug that made the old button feel like it was
 * going backwards. About sixty per cent of homepages yield nothing usable, so
 * those listings are still blank after being read - and the next press asked
 * the same question, got the same rows first, and spent its whole budget
 * re-reading the domains already known to be fruitless. `description_checked_at`
 * is what makes a sweep move forward: each slice asks for listings this run has
 * not looked at yet.
 */

/** One slice's worth of candidates. Small, because the budget decides, not this. */
const CHUNK = 40;

/** Leave enough room to write the final counters before the function is killed. */
const DEFAULT_BUDGET_MS = 240_000;

/** A claim older than this belonged to a slice that died. */
const STALE_CLAIM_SECONDS = 600;

export interface RunProgress {
  id: string;
  status: 'running' | 'finished' | 'cancelled' | 'failed';
  total: number;
  looked: number;
  filled: number;
  nothingUseful: number;
  failed: number;
  firstError?: string;
  startedAt: string;
  finishedAt?: string;
}

export interface SliceResult {
  /** No run to work on. Not an error - the usual answer on a cron tick. */
  idle: boolean;
  looked: number;
  filled: number;
  finished: boolean;
  outOfTime: boolean;
}

function mapRun(row: Record<string, unknown>): RunProgress {
  return {
    id: String(row.id),
    status: String(row.status) as RunProgress['status'],
    total: Number(row.total ?? 0),
    looked: Number(row.looked ?? 0),
    filled: Number(row.filled ?? 0),
    nothingUseful: Number(row.nothing_useful ?? 0),
    failed: Number(row.failed ?? 0),
    ...(row.first_error ? { firstError: String(row.first_error) } : {}),
    startedAt: String(row.started_at),
    ...(row.finished_at ? { finishedAt: String(row.finished_at) } : {}),
  };
}

const RUN_COLUMNS =
  'id, status, total, looked, filled, nothing_useful, failed, first_error, started_at, finished_at';

/**
 * Begin a sweep over every listing with no description.
 *
 * Refuses when one is already going, rather than starting a second: two runs
 * would each fetch half the inventory twice and each report half the progress.
 * The partial unique index enforces it, so two people pressing the button
 * together is settled by the database rather than by timing.
 */
export async function startDescriptionRun(
  startedBy?: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseEnabled()) return { ok: false, error: 'The database is not connected.' };

  const supabase = getAdminScopedClient();
  const total = await blankDescriptionCount();

  if (total === 0) return { ok: false, error: 'Every listing already has a description.' };

  const { error } = await supabase
    .from('description_runs')
    .insert({ total, started_by: startedBy ?? null });

  if (error) {
    // 23505 is the one-running-run index.
    if (error.code === '23505') {
      return { ok: false, error: 'A sweep is already running. Watch it above, or stop it first.' };
    }
    return { ok: false, error: `Could not start it: ${error.message}` };
  }

  return { ok: true };
}

/** Stop the running sweep. What it has already written stays written. */
export async function cancelDescriptionRun(): Promise<void> {
  if (!isSupabaseEnabled()) return;

  await getAdminScopedClient()
    .from('description_runs')
    .update({ status: 'cancelled', finished_at: new Date().toISOString(), claimed_at: null })
    .eq('status', 'running');
}

/** The run in progress, for the bar. Null when nothing is going on. */
export async function liveDescriptionRun(): Promise<RunProgress | null> {
  if (!isSupabaseEnabled()) return null;

  const { data } = await getAdminScopedClient()
    .from('description_runs')
    .select(RUN_COLUMNS)
    .eq('status', 'running')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ? mapRun(data as Record<string, unknown>) : null;
}

/** The last few sweeps, so the page can say what happened without one running. */
export async function recentDescriptionRuns(limit = 3): Promise<RunProgress[]> {
  if (!isSupabaseEnabled()) return [];

  const { data } = await getAdminScopedClient()
    .from('description_runs')
    .select(RUN_COLUMNS)
    .neq('status', 'running')
    .order('started_at', { ascending: false })
    .limit(limit);

  return ((data ?? []) as Record<string, unknown>[]).map(mapRun);
}

/**
 * Do as much of the running sweep as the budget allows.
 *
 * Claims the run first, so a cron tick landing on top of a manual slice does
 * not double-fetch everything in it. Releases the claim on the way out,
 * including when it runs out of time, so the next tick picks straight up.
 *
 * It never throws. This is called by a cron, and a thrown error would be a red
 * entry in a dashboard nobody reads rather than a counter somebody can see.
 */
export async function advanceDescriptionRun(
  budgetMs = DEFAULT_BUDGET_MS,
): Promise<SliceResult> {
  const result: SliceResult = {
    idle: true,
    looked: 0,
    filled: 0,
    finished: false,
    outOfTime: false,
  };

  if (!isSupabaseEnabled()) return result;

  const supabase = getAdminScopedClient();
  const deadline = Date.now() + budgetMs;

  const { data: claimed } = await supabase.rpc('claim_description_run', {
    p_stale_seconds: STALE_CLAIM_SECONDS,
  });

  const runId = typeof claimed === 'string' ? claimed : null;
  // Nothing running, or somebody else is already on it.
  if (!runId) return result;

  result.idle = false;

  const { data: runRow } = await supabase
    .from('description_runs')
    .select(RUN_COLUMNS)
    .eq('id', runId)
    .maybeSingle();

  if (!runRow) return result;
  const run = mapRun(runRow as Record<string, unknown>);

  const tally = {
    looked: run.looked,
    filled: run.filled,
    nothingUseful: run.nothingUseful,
    failed: run.failed,
    firstError: run.firstError,
  };

  try {
    while (Date.now() < deadline) {
      /*
        The next few this run has not tried.

        A database function rather than filters over the wire: the condition is
        "blank description AND not seen by this run", each half a disjunction,
        and expressing that as two `or=` parameters is a combination not worth
        being unsure about. Getting it subtly wrong would not fail - it would
        quietly hand back listings that already have a description and spend
        the whole sweep re-reading them.

        Because every listing is stamped whatever the outcome, a slice can
        never be handed the same fruitless domain twice.
      */
      const { data: rows } = await supabase.rpc('description_sweep_batch', {
        p_since: run.startedAt,
        p_limit: CHUNK,
      });

      const candidates = (rows ?? []) as { id: string; domain: string }[];

      if (candidates.length === 0) {
        result.finished = true;
        break;
      }

      for (let start = 0; start < candidates.length; start += AT_ONCE) {
        if (Date.now() >= deadline) {
          result.outOfTime = true;
          break;
        }

        const slice = candidates.slice(start, start + AT_ONCE);
        const found = await Promise.all(
          slice.map(async (row) => {
            try {
              return { row, description: await homepageDescription(row.domain) };
            } catch (error) {
              return { row, error: error instanceof Error ? error.message : String(error) };
            }
          }),
        );

        const stamped = new Date().toISOString();

        for (const outcome of found) {
          tally.looked += 1;
          result.looked += 1;

          if ('error' in outcome && outcome.error) {
            tally.failed += 1;
            tally.firstError ??= `${outcome.row.domain}: ${outcome.error}`;
          } else if (!outcome.description) {
            tally.nothingUseful += 1;
          } else {
            tally.filled += 1;
            result.filled += 1;
          }

          /*
            Stamped whatever happened, and only the two columns.

            The stamp is what moves the sweep forward, so it has to be written
            for a domain that timed out exactly as for one that answered -
            otherwise a dead host is retried on every slice until the run gives
            up on the clock instead of on the inventory.
          */
          await supabase
            .from('websites')
            .update({
              ...('description' in outcome && outcome.description
                ? { description: outcome.description }
                : {}),
              description_checked_at: stamped,
            })
            .eq('id', outcome.row.id);
        }

        // After each group of eight, so the bar moves while the slice runs
        // rather than jumping when it ends.
        await supabase
          .from('description_runs')
          .update({
            looked: tally.looked,
            filled: tally.filled,
            nothing_useful: tally.nothingUseful,
            failed: tally.failed,
            first_error: tally.firstError ?? null,
          })
          .eq('id', runId);
      }

      if (result.outOfTime) break;
    }
  } catch (error) {
    await supabase
      .from('description_runs')
      .update({
        status: 'failed',
        finished_at: new Date().toISOString(),
        claimed_at: null,
        first_error: tally.firstError ?? String(error).slice(0, 300),
      })
      .eq('id', runId);
    return result;
  }

  await supabase
    .from('description_runs')
    .update({
      looked: tally.looked,
      filled: tally.filled,
      nothing_useful: tally.nothingUseful,
      failed: tally.failed,
      first_error: tally.firstError ?? null,
      ...(result.finished
        ? { status: 'finished', finished_at: new Date().toISOString() }
        : {}),
      // Released either way, so the next tick can pick it straight up.
      claimed_at: null,
    })
    .eq('id', runId);

  return result;
}


/**
 * How many listings still have no description.
 *
 * A head count rather than a read: the admin page needs the number to decide
 * whether the button has anything to do, and reading seventeen hundred rows to
 * find out would be a page load's worth of work for one integer.
 */
export async function blankDescriptionCount(): Promise<number> {
  const supabase = getAdminScopedClient();
  const { count, error } = await supabase
    .from('websites')
    .select('id', { count: 'exact', head: true })
    .neq('status', 'archived')
    .or('description.is.null,description.eq.');

  if (error) throw new Error(`Failed to count blank descriptions: ${error.message}`);
  return count ?? 0;
}
