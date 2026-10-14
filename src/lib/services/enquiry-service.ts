import { isSupabaseEnabled } from '@/lib/supabase/config';
import { getAdminClient, getAdminScopedClient } from '@/lib/supabase/server';
import { mockStore } from './mock-store';
import type { CleanEnquiry } from '@/lib/enquiries/rules';
import { isEnquiryStatus, type EnquirySource, type EnquiryStatus } from '@/lib/enquiries/options';
import { ENQUIRY_PAGE_SIZE, type PricingEnquiry } from '@/lib/enquiries/types';

export { ENQUIRY_PAGE_SIZE };
export type { PricingEnquiry };

/**
 * Pricing enquiries: storing them, and reading them back for the admin.
 *
 * The write runs as the service role, because the person submitting usually
 * has no account - 0086 gives the table an admin policy and no public insert
 * policy at all, so a browser holding the anon key cannot write here even if
 * it finds the endpoint. That is deliberate: a public insert policy would
 * make the table writable at whatever rate somebody liked, and the throttle
 * on the action would be protecting a door that was never shut.
 *
 * Reads are admin-only for the same reason the Sales Centre's tables are:
 * this holds a named person's work address, their employer and what they
 * said they could spend.
 */

interface EnquiryRow {
  id: string;
  full_name: string;
  email: string;
  company: string | null;
  budget_band: string | null;
  interest: string | null;
  message: string;
  source: string;
  status: string;
  handled_by: string | null;
  handled_at: string | null;
  notes: string | null;
  created_at: string;
}

function mapEnquiry(row: EnquiryRow): PricingEnquiry {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    company: row.company ?? undefined,
    budgetBand: row.budget_band ?? undefined,
    interest: row.interest ?? undefined,
    message: row.message,
    source: row.source as EnquirySource,
    // A row whose status predates a change to the list reads as 'new' rather
    // than as something the admin screen cannot render.
    status: isEnquiryStatus(row.status) ? row.status : 'new',
    handledBy: row.handled_by ?? undefined,
    handledAt: row.handled_at ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
  };
}

const store = mockStore<PricingEnquiry>('pricing-enquiries');

const SELECT =
  'id, full_name, email, company, budget_band, interest, message, source, status, handled_by, handled_at, notes, created_at';

export const enquiryService = {
  /**
   * Store an enquiry. Returns its id.
   *
   * Throws on a failed write rather than returning null: the caller shows
   * somebody a success message, and a silent failure there is a person
   * waiting for a reply to a message we threw away.
   */
  async create(enquiry: CleanEnquiry): Promise<string> {
    const createdAt = new Date().toISOString();

    if (!isSupabaseEnabled()) {
      const id = `enq_${Date.now().toString(36)}_${store.size}`;
      store.set(id, { ...enquiry, id, status: 'new', createdAt });
      return id;
    }

    const supabase = getAdminScopedClient();
    const { data, error } = await supabase
      .from('pricing_enquiries')
      .insert({
        full_name: enquiry.fullName,
        email: enquiry.email,
        company: enquiry.company ?? null,
        budget_band: enquiry.budgetBand ?? null,
        interest: enquiry.interest ?? null,
        message: enquiry.message,
        source: enquiry.source,
      })
      .select('id')
      .single();

    if (error || !data) {
      throw new Error(`Could not store that enquiry: ${error?.message ?? 'no row returned'}`);
    }
    return data.id as string;
  },

  /** One page of enquiries, newest first, optionally filtered by status. */
  async page(
    status: EnquiryStatus | 'all',
    page: number,
    pageSize: number = ENQUIRY_PAGE_SIZE,
  ): Promise<{ items: PricingEnquiry[]; total: number }> {
    const from = Math.max(0, (Math.max(1, page) - 1) * pageSize);

    if (!isSupabaseEnabled()) {
      const all = [...store.values()]
        .filter((entry) => status === 'all' || entry.status === status)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return { items: all.slice(from, from + pageSize), total: all.length };
    }

    const supabase = getAdminScopedClient();
    let query = supabase
      .from('pricing_enquiries')
      .select(SELECT, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);

    if (status !== 'all') query = query.eq('status', status);

    const { data, count, error } = await query;
    if (error) throw new Error(`Could not read the enquiries: ${error.message}`);

    return {
      items: (data ?? []).map((row) => mapEnquiry(row as unknown as EnquiryRow)),
      // `count` rather than the page's length, which is the number of rows
      // the server chose to return and stops agreeing silently at the cap.
      total: count ?? 0,
    };
  },

  /** How many are waiting to be looked at. For the admin's navigation. */
  async newCount(): Promise<number> {
    if (!isSupabaseEnabled()) {
      return [...store.values()].filter((entry) => entry.status === 'new').length;
    }

    const supabase = getAdminClient();
    if (!supabase) return 0;

    const { count, error } = await supabase
      .from('pricing_enquiries')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'new');

    // A badge is not worth failing a page render over.
    return error ? 0 : (count ?? 0);
  },

  /** Move an enquiry along, and record who did it. */
  async setStatus(
    id: string,
    status: EnquiryStatus,
    handledBy: string,
  ): Promise<PricingEnquiry | null> {
    /*
      'new' is the only status that is not somebody having dealt with it, so
      going back to it clears the handler rather than leaving a name against
      a row nobody has now acted on.
    */
    const handled = status === 'new';

    if (!isSupabaseEnabled()) {
      const existing = store.get(id);
      if (!existing) return null;
      const updated: PricingEnquiry = {
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
      .from('pricing_enquiries')
      .update({
        status,
        handled_by: handled ? null : handledBy,
        handled_at: handled ? null : new Date().toISOString(),
      })
      .eq('id', id)
      .select(SELECT)
      .maybeSingle();

    if (error) throw new Error(`Could not update that enquiry: ${error.message}`);
    return data ? mapEnquiry(data as unknown as EnquiryRow) : null;
  },
};
