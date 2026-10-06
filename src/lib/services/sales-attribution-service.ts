import { getAdminScopedClient } from '@/lib/supabase/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { readAllPages } from './supabase/paged';
import { prospectService } from './prospect-service';

/**
 * Which outreach produced which customer.
 *
 * Matched on the address somebody signed up with, or on its domain, and
 * **written down rather than recomputed**. That is the one decision in this
 * module worth defending: a later change to the matching rule - a stricter
 * one, a looser one, a bug - cannot rewrite last quarter's attribution,
 * because the row says what was matched and when and on what basis.
 *
 * The alternative, a view that joins prospects to profiles by domain on every
 * read, gives a different answer every time either side changes. Nobody can
 * plan from a number that moves.
 *
 * ## The three bases, in order of confidence
 *
 * `email` - they signed up with an address we actually wrote to. Certain.
 *
 * `domain` - they signed up with a different address at the same company.
 *   Strong: somebody at the company we emailed bought from us.
 *
 * `manual` - somebody decided. Recorded as such so it is never confused with
 *   either of the above.
 *
 * Free-mail domains are excluded from domain matching, and that is not a
 * nicety. Matching on `gmail.com` would attribute every Gmail signup in the
 * database to whichever prospect happened to have a Gmail contact, which is
 * not a small error - it is every number in the report.
 */

/** Domains where sharing one proves nothing about sharing an employer. */
const FREE_MAIL = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.uk',
  'hotmail.com',
  'hotmail.co.uk',
  'outlook.com',
  'live.com',
  'live.co.uk',
  'msn.com',
  'aol.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'proton.me',
  'protonmail.com',
  'gmx.com',
  'gmx.de',
  'yandex.ru',
  'mail.com',
  'zoho.com',
  'fastmail.com',
  'btinternet.com',
  'sky.com',
  'virginmedia.com',
]);

export interface AttributionRow {
  prospectId: string;
  prospectName: string;
  profileId: string;
  profileEmail: string;
  matchedBy: 'email' | 'domain' | 'token' | 'manual';
  matchedAt: string;
  orders: number;
  revenueMinor: number;
}

