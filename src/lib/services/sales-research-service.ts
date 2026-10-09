import { getAdminScopedClient } from '@/lib/supabase/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import {
  CRAWLER_USER_AGENT,
  FETCH_AT_ONCE,
  FETCH_TIMEOUT_MS,
} from '@/lib/crawl/politeness';
import {
  MAX_BYTES,
  guessSegment,
  pageKind,
  prioritiseUrls,
  readPage,
  signalsFrom,
} from '@/lib/sales/page-reading';
import { prospectService } from './prospect-service';
import { salesRunService } from './sales-run-service';
import { salesSettingsService } from './sales-settings-service';
import type { ProspectPage } from '@/lib/types/sales';

/**
 * Reading what a prospect says about themselves.
 *
 * Their own website, a handful of pages of it, as plain text. That is the
 * whole input to every judgement this feature makes - which is deliberate:
 * nothing here looks a company up anywhere else, so every reason attached to a
 * prospect can be traced to a sentence somebody at that company wrote.
 *
 * ## These are other people's servers
 *
 * The politeness constants live in `lib/crawl/politeness.ts` now, shared with
 * `site-description-service.ts` - which arrived at the same values
 * independently - and with the homepage category read. They are not
 * arbitrary: a burst of hundreds of simultaneous requests from one address is
 * how a crawler gets blocked, and a bot that will not say who it is gets
 * blocked by anybody paying attention. Six pages per company, eight requests
 * at a time, twelve seconds each, and a user-agent with our name and a URL in
 * it.
 *
 * ## Costs nothing but time
 *
 * No API key, no credits, no model. Which is why it is the first sweep and why
 * it is safe to run over the whole list: everything expensive downstream reads
 * what this produced rather than going back to the network.
 */

/** One slice's worth of prospects. The time budget decides, not this. */
const CHUNK = 12;

/** Leave room to write the counters before the function is killed. */
const DEFAULT_BUDGET_MS = 240_000;

interface Fetched {
  url: string;
  kind: ProspectPage['kind'];
  httpStatus?: number;
  title?: string;
  text: string;
  bytes?: number;
  error?: string;
  links: string[];
}

