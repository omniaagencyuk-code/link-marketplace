import { getAdminScopedClient } from '@/lib/supabase/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { domainSearch, type HunterResult } from '@/lib/sales/hunter-client';
import { isHunterConfigured } from '@/lib/sales/hunter-config';
import { bestContact, rankContacts } from '@/lib/sales/contact-ranking';
import { lookupsAffordable, mayLookUp } from '@/lib/sales/credit-guard';
import { scoreProspect } from '@/lib/sales/scoring';
import { prospectService } from './prospect-service';
import { salesRunService } from './sales-run-service';
import { salesSettingsService } from './sales-settings-service';
import type { ProspectQualification } from '@/lib/types/sales';

/**
 * Finding somebody to write to, and paying for it.
 *
 * Every call to Hunter costs a credit against a metered account, so this
 * module is arranged around one rule: **the ledger is written whether or not
 * the call worked.** `hunter_lookups` gets a row for the success, the 404, the
 * rate limit and the timeout, each carrying what it actually charged - and a
 * rejected request charges nothing, which is why that distinction is in the
 * client rather than assumed here.
 *
 * The budget is summed from those rows. That is the arrangement 0014 arrived
 * at for Ahrefs, after the refresh spent a month computing its own spend from
 * an estimate that stopped being true the moment the request changed.
 *
 * ## The guard is not here
 *
 * `mayLookUp` is a pure function in `sales/credit-guard.ts`, and the decision
 * is made before the client is touched. A module that both wants to make the
 * call and decides whether it may is a module that has to be trusted; this one
 * only gets to ask.
 */

export interface FindContactsOutcome {
  ok: boolean;
  found: number;
  /** The address chosen, where one was. */
  selected?: string;
  creditsCharged: number;
  error?: string;
  /** True when the guard refused before anything was spent. */
  refused?: boolean;
}

/**
 * Write the ledger row.
 *
 * Never throws, and never carries the request URL - Hunter takes its key as a
 * query parameter, so the URL is a credential and the client has already
 * redacted anything that could hold one.
 */
async function recordLookup(entry: {
  prospectId?: string;
  endpoint: 'domain-search' | 'email-finder' | 'email-verifier' | 'account';
  query?: string;
  result: HunterResult<unknown>;
  resultsCount?: number;
}): Promise<void> {
  if (!isSupabaseEnabled()) return;

  try {
    await getAdminScopedClient().from('hunter_lookups').insert({
      prospect_id: entry.prospectId ?? null,
      endpoint: entry.endpoint,
      query: entry.query ?? null,
      credits_charged: entry.result.creditsCharged,
      results_count: entry.resultsCount ?? null,
      http_status: entry.result.httpStatus ?? null,
      error: entry.result.error ? entry.result.error.slice(0, 300) : null,
      account_requests_used: entry.result.requestsUsed ?? null,
      account_requests_available: entry.result.requestsAvailable ?? null,
    });
  } catch (error) {
    /*
      The one failure here that would be expensive.

      If the ledger write fails the credit was still spent, and the budget is
      counted from the ledger - so a silent failure means the guard
      under-counts and keeps spending. It is logged loudly for that reason, and
      never allowed to roll back work that has already been paid for.
    */
    console.error(
      '[sales] HUNTER CREDIT SPENT BUT NOT RECORDED - the budget will under-count:',
      String(error).slice(0, 200),
    );
  }
}

