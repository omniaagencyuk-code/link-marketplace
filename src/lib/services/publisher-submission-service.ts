import { isSupabaseEnabled } from '@/lib/supabase/config';
import { getAdminClient, getAdminScopedClient } from '@/lib/supabase/server';
import { mockStore } from './mock-store';
import { readStoredPrice, type CleanSubmission } from '@/lib/publishers/rules';
import {
  isPlacementType,
  isSubmissionStatus,
  type SubmissionSource,
  type SubmissionStatus,
} from '@/lib/publishers/options';
import { SUBMISSION_PAGE_SIZE, type PublisherSubmission } from '@/lib/publishers/types';

export { SUBMISSION_PAGE_SIZE };
export type { PublisherSubmission };

/**
 * Offers of a site: storing them, and reading them back for the admin.
 *
 * The write runs as the service role, because a publisher offering us a site
 * has no account - 0092 gives the table an admin policy and no public insert
 * policy at all, so a browser holding the anon key cannot write here even if
 * it finds the endpoint. A public insert policy would make the table
 * writable at whatever rate somebody liked, and the throttle on the action
 * would be guarding a door that was never shut.
 *
 * Reads are admin-only for the reason the Sales Centre's tables are, and one
 * more: the figure in `price_minor` is what a publisher wants *paid*, and
 * what we pay has never been readable by the people we sell to.
 */

interface SubmissionRow {
  id: string;
  full_name: string;
  email: string;
  domain: string;
  placement_type: string | null;
  price_minor: number | null;
  currency: string | null;
  message: string | null;
  source: string;
  status: string;
  matched_website_id: string | null;
  handled_by: string | null;
  handled_at: string | null;
  notes: string | null;
  created_at: string;
}

function mapSubmission(row: SubmissionRow): PublisherSubmission {
  // Both or neither, by the one rule in `publishers/rules.ts`.
  const price = readStoredPrice(row.price_minor, row.currency);

  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    domain: row.domain,
    placementType:
      row.placement_type && isPlacementType(row.placement_type)
        ? row.placement_type
        : undefined,
    priceMinor: price?.priceMinor,
    currency: price?.currency,
    message: row.message ?? undefined,
    source: row.source as SubmissionSource,
    // A row whose status predates a change to the list reads as 'new' rather
    // than as something the admin screen cannot render.
    status: isSubmissionStatus(row.status) ? row.status : 'new',
    matchedWebsiteId: row.matched_website_id ?? undefined,
    handledBy: row.handled_by ?? undefined,
    handledAt: row.handled_at ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
  };
}

const store = mockStore<PublisherSubmission>('publisher-submissions');

const SELECT =
  'id, full_name, email, domain, placement_type, price_minor, currency, message, source, ' +
  'status, matched_website_id, handled_by, handled_at, notes, created_at';

/**
 * The listing we already hold for this domain, if there is one.
 *
 * Never fatal. A failed match costs whoever reads the queue a search they
 * could do themselves; a failed submission costs a publisher who was trying
 * to sell us inventory, and the two are not comparable.
 */
async function matchWebsite(domain: string): Promise<string | null> {
  try {
    const supabase = getAdminClient();
    if (!supabase) return null;

    const { data } = await supabase
      .from('websites')
      .select('id')
      .eq('domain', domain)
      .maybeSingle();

    return (data as { id: string } | null)?.id ?? null;
  } catch {
    return null;
  }
}

export const publisherSubmissionService = {
  /**
   * Store an offer. Returns its id.
   *
   * Throws on a failed write rather than returning null: the caller tells
   * somebody it arrived, and a silent failure there is a publisher waiting
   * for a reply to an offer we threw away.
   */
  async create(submission: CleanSubmission): Promise<string> {
    const createdAt = new Date().toISOString();

    if (!isSupabaseEnabled()) {
      const id = `pub_${Date.now().toString(36)}_${store.size}`;
      store.set(id, { ...submission, id, status: 'new', createdAt });
      return id;
    }

    const matchedWebsiteId = await matchWebsite(submission.domain);

    const supabase = getAdminScopedClient();
    const { data, error } = await supabase
      .from('publisher_submissions')
      .insert({
        full_name: submission.fullName,
        email: submission.email,
        domain: submission.domain,
        placement_type: submission.placementType ?? null,
        price_minor: submission.priceMinor ?? null,
        currency: submission.currency ?? null,
        message: submission.message ?? null,
        source: submission.source,
        matched_website_id: matchedWebsiteId,
      })
      .select('id')
      .single();

    if (error || !data) {
      throw new Error(`Could not store that submission: ${error?.message ?? 'no row returned'}`);
    }
    return data.id as string;
  },

  /** One page of offers, newest first, optionally filtered by status. */
  async page(
    status: SubmissionStatus | 'all',
    page: number,
    pageSize: number = SUBMISSION_PAGE_SIZE,
  ): Promise<{ items: PublisherSubmission[]; total: number }> {
    const from = Math.max(0, (Math.max(1, page) - 1) * pageSize);

    if (!isSupabaseEnabled()) {
      const all = [...store.values()]
        .filter((entry) => status === 'all' || entry.status === status)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return { items: all.slice(from, from + pageSize), total: all.length };
    }

    const supabase = getAdminScopedClient();
    let query = supabase
      .from('publisher_submissions')
      .select(SELECT, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);

    if (status !== 'all') query = query.eq('status', status);

    const { data, count, error } = await query;
    if (error) throw new Error(`Could not read the submissions: ${error.message}`);

    return {
      items: (data ?? []).map((row) => mapSubmission(row as unknown as SubmissionRow)),
      // `count` rather than the page's length, which is the number of rows
      // the server chose to return and stops agreeing silently at the cap.
      total: count ?? 0,
    };
  },

  /** How many are waiting to be looked at. */
  async newCount(): Promise<number> {
    if (!isSupabaseEnabled()) {
      return [...store.values()].filter((entry) => entry.status === 'new').length;
    }

    const supabase = getAdminClient();
    if (!supabase) return 0;

    const { count, error } = await supabase
      .from('publisher_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'new');

    // A count is not worth failing a page render over.
    return error ? 0 : (count ?? 0);
  },

  /** Move an offer along, and record who did it. */
  async setStatus(
    id: string,
    status: SubmissionStatus,
    handledBy: string,
  ): Promise<PublisherSubmission | null> {
    /*
      'new' is the only status that is not somebody having dealt with it, so
      going back to it clears the handler rather than leaving a name against
      a row nobody has now acted on.
    */
    const handled = status === 'new';

    if (!isSupabaseEnabled()) {
      const existing = store.get(id);
      if (!existing) return null;
      const updated: PublisherSubmission = {
        ...existing,
        status,
        handledBy: handled ? undefined : handledBy,
        handledAt: handled ? undefined : new Date().toISOString(),
      };
      store.set(id, updated);
      return updated;
    }

    const supabase = getAdminScopedClient();
    const { data, error } = await supabase
      .from('publisher_submissions')
      .update({
        status,
        handled_by: handled ? null : handledBy,
        handled_at: handled ? null : new Date().toISOString(),
      })
      .eq('id', id)
      .select(SELECT)
      .maybeSingle();

    if (error) throw new Error(`Could not update that submission: ${error.message}`);
    return data ? mapSubmission(data as unknown as SubmissionRow) : null;
  },
};