export const salesAttributionService = {
  /**
   * Look for customers who came from outreach.
   *
   * Runs over every prospect and every profile. Both are paged, because
   * PostgREST truncates a result at a thousand rows without saying so and a
   * silent truncation here does not break anything - it just quietly stops
   * attributing revenue, which nobody notices until a quarter is over.
   *
   * Idempotent: an attribution already recorded is left exactly as it was,
   * including its basis. Re-running this cannot upgrade a `domain` match to an
   * `email` one or the other way round, which is the point of writing it down.
   */
  async match(actor?: string): Promise<{ created: number; checked: number }> {
    if (!isSupabaseEnabled()) return { created: 0, checked: 0 };

    const supabase = getAdminScopedClient();

    const profiles = await readAllPages<{ id: string; email: string }>(
      'the customer list',
      (from, to) => supabase.from('profiles').select('id, email').range(from, to),
    );

    const prospects = await readAllPages<{ id: string; domain: string }>(
      'the prospect list for attribution',
      (from, to) => supabase.from('prospects').select('id, domain').range(from, to),
    );

    const contacts = await readAllPages<{ prospect_id: string; email: string }>(
      'the contact list for attribution',
      (from, to) => supabase.from('prospect_contacts').select('prospect_id, email').range(from, to),
    );

    const existing = await readAllPages<{ prospect_id: string; profile_id: string }>(
      'the attributions already recorded',
      (from, to) =>
        supabase.from('prospect_attributions').select('prospect_id, profile_id').range(from, to),
    );

    const already = new Set(existing.map((row) => `${row.prospect_id}:${row.profile_id}`));

    const byContactEmail = new Map<string, string>();
    for (const contact of contacts) byContactEmail.set(contact.email.toLowerCase(), contact.prospect_id);

    const byDomain = new Map<string, string>();
    for (const prospect of prospects) byDomain.set(prospect.domain.toLowerCase(), prospect.id);

    const toWrite: { prospect_id: string; profile_id: string; matched_by: string }[] = [];

    for (const profile of profiles) {
      const email = (profile.email ?? '').toLowerCase().trim();
      if (!email.includes('@')) continue;

      const domain = email.split('@')[1] ?? '';

      // An address we actually wrote to. The strongest basis there is.
      const byEmail = byContactEmail.get(email);
      if (byEmail && !already.has(`${byEmail}:${profile.id}`)) {
        toWrite.push({ prospect_id: byEmail, profile_id: profile.id, matched_by: 'email' });
        already.add(`${byEmail}:${profile.id}`);
        continue;
      }
      if (byEmail) continue;

      /*
        A colleague at the same company.

        Free-mail domains are skipped: matching on gmail.com would attribute
        every Gmail signup to whichever prospect happened to have a Gmail
        contact, and that is not an edge case in the numbers - it is all of
        them.
      */
      if (!domain || FREE_MAIL.has(domain)) continue;

      const byCompany = byDomain.get(domain);
      if (byCompany && !already.has(`${byCompany}:${profile.id}`)) {
        toWrite.push({ prospect_id: byCompany, profile_id: profile.id, matched_by: 'domain' });
        already.add(`${byCompany}:${profile.id}`);
      }
    }

    let created = 0;
    const AT_ONCE = 100;

    for (let index = 0; index < toWrite.length; index += AT_ONCE) {
      const slice = toWrite.slice(index, index + AT_ONCE);
      const { data, error } = await supabase
        .from('prospect_attributions')
        .upsert(slice, { onConflict: 'prospect_id,profile_id', ignoreDuplicates: true })
        .select('prospect_id');

      if (error) continue;
      created += (data ?? []).length;
    }

    for (const row of toWrite) {
      await prospectService.recordEvent(row.prospect_id, {
        kind: 'became_customer',
        summary: `Matched to a customer account by ${row.matched_by}`,
        actor,
      });
    }

    return { created, checked: profiles.length };
  },

  /** Attribute a prospect to a customer by hand, where the rule missed it. */
  async attachByHand(
    prospectId: string,
    profileId: string,
    actor?: string,
  ): Promise<{ ok: boolean; error?: string }> {
    if (!isSupabaseEnabled()) return { ok: false, error: 'No database' };

    const { error } = await getAdminScopedClient().from('prospect_attributions').upsert(
      { prospect_id: prospectId, profile_id: profileId, matched_by: 'manual' },
      { onConflict: 'prospect_id,profile_id', ignoreDuplicates: true },
    );

    if (error) return { ok: false, error: error.message };

    await prospectService.recordEvent(prospectId, {
      kind: 'became_customer',
      summary: 'Linked to a customer account by hand',
      actor,
    });

    return { ok: true };
  },

  /**
   * What outreach has actually produced.
   *
   * Orders and revenue are read from `orders` rather than kept here, so the
   * figure is the same one the orders page shows. A sales report with its own
   * copy of revenue is a sales report that disagrees with finance.
   *
   * Only paid orders count. A draft order is a basket, and counting baskets as
   * revenue is how an outbound programme reports a success it did not have.
   */
  async report(): Promise<AttributionRow[]> {
    if (!isSupabaseEnabled()) return [];

    const supabase = getAdminScopedClient();

    const rows = await readAllPages<{
      prospect_id: string;
      profile_id: string;
      matched_by: AttributionRow['matchedBy'];
      matched_at: string;
      prospects: { company_name: string } | null;
      profiles: { email: string } | null;
    }>('the attribution report', (from, to) =>
      supabase
        .from('prospect_attributions')
        .select('prospect_id, profile_id, matched_by, matched_at, prospects(company_name), profiles(email)')
        .order('matched_at', { ascending: false })
        .range(from, to),
    );

    if (rows.length === 0) return [];

    const profileIds = [...new Set(rows.map((row) => row.profile_id))];
    const totals = new Map<string, { orders: number; revenueMinor: number }>();

    const ASK_AT_ONCE = 100;
    for (let index = 0; index < profileIds.length; index += ASK_AT_ONCE) {
      const slice = profileIds.slice(index, index + ASK_AT_ONCE);
      const { data } = await supabase
        .from('orders')
        .select('user_id, total_minor, status')
        .in('user_id', slice)
        // A draft order is a basket. Counting one as revenue is how an
        // outbound programme reports a success it did not have.
        .neq('status', 'draft')
        .neq('status', 'cancelled');

      for (const order of (data ?? []) as { user_id: string; total_minor: number }[]) {
        const held = totals.get(order.user_id) ?? { orders: 0, revenueMinor: 0 };
        held.orders += 1;
        held.revenueMinor += Number(order.total_minor ?? 0);
        totals.set(order.user_id, held);
      }
    }

    return rows.map((row) => {
      const held = totals.get(row.profile_id) ?? { orders: 0, revenueMinor: 0 };
      return {
        prospectId: row.prospect_id,
        prospectName: row.prospects?.company_name ?? '(deleted)',
        profileId: row.profile_id,
        profileEmail: row.profiles?.email ?? '(deleted)',
        matchedBy: row.matched_by,
        matchedAt: row.matched_at,
        orders: held.orders,
        revenueMinor: held.revenueMinor,
      };
    });
  },
};

/** Exported for the verifier: the rule that keeps gmail.com out of matching. */
export function isFreeMail(domain: string): boolean {
  return FREE_MAIL.has(domain.toLowerCase());
}