export const salesContactService = {
  /**
   * Look up one company's people.
   *
   * Refuses before spending where the guard says no, and the refusal says
   * which switch to change. A refusal is not an error state on the prospect:
   * `contacts_status` is left alone, so raising the budget and running again
   * picks the same prospect up rather than needing it reset.
   */
  async findContacts(prospectId: string, actor?: string): Promise<FindContactsOutcome> {
    if (!isSupabaseEnabled()) return { ok: false, found: 0, creditsCharged: 0, error: 'No database' };

    const settings = await salesSettingsService.get();
    if (!settings) return { ok: false, found: 0, creditsCharged: 0, error: 'No sales settings' };

    const spend = await salesSettingsService.spend();

    const decision = mayLookUp({
      settings,
      configured: isHunterConfigured(),
      creditsUsedThisCycle: spend?.hunterCreditsUsed ?? 0,
      cost: 1,
    });

    if (!decision.allowed) {
      return { ok: false, found: 0, creditsCharged: 0, error: decision.reason, refused: true };
    }

    const prospect = await prospectService.getById(prospectId);
    if (!prospect) return { ok: false, found: 0, creditsCharged: 0, error: 'No such prospect' };

    /*
      A competitor is never looked up.

      Not because the lookup would fail, but because it would succeed: a credit
      spent finding the name of somebody at a company that sells what we sell
      is a credit spent on a prospect nobody may contact.
    */
    if (prospect.segment === 'publisher_network') {
      await getAdminScopedClient()
        .from('prospects')
        .update({ contacts_status: 'skipped', contacts_checked_at: new Date().toISOString() })
        .eq('id', prospectId);

      return {
        ok: false,
        found: 0,
        creditsCharged: 0,
        error: 'A publisher or marketplace. They sell what we sell, so nobody is looked up.',
        refused: true,
      };
    }

    const supabase = getAdminScopedClient();
    await supabase.from('prospects').update({ contacts_status: 'running' }).eq('id', prospectId);

    const result = await domainSearch(prospect.domain, 10);

    await recordLookup({
      prospectId,
      endpoint: 'domain-search',
      query: prospect.domain,
      result,
      resultsCount: result.data?.people.length,
    });

    if (!result.data) {
      await supabase
        .from('prospects')
        .update({ contacts_status: 'failed', contacts_checked_at: new Date().toISOString() })
        .eq('id', prospectId);

      await prospectService.recordEvent(prospectId, {
        kind: 'contacts_failed',
        summary: result.error ?? 'Hunter returned nothing',
        actor,
      });

      return {
        ok: false,
        found: 0,
        creditsCharged: result.creditsCharged,
        error: result.error ?? 'Hunter returned nothing',
      };
    }

    const people = result.data.people;

    if (people.length === 0) {
      await supabase
        .from('prospects')
        .update({ contacts_status: 'none', contacts_checked_at: new Date().toISOString() })
        .eq('id', prospectId);

      await prospectService.recordEvent(prospectId, {
        kind: 'contacts_none',
        summary: 'Hunter knows nobody at this domain',
        detail: { creditsCharged: result.creditsCharged },
        actor,
      });

      return { ok: true, found: 0, creditsCharged: result.creditsCharged };
    }

    const ranked = rankContacts(people);

    /*
      Everyone is stored, not only the chosen one.

      The credit has been spent on all of them, and storing one means paying
      again to see the rest when the first choice turns out to be wrong. The
      rank and its reason go in `hunter_payload` so a human overruling the
      choice can see what the choice was made on.
    */
    const { error: writeError } = await supabase.from('prospect_contacts').upsert(
      ranked.map((entry) => ({
        prospect_id: prospectId,
        email: entry.person.email,
        full_name:
          [entry.person.firstName, entry.person.lastName].filter(Boolean).join(' ') || null,
        first_name: entry.person.firstName ?? null,
        last_name: entry.person.lastName ?? null,
        role: entry.person.position ?? null,
        seniority: entry.person.seniority ?? null,
        department: entry.person.department ?? null,
        linkedin_url: entry.person.linkedin ?? null,
        email_confidence: entry.person.confidence ?? null,
        verification: verificationFor(entry.person.verification),
        source: 'hunter',
        hunter_payload: { rank: entry.score, reason: entry.reason },
      })),
      { onConflict: 'prospect_id,email' },
    );

    if (writeError) {
      return {
        ok: false,
        found: 0,
        creditsCharged: result.creditsCharged,
        error: `Hunter found ${people.length} but they could not be saved: ${writeError.message}`,
      };
    }

    const choice = bestContact(people);

    if (choice) {
      const { data: row } = await supabase
        .from('prospect_contacts')
        .select('id')
        .eq('prospect_id', prospectId)
        .eq('email', choice.person.email)
        .maybeSingle();

      if (row) {
        await prospectService.selectContact(prospectId, String((row as { id: string }).id), actor);
      }
    }

    await supabase
      .from('prospects')
      .update({
        contacts_status: 'found',
        contacts_checked_at: new Date().toISOString(),
      })
      .eq('id', prospectId);

    // Reachability is part of the score, so finding somebody changes it.
    await salesContactService.rescore(prospectId);

    await prospectService.recordEvent(prospectId, {
      kind: 'contacts_found',
      summary:
        `Hunter found ${people.length} ${people.length === 1 ? 'person' : 'people'}` +
        (choice ? `; writing to ${choice.person.email} (${choice.reason})` : '; none usable'),
      detail: { creditsCharged: result.creditsCharged },
      actor,
    });

    return {
      ok: true,
      found: people.length,
      selected: choice?.person.email,
      creditsCharged: result.creditsCharged,
    };
  },

  /**
   * Recompute the score from what is now known.
   *
   * Called after anything that changes an input: a qualification, a contact
   * being found, a contact being chosen. The score is deterministic, so this
   * is a re-derivation rather than a new judgement - and it is cheap, which is
   * why it is easier to recompute than to patch the components by hand.
   */
  async rescore(prospectId: string): Promise<number | null> {
    if (!isSupabaseEnabled()) return null;

    const prospect = await prospectService.getById(prospectId);
    if (!prospect) return null;

    const [qualifications, contacts] = await Promise.all([
      prospectService.qualifications(prospectId),
      prospectService.contacts(prospectId),
    ]);

    const latest: ProspectQualification | undefined = qualifications[0];

    const scored = scoreProspect(
      {
        segment: prospect.segment,
        signals: prospect.signals,
        contactsStatus: prospect.contactsStatus,
        hasSelectedContact: contacts.some((contact) => contact.selected),
      },
      latest
        ? {
            verdict: latest.verdict,
            confidence: latest.confidence,
            reasons: latest.reasons,
            buyingSignals: latest.buyingSignals,
          }
        : undefined,
    );

    await getAdminScopedClient()
      .from('prospects')
      .update({
        score: scored.score,
        score_breakdown: scored.breakdown,
        scored_at: new Date().toISOString(),
      })
      .eq('id', prospectId);

    return scored.score;
  },

  /** Add somebody by hand, for the prospects Hunter has never heard of. */
  async addContact(
    prospectId: string,
    input: { email: string; fullName?: string; role?: string },
    actor?: string,
  ): Promise<{ ok: boolean; error?: string }> {
    if (!isSupabaseEnabled()) return { ok: false, error: 'No database' };

    const email = input.email.trim().toLowerCase();
    if (!email.includes('@') || email.startsWith('@') || email.endsWith('@')) {
      return { ok: false, error: 'That is not an email address.' };
    }

    const { data, error } = await getAdminScopedClient()
      .from('prospect_contacts')
      .upsert(
        {
          prospect_id: prospectId,
          email,
          full_name: input.fullName?.trim() || null,
          role: input.role?.trim() || null,
          source: 'manual',
          // Nobody has verified it. Saying `unverified` rather than `valid` is
          // the difference between a bounce we chose and one we were surprised
          // by.
          verification: 'unverified',
        },
        { onConflict: 'prospect_id,email' },
      )
      .select('id')
      .maybeSingle();

    if (error) return { ok: false, error: error.message };

    await getAdminScopedClient()
      .from('prospects')
      .update({ contacts_status: 'found', contacts_checked_at: new Date().toISOString() })
      .eq('id', prospectId);

    if (data) {
      await prospectService.selectContact(prospectId, String((data as { id: string }).id), actor);
    }
    await salesContactService.rescore(prospectId);

    await prospectService.recordEvent(prospectId, {
      kind: 'contact_added',
      summary: `${email} added by hand`,
      actor,
    });

    return { ok: true };
  },

  async startSweep(by?: string): Promise<string | null> {
    return salesRunService.claim('contacts', false, by);
  },

  /**
   * Look up contacts for the prospects worth contacting.
   *
   * The affordable count is asked once, up front, rather than per prospect.
   * A sweep that discovers halfway through that it cannot finish leaves half
   * its prospects marked `running`, and the next run has to work out which
   * half - so instead it takes only as many as the guard says it can pay for.
   */
  async advanceSweep(budgetMs = 240_000): Promise<{
    idle: boolean;
    looked: number;
    found: number;
    creditsSpent: number;
    finished: boolean;
    outOfTime: boolean;
    reason?: string;
  }> {
    const idle = {
      idle: true,
      looked: 0,
      found: 0,
      creditsSpent: 0,
      finished: false,
      outOfTime: false,
    };

    if (!isSupabaseEnabled()) return idle;

    const run = await salesRunService.live('contacts');
    if (!run) return idle;

    const settings = await salesSettingsService.get();
    if (!settings) {
      await salesRunService.finish(run.id, { status: 'failed', error: 'No sales settings' });
      return { ...idle, idle: false, finished: true };
    }

    const spend = await salesSettingsService.spend();
    const affordable = lookupsAffordable({
      settings,
      configured: isHunterConfigured(),
      creditsUsedThisCycle: spend?.hunterCreditsUsed ?? 0,
    });

    if (affordable === 0) {
      const reason =
        mayLookUp({
          settings,
          configured: isHunterConfigured(),
          creditsUsedThisCycle: spend?.hunterCreditsUsed ?? 0,
          cost: 1,
        });
      const message = reason.allowed ? 'No credits left before the guard.' : reason.reason;

      await salesRunService.finish(run.id, { status: 'skipped', reason: message });
      return { ...idle, idle: false, finished: true, reason: message };
    }

    const started = Date.now();
    const total = { looked: 0, found: 0, creditsSpent: 0 };
    let outOfTime = false;

    /*
      Only prospects somebody would actually email.

      Qualified, above the score floor, not a competitor, and no contact yet.
      Spending a credit on a prospect below the floor is spending a credit on a
      prospect nobody is going to write to.
    */
    const candidates = await prospectService.contactable(settings.minScoreToContact, affordable);
    const needing = candidates.filter((prospect) => prospect.contactsStatus === 'pending');

    for (const prospect of needing) {
      if (Date.now() - started > budgetMs) {
        outOfTime = true;
        break;
      }

      total.looked += 1;
      const outcome = await salesContactService.findContacts(prospect.id, run.startedBy);

      if (outcome.found > 0) total.found += 1;
      total.creditsSpent += outcome.creditsCharged;

      await salesRunService.progress(run.id, {
        looked: 1,
        succeeded: outcome.found > 0 ? 1 : 0,
        failed: outcome.ok ? 0 : 1,
        creditsSpent: outcome.creditsCharged,
      });

      // A refusal mid-sweep means the guard closed while it ran. Stopping is
      // right: the alternative is a run of refusals recorded as failures.
      if (outcome.refused) {
        await salesRunService.finish(run.id, { status: 'skipped', reason: outcome.error });
        return { idle: false, ...total, finished: true, outOfTime: false, reason: outcome.error };
      }
    }

    if (outOfTime) {
      await salesRunService.release(run.id);
      return { idle: false, ...total, finished: false, outOfTime: true };
    }

    await salesRunService.finish(run.id, { status: 'completed' });
    return { idle: false, ...total, finished: true, outOfTime: false };
  },
};

/**
 * Hunter's statuses, mapped to ours.
 *
 * `webmail` and `disposable` have no column of their own and both mean "do not
 * rely on this": a free-mail address at a company domain is usually somebody's
 * personal account, and a disposable one is nobody's. They become `unknown`
 * rather than `valid`, because the ranking already penalises what it can see
 * and the column should not claim more than was established.
 */
function verificationFor(status?: string): string {
  switch (status) {
    case 'valid':
      return 'valid';
    case 'invalid':
      return 'invalid';
    case 'accept_all':
      return 'accept_all';
    case 'unknown':
    case 'webmail':
    case 'disposable':
      return 'unknown';
    default:
      return 'unverified';
  }
}
