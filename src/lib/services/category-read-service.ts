import { getAdminScopedClient } from '@/lib/supabase/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { CRAWLER_USER_AGENT, FETCH_AT_ONCE, FETCH_TIMEOUT_MS } from '@/lib/crawl/politeness';
import { MAX_BYTES, readPage } from '@/lib/sales/page-reading';
import { NICHE_MODEL, readNicheFromPage } from '@/lib/sourcing/niche-client';
import { categoryReadRow } from '@/lib/sourcing/niche-row';
import { estimateCostUsd } from '@/lib/sourcing/client';
import type { NicheSlug } from '@/lib/types';

/**
 * Reading a publisher's homepage to find out what the site is about.
 *
 * One site at a time, on purpose and for now. The backlog is 1,840 listings
 * and a run that works through them is the obvious next thing - but a run
 * that fetches 1,840 third-party sites and spends tokens on all of them
 * before anybody has seen whether the answers are any good is the wrong
 * order. A handful of reads from this screen says whether the rules are
 * right; the run is worth building once they are.
 *
 * Nothing here applies a category. `applyRead` does, and only when somebody
 * presses Accept.
 */

export interface CategoryRead {
  websiteId: string;
  niche: NicheSlug | null;
  confidence: number | null;
  quote: string;
  reason: string;
  declinedBecause: string | null;
  pageUrl: string | null;
  httpStatus: number | null;
  promptVersion: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  readAt: string;
  appliedAt: string | null;
}

type Row = Record<string, unknown>;

function mapRead(row: Row): CategoryRead {
  const inputTokens = Number(row.input_tokens ?? 0);
  const outputTokens = Number(row.output_tokens ?? 0);
  const model = String(row.model ?? '');
  return {
    websiteId: String(row.website_id),
    niche: (row.niche as NicheSlug | null) ?? null,
    confidence: row.confidence === null || row.confidence === undefined ? null : Number(row.confidence),
    quote: String(row.quote ?? ''),
    reason: String(row.reason ?? ''),
    declinedBecause: (row.declined_because as string | null) ?? null,
    pageUrl: (row.page_url as string | null) ?? null,
    httpStatus: row.http_status === null || row.http_status === undefined ? null : Number(row.http_status),
    promptVersion: String(row.prompt_version ?? ''),
    model,
    inputTokens,
    outputTokens,
    // Measured, not estimated: the figures the API reported for this call,
    // priced at the published rate. AGENTS.md's rule for model spend.
    costUsd: estimateCostUsd(model, { inputTokens, outputTokens }, 'realtime'),
    readAt: String(row.read_at ?? ''),
    appliedAt: (row.applied_at as string | null) ?? null,
  };
}

/**
 * Fetch one homepage as plain text.
 *
 * Its own fetch rather than the prospect crawler's, which returns the links
 * it found and a page kind this has no use for. The politeness constants are
 * shared, which is the part that matters on somebody else's server.
 */