async function fetchPage(url: string, kind: ProspectPage['kind']): Promise<Fetched> {
  try {
    const response = await fetch(url, {
      headers: { 'user-agent': CRAWLER_USER_AGENT, accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    const type = response.headers.get('content-type') ?? '';
    if (!response.ok) {
      return { url, kind, httpStatus: response.status, text: '', links: [], error: `HTTP ${response.status}` };
    }
    if (!type.includes('html')) {
      return { url, kind, httpStatus: response.status, text: '', links: [], error: `Not HTML (${type.split(';')[0]})` };
    }

    const html = (await response.text()).slice(0, MAX_BYTES);
    // Where the request ended up, not where it was aimed: a site that
    // redirects to www would otherwise have every relative link resolved
    // against the wrong origin.
    const read = readPage(html, response.url || url);

    return {
      url,
      kind,
      httpStatus: response.status,
      title: read.title,
      text: read.text,
      bytes: html.length,
      links: read.links,
    };
  } catch (error) {
    return {
      url,
      kind,
      text: '',
      links: [],
      // A timeout, a refused connection, a bad certificate. Bounded, and it
      // never carries anything but the reason.
      error: error instanceof Error ? error.message.slice(0, 200) : 'Request failed',
    };
  }
}

/**
 * One company, read.
 *
 * The homepage first, then whichever of the pages it links to are worth a
 * request. Two passes rather than one because the second pass needs the
 * homepage's links to know what to ask for, and guessing paths - /services,
 * /about - spends requests on 404s at most sites.
 */
export async function researchProspect(
  prospectId: string,
  options: { maxPages?: number; actor?: string } = {},
): Promise<{ ok: boolean; pages: number; error?: string }> {
  if (!isSupabaseEnabled()) return { ok: false, pages: 0, error: 'No database' };

  const prospect = await prospectService.getById(prospectId);
  if (!prospect) return { ok: false, pages: 0, error: 'No such prospect' };

  const supabase = getAdminScopedClient();
  const maxPages = Math.max(1, Math.min(20, options.maxPages ?? 6));

  await supabase
    .from('prospects')
    .update({ research_status: 'running', research_error: null })
    .eq('id', prospectId);

  // https first. A site still on plain http is rare and not a reason to skip
  // them, but trying http first means a redirect on almost every one.
  let home = await fetchPage(`https://${prospect.domain}/`, 'home');
  if (home.error) home = await fetchPage(`http://${prospect.domain}/`, 'home');

  const fetched: Fetched[] = [home];

  if (!home.error) {
    const next = prioritiseUrls(home.links, maxPages - 1).filter(
      (url) => pageKind(url) !== 'home',
    );

    for (let index = 0; index < next.length; index += FETCH_AT_ONCE) {
      const group = next.slice(index, index + FETCH_AT_ONCE);
      const results = await Promise.all(group.map((url) => fetchPage(url, pageKind(url))));
      fetched.push(...results);
    }
  }

  /*
    Replace, do not add.

    Re-researching a prospect has to give the current state of their site, not
    the current state plus whatever it said last year. The pages are keyed by
    URL, so without this a redesign leaves both versions in the evidence and a
    quote can be "found" on a page that no longer exists.
  */
  await supabase.from('prospect_pages').delete().eq('prospect_id', prospectId);

  const rows = fetched.map((page) => ({
    prospect_id: prospectId,
    url: page.url.slice(0, 2000),
    kind: page.kind,
    http_status: page.httpStatus ?? null,
    title: page.title ? page.title.slice(0, 300) : null,
    text_excerpt: page.text,
    bytes: page.bytes ?? null,
    error: page.error ?? null,
  }));

  if (rows.length > 0) {
    const { error } = await supabase.from('prospect_pages').insert(rows);
    if (error) {
      await supabase
        .from('prospects')
        .update({ research_status: 'failed', research_error: error.message.slice(0, 300) })
        .eq('id', prospectId);
      return { ok: false, pages: 0, error: error.message };
    }
  }

  const usable = fetched.filter((page) => !page.error && page.text.length > 0);

  if (usable.length === 0) {
    const reason = home.error ?? 'Nothing readable on their site';
    await supabase
      .from('prospects')
      .update({
        research_status: 'failed',
        research_error: reason.slice(0, 300),
        researched_at: new Date().toISOString(),
      })
      .eq('id', prospectId);

    await prospectService.recordEvent(prospectId, {
      kind: 'researched',
      summary: `Could not read their site: ${reason}`,
      actor: options.actor,
    });

    return { ok: false, pages: 0, error: reason };
  }

  const signals = signalsFrom(
    usable.map((page) => ({ url: page.url, kind: page.kind, text: page.text })),
  );

  /*
    A guessed segment, and only where nothing has been decided.

    `other` is the shipped default, so filling it in from the terms found is
    an improvement. Overwriting a segment somebody chose by hand, or one a
    model already settled, would undo a decision with a keyword count - and
    the guess returns nothing on a tie precisely because it is weak evidence.
  */
  const guess = guessSegment(signals);
  const patch: Record<string, unknown> = {
    research_status: 'done',
    research_error: null,
    researched_at: new Date().toISOString(),
    signals,
  };
  if (guess && prospect.segment === 'other') patch.segment = guess;

  await supabase.from('prospects').update(patch).eq('id', prospectId);

  await prospectService.recordEvent(prospectId, {
    kind: 'researched',
    summary: `Read ${usable.length} page${usable.length === 1 ? '' : 's'}; ${
      (signals.matchedTerms ?? []).length
    } tracked phrase${(signals.matchedTerms ?? []).length === 1 ? '' : 's'} found`,
    detail: { pages: usable.map((page) => page.url) },
    actor: options.actor,
  });

  return { ok: true, pages: usable.length };
}

export interface SweepOutcome {
  idle: boolean;
  looked: number;
  succeeded: number;
  failed: number;
  finished: boolean;
  outOfTime: boolean;
  reason?: string;
}

/**
 * Start a sweep over everything not yet researched.
 *
 * Returns the run id, or null when one is already going. The caller shows
 * that rather than starting a second: two sweeps over the same prospects
 * means every site crawled twice, which these sites would notice.
 */
export async function startResearchSweep(by?: string): Promise<string | null> {
  return salesRunService.claim('research', false, by);
}

/**
 * Carry a research sweep forward by one slice.
 *
 * Driven by the admin page while it is open and by the cron when it is not.
 * The budget is the function's time limit less the room needed to write the
 * counters, and the run is released rather than finished when it runs out -
 * so the next tick picks it up at once instead of waiting for the lease to
 * look abandoned.
 */
export async function advanceResearchSweep(budgetMs = DEFAULT_BUDGET_MS): Promise<SweepOutcome> {
  const idle: SweepOutcome = {
    idle: true,
    looked: 0,
    succeeded: 0,
    failed: 0,
    finished: false,
    outOfTime: false,
  };

  if (!isSupabaseEnabled()) return idle;

  const run = await salesRunService.live('research');
  if (!run) return idle;

  const settings = await salesSettingsService.get();
  const maxPages = settings?.crawlMaxPages ?? 6;

  const started = Date.now();

  /*
    Two sets of counters, and the reason is a bug that was here for a minute.

    `pending` is what has not been added to the run row yet; `total` is what
    this slice did, which is what the caller shows. Adding the pending deltas
    and then zeroing them is right for the row - the counters there are
    cumulative across slices - but returning the zeroed values would report a
    slice that read forty sites as having read none.
  */
  const total = { looked: 0, succeeded: 0, failed: 0 };
  const pending = { looked: 0, succeeded: 0, failed: 0 };
  let outOfTime = false;

  const supabase = getAdminScopedClient();

  for (;;) {
    if (Date.now() - started > budgetMs) {
      outOfTime = true;
      break;
    }

    /*
      Re-asked every slice, never read once as a long list.

      PostgREST caps a result at a thousand rows without saying so, and the
      Ahrefs refresh spent every run of its life refreshing only its first
      thousand domains because of it. Asking for a dozen at a time also means
      the selection reflects work the previous slice did, so nothing is
      attempted twice.
    */
    const { data, error } = await supabase
      .from('prospects')
      .select('id')
      .eq('research_status', 'pending')
      .order('created_at')
      .limit(CHUNK);

    if (error) {
      await salesRunService.finish(run.id, { status: 'failed', error: error.message });
      return { idle: false, ...total, finished: true, outOfTime: false, reason: error.message };
    }

    const batch = (data ?? []) as { id: string }[];
    if (batch.length === 0) break;

    for (const entry of batch) {
      if (Date.now() - started > budgetMs) {
        outOfTime = true;
        break;
      }

      pending.looked += 1;
      total.looked += 1;

      const outcome = await researchProspect(entry.id, { maxPages, actor: run.startedBy });
      if (outcome.ok) {
        pending.succeeded += 1;
        total.succeeded += 1;
      } else {
        pending.failed += 1;
        total.failed += 1;
      }
    }

    await salesRunService.progress(run.id, { ...pending });
    pending.looked = 0;
    pending.succeeded = 0;
    pending.failed = 0;

    if (outOfTime) break;
  }

  if (outOfTime) {
    await salesRunService.release(run.id);
    return { idle: false, ...total, finished: false, outOfTime: true };
  }

  await salesRunService.finish(run.id, { status: 'completed' });
  return { idle: false, ...total, finished: true, outOfTime: false };
}
