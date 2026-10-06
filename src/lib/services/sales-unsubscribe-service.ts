import { getAdminScopedClient } from '@/lib/supabase/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { prospectService } from './prospect-service';

/**
 * Honouring an unsubscribe.
 *
 * Reached from a link in an email by somebody who is not signed in and never
 * will be, so this is the one part of the Sales Centre with no admin gate. The
 * token is what stands in for one: a random 32-character value on the prospect
 * row, never its id, so guessing the next one is not a thing that can be done.
 *
 * ## What an unknown token does
 *
 * Nothing, and it says nothing. "No such prospect" on an unsubscribe page tells
 * whoever is poking at it which tokens are real, and the honest answer to
 * somebody who followed a stale link is the same as the answer to somebody who
 * succeeded: you will not hear from us. So both get that.
 *
 * ## Why the whole company
 *
 * One person asking us to stop is the company asking us to stop. Suppressing
 * only their address leaves their colleague on the list, and the second email
 * is the one that gets reported rather than ignored. `sales_suppressions` takes
 * a domain for exactly this.
 */

export interface UnsubscribeOutcome {
  /** Always true to the caller. See above: an unknown token is not news. */
  acknowledged: true;
  /** For the admin timeline only. Never shown to the person unsubscribing. */
  matched: boolean;
  companyName?: string;
}

export const salesUnsubscribeService = {
  /**
   * Who a token belongs to, for the confirmation page.
   *
   * Returns the company name and nothing else - no contact, no email, no
   * pipeline state. A page anybody can open with a token from a forwarded
   * email should not tell them what we think of that company.
   */
  async company(token: string): Promise<{ companyName: string } | null> {
    if (!isSupabaseEnabled()) return null;
    if (!/^[0-9a-f]{32}$/.test(token)) return null;

    const { data } = await getAdminScopedClient()
      .from('prospects')
      .select('company_name')
      .eq('public_token', token)
      .maybeSingle();

    if (!data) return null;
    return { companyName: String((data as { company_name: string }).company_name) };
  },

  async unsubscribe(token: string): Promise<UnsubscribeOutcome> {
    if (!isSupabaseEnabled()) return { acknowledged: true, matched: false };

    // Shape-checked before it reaches a query. The column is unique and
    // indexed, and a 4KB "token" is a request to scan it.
    if (!/^[0-9a-f]{32}$/.test(token)) return { acknowledged: true, matched: false };

    const { data } = await getAdminScopedClient()
      .from('prospects')
      .select('id, company_name, domain')
      .eq('public_token', token)
      .maybeSingle();

    if (!data) return { acknowledged: true, matched: false };

    const prospect = data as { id: string; company_name: string; domain: string };

    /*
      The suppression first, then the stage.

      In that order on purpose: the suppression is what the trigger on
      `outbound_emails` reads, so until it exists the stage is a label on a
      company we would still email tomorrow. Every approved email already in
      the queue for them becomes unsendable the moment this row lands.
    */
    await prospectService.suppressDomain(prospect.domain, 'unsubscribed', 'unsubscribe-link');

    await getAdminScopedClient()
      .from('prospects')
      .update({ stage: 'unsubscribed' })
      .eq('id', prospect.id);

    /*
      Cancel what is queued rather than leaving it to be refused.

      The trigger would refuse each send, but a queue full of rows that will
      never go is a queue nobody can read. Cancelling is always allowed from
      any state, including a suppressed one - stopping is never the thing to
      refuse.
    */
    await getAdminScopedClient()
      .from('outbound_emails')
      .update({ status: 'cancelled', status_reason: 'They unsubscribed' })
      .eq('prospect_id', prospect.id)
      .in('status', ['draft', 'needs_review', 'approved', 'scheduled']);

    await prospectService.recordEvent(prospect.id, {
      kind: 'unsubscribed',
      summary: 'They used the unsubscribe link. The whole domain is suppressed.',
      actor: 'unsubscribe-link',
    });

    return { acknowledged: true, matched: true, companyName: prospect.company_name };
  },
};