async function fetchHomepage(domain: string): Promise<{
  url: string;
  httpStatus?: number;
  title?: string;
  text: string;
  error?: string;
}> {
  const url = `https://${domain.replace(/^https?:\/\//, '').replace(/\/+$/, '')}/`;
  try {
    const response = await fetch(url, {
      headers: { 'user-agent': CRAWLER_USER_AGENT, accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      return { url, httpStatus: response.status, text: '', error: `HTTP ${response.status}` };
    }

    const type = response.headers.get('content-type') ?? '';
    if (!type.includes('html')) {
      return { url, httpStatus: response.status, text: '', error: `Not HTML (${type.split(';')[0]})` };
    }

    const html = (await response.text()).slice(0, MAX_BYTES);
    // Where the request ended up, so a site that redirects to www has its
    // own address recorded rather than the one we aimed at.
    const read = readPage(html, response.url || url);
    return { url: response.url || url, httpStatus: response.status, title: read.title, text: read.text };
  } catch (error) {
    return {
      url,
      text: '',
      error: error instanceof Error ? error.message : 'The page could not be fetched.',
    };
  }
}

export const categoryReadService = {
  /** What previous reads concluded, for the listings on screen. */
  async readsFor(websiteIds: string[]): Promise<Record<string, CategoryRead>> {
    if (!isSupabaseEnabled() || websiteIds.length === 0) return {};
    const { data } = await getAdminScopedClient()
      .from('website_category_reads')
      .select('*')
      .in('website_id', websiteIds);

    const out: Record<string, CategoryRead> = {};
    for (const row of (data ?? []) as Row[]) {
      const read = mapRead(row);
      out[read.websiteId] = read;
    }
    return out;
  },

  /**
   * Read one homepage and record what came of it.
   *
   * A failed fetch is recorded too, as a declined read. Without that the
   * next attempt fetches the same dead domain, and the one after that - and
   * a parked site looks identical to one nobody has got to yet.
   */
  async read(websiteId: string): Promise<CategoryRead | null> {
    if (!isSupabaseEnabled()) return null;
    const supabase = getAdminScopedClient();

    const { data: site } = await supabase
      .from('websites')
      .select('id, domain')
      .eq('id', websiteId)
      .maybeSingle();
    if (!site) return null;

    const domain = String((site as { domain: string }).domain);
    const page = await fetchHomepage(domain);

    const now = new Date().toISOString();

    /*
      The row is built by a pure function in `niche-row.ts`, and checked
      there without a database. The table constrains a row to say either
      what it found or why it found nothing; a mapping that can break that
      fails at the database on somebody's first click, as a 500 with a
      constraint name in it.
    */
    const unreadable = Boolean(page.error) || page.text.trim().length === 0;

    // No call where there was nothing to read: it would cost tokens to be
    // told the page was empty.
    const outcome = unreadable
      ? undefined
      : await readNicheFromPage({
          domain,
          text: page.title ? `${page.title}\n\n${page.text}` : page.text,
        });

    const row = categoryReadRow({ websiteId, page, outcome, model: NICHE_MODEL, now });

    /*
      Checked, where the unreadable-page branch used to drop it.

      That branch upserted and ignored the result, so a write refused by the
      constraint or by a policy returned as though it had been stored - and
      the screen would show a read that is not on record, which is worse
      than no read at all, because nothing would ever try that site again.
    */
    const { error } = await supabase
      .from('website_category_reads')
      .upsert(row, { onConflict: 'website_id' });
    if (error) throw new Error(`Could not record the homepage read: ${error.message}`);

    return mapRead(row);
  },

  /**
   * Read several homepages at once.
   *
   * Concurrency is `FETCH_AT_ONCE`, the figure the prospect crawler and the
   * description sweep both settled on, and it is about other people's
   * servers rather than about speed: a burst of twenty-five simultaneous
   * requests from one address is how a crawler gets blocked.
   *
   * Sequential would be politer still and is not an option - twenty-five
   * sites at four seconds each is a request that never answers. Eight at a
   * time is a few seconds, which is a request that does.
   *
   * One failure does not lose the others. `read` already returns rather than
   * throws for a page that will not fetch; this adds the same for a listing
   * that is not there at all, so a stale id in a selection cannot take the
   * batch down with it.
   */
  async readMany(websiteIds: string[]): Promise<Record<string, CategoryRead>> {
    const out: Record<string, CategoryRead> = {};
    if (!isSupabaseEnabled() || websiteIds.length === 0) return out;

    for (let from = 0; from < websiteIds.length; from += FETCH_AT_ONCE) {
      const group = websiteIds.slice(from, from + FETCH_AT_ONCE);
      const results = await Promise.all(
        group.map(async (id) => {
          try {
            return await categoryReadService.read(id);
          } catch {
            return null;
          }
        }),
      );
      for (const read of results) if (read) out[read.websiteId] = read;
    }

    return out;
  },

  /**
   * Apply a proposal, which is the only thing here that changes a listing.
   *
   * The source is recorded as `homepage` rather than left blank, so the
   * categories a model proposed stay distinguishable from the ones a person
   * decided - the parallel of `country_source`, and what makes a future
   * re-read able to leave the stated ones alone.
   */
  async apply(websiteId: string, reviewer: string): Promise<boolean> {
    if (!isSupabaseEnabled()) return false;
    const supabase = getAdminScopedClient();

    const { data: read } = await supabase
      .from('website_category_reads')
      .select('niche, applied_at')
      .eq('website_id', websiteId)
      .maybeSingle();

    const niche = (read as { niche: string | null } | null)?.niche ?? null;
    // Nothing to apply, and an already-applied read is not applied twice.
    if (!niche || (read as { applied_at: string | null } | null)?.applied_at) return false;

    const { data: category } = await supabase
      .from('categories')
      .select('id')
      .eq('slug', niche)
      .maybeSingle();
    const categoryId = (category as { id: string } | null)?.id;
    if (!categoryId) return false;

    const { error } = await supabase
      .from('websites')
      .update({ primary_category_id: categoryId, primary_category_source: 'homepage' })
      .eq('id', websiteId);
    if (error) throw new Error(`Could not apply the category: ${error.message}`);

    await supabase
      .from('website_category_reads')
      .update({ applied_at: new Date().toISOString(), applied_by: reviewer })
      .eq('website_id', websiteId);

    return true;
  },
};
