import { getAdminScopedClient } from '@/lib/supabase/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { readAllPages } from '@/lib/services/supabase/paged';
import { normaliseDomain, isValidDomain } from '@/lib/import/normalise';
import { isContactable } from '@/lib/config/sales-segments';
import type {
  ContactsStatus,
  Prospect,
  ProspectContact,
  ProspectEvent,
  ProspectPage,
  ProspectQualification,
  ProspectSignals,
  ProspectStage,
  SalesSegment,
  SweepStatus,
} from '@/lib/types/sales';

/**
 * Prospects: the companies, and everything hanging off one.
 *
 * The domain is the identity. It is normalised through the same function the
 * CSV importer uses on publisher domains - lowercase, no protocol, no www, no
 * path - because one company reached twice from two spellings of its own
 * website is exactly what makes outbound look like spam, and the second
 * spelling always arrives in a different import.
 *
 * Every state change writes a `prospect_events` row. That is not an audit
 * habit for its own sake: "why did this company get three emails from us" is
 * a question somebody will ask, and reconstructing the answer from five
 * tables is how it goes unanswered.
 */

const PROSPECT_SELECT = `
  id, public_token, company_name, domain, website_url, segment, stage,
  country_code, source, source_detail,
  research_status, researched_at, research_error, signals,
  qualified, qualified_at, disqualified_reason,
  score, score_breakdown, scored_at,
  contacts_status, contacts_checked_at,
  owner, notes, last_contacted_at, last_reply_at,
  created_by, created_at, updated_at
`;

type Row = Record<string, unknown>;

const text = (value: unknown): string | undefined => {
  const string = typeof value === 'string' ? value.trim() : '';
  return string ? string : undefined;
};

function mapProspect(row: Row): Prospect {
  return {
    id: String(row.id),
    publicToken: String(row.public_token),
    companyName: String(row.company_name ?? ''),
    domain: String(row.domain ?? ''),
    websiteUrl: text(row.website_url),
    segment: (row.segment as SalesSegment) ?? 'other',
    stage: (row.stage as ProspectStage) ?? 'new',
    countryCode: text(row.country_code),
    source: (row.source as Prospect['source']) ?? 'manual',
    sourceDetail: text(row.source_detail),
    researchStatus: (row.research_status as SweepStatus) ?? 'pending',
    researchedAt: text(row.researched_at),
    researchError: text(row.research_error),
    signals: (row.signals as ProspectSignals) ?? {},
    // Null and false mean different things: null is "nobody has read them",
    // false is "a model read them and said no".
    qualified: row.qualified === null || row.qualified === undefined
      ? undefined
      : Boolean(row.qualified),
    qualifiedAt: text(row.qualified_at),
    disqualifiedReason: text(row.disqualified_reason),
    score: row.score === null || row.score === undefined ? undefined : Number(row.score),
    scoreBreakdown: (row.score_breakdown as Record<string, number>) ?? {},
    scoredAt: text(row.scored_at),
    contactsStatus: (row.contacts_status as ContactsStatus) ?? 'pending',
    contactsCheckedAt: text(row.contacts_checked_at),
    owner: text(row.owner),
    notes: text(row.notes),
    lastContactedAt: text(row.last_contacted_at),
    lastReplyAt: text(row.last_reply_at),
    createdBy: text(row.created_by),
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  };
}

export interface ProspectFilter {
  stage?: ProspectStage;
  segment?: SalesSegment;
  minScore?: number;
  /** Matches the company name or the domain. */
  term?: string;
  qualifiedOnly?: boolean;
}

export interface AddProspectInput {
  companyName: string;
  domain: string;
  segment?: SalesSegment;
  countryCode?: string;
  source?: Prospect['source'];
  sourceDetail?: string;
  notes?: string;
  owner?: string;
}

export interface ImportOutcome {
  added: number;
  /** Already present, by domain. Not an error - an import is run twice. */
  duplicates: number;
  /** Rejected, with the reason, so a bad CSV says which rows and why. */
  rejected: { row: number; value: string; reason: string }[];
}

export type SuppressionReason =
  | 'unsubscribed'
  | 'bounced'
  | 'complained'
  | 'manual'
  | 'do_not_contact';

/**
 * Add a suppression, idempotently.
 *
 * Deliberately not an upsert. The unique indexes behind this table are on
 * `lower(email)` and `lower(domain)` - expression indexes, which PostgREST
 * cannot infer a conflict target from, so `onConflict: 'domain'` is rejected
 * by the server rather than silently doing the wrong thing. Inserting and
 * treating a unique violation as "already suppressed" is the honest shape:
 * the row existing is the outcome we wanted either way.
 *
 * It never throws. An unsubscribe arrives while somebody is reading their
 * mail, and the one failure mode that must not exist here is a suppression
 * that was refused because it was already there.
 */
async function suppress(
  who: { email?: string; domain?: string },
  reason: SuppressionReason,
  actor?: string,
): Promise<void> {
  if (!isSupabaseEnabled()) return;

  const { error } = await getAdminScopedClient().from('sales_suppressions').insert({
    email: who.email ?? null,
    domain: who.domain ?? null,
    reason,
    created_by: actor ?? null,
  });

  // 23505 is a unique violation: it is already on the list, which is the
  // state this function exists to reach.
  if (error && error.code !== '23505') {
    console.error('[sales] could not write a suppression:', error.message.slice(0, 200));
  }
}

export const prospectService = {
  /**
   * The whole list, paged.
   *
   * Paged rather than limited because PostgREST silently caps a result at a
   * thousand rows - the trap that had the Ahrefs refresh quietly refreshing
   * only its first thousand domains for every run it ever did. A prospect
   * list will pass a thousand, and when it does nothing will say so.
   */
  async list(filter: ProspectFilter = {}): Promise<Prospect[]> {
    if (!isSupabaseEnabled()) return [];

    const supabase = getAdminScopedClient();
    const rows = await readAllPages<Row>('the prospect list', (from, to) => {
      let query = supabase
        .from('prospects')
        .select(PROSPECT_SELECT)
        .order('score', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (filter.stage) query = query.eq('stage', filter.stage);
      if (filter.segment) query = query.eq('segment', filter.segment);
      if (filter.minScore !== undefined) query = query.gte('score', filter.minScore);
      if (filter.qualifiedOnly) query = query.eq('qualified', true);
      if (filter.term) {
        const term = filter.term.replace(/[%,]/g, '').trim();
        if (term) query = query.or(`company_name.ilike.%${term}%,domain.ilike.%${term}%`);
      }

      return query;
    });

    return rows.map(mapProspect);
  },

  async getById(id: string): Promise<Prospect | null> {
    if (!isSupabaseEnabled()) return null;

    const { data, error } = await getAdminScopedClient()
      .from('prospects')
      .select(PROSPECT_SELECT)
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(`Could not read the prospect: ${error.message}`);
    return data ? mapProspect(data as Row) : null;
  },

  /**
   * Add one.
   *
   * Returns the existing prospect where the domain is already known rather
   * than failing: adding a company somebody already added is a thing that
   * happens constantly, and it is not a mistake worth an error message.
   */
  async add(input: AddProspectInput, actor?: string): Promise<{ prospect: Prospect | null; existed: boolean }> {
    if (!isSupabaseEnabled()) return { prospect: null, existed: false };

    const domain = normaliseDomain(input.domain);
    if (!domain || !isValidDomain(domain)) {
      throw new Error(`"${input.domain}" is not a domain we can use.`);
    }

    const supabase = getAdminScopedClient();

    const { data: existing } = await supabase
      .from('prospects')
      .select(PROSPECT_SELECT)
      .eq('domain', domain)
      .maybeSingle();

    if (existing) return { prospect: mapProspect(existing as Row), existed: true };

    const { data, error } = await supabase
      .from('prospects')
      .insert({
        company_name: input.companyName.trim() || domain,
        domain,
        website_url: `https://${domain}/`,
        segment: input.segment ?? 'other',
        country_code: input.countryCode ?? null,
        source: input.source ?? 'manual',
        source_detail: input.sourceDetail ?? null,
        notes: input.notes ?? null,
        owner: input.owner ?? actor ?? null,
        created_by: actor ?? null,
      })
      .select(PROSPECT_SELECT)
      .maybeSingle();

    if (error) throw new Error(`Could not add the prospect: ${error.message}`);
    const prospect = data ? mapProspect(data as Row) : null;

    if (prospect) {
      await prospectService.recordEvent(prospect.id, {
        kind: 'created',
        summary: `Added from ${prospect.source}`,
        actor,
      });
    }

    return { prospect, existed: false };
  },

  /**
   * A list of domains, in one go.
   *
   * Written for a pasted list or a CSV column. Deduplicates within the input
   * as well as against what is stored, because the same company appearing
   * twice in one paste is the ordinary case rather than the odd one.
   */
  async importDomains(
    entries: { companyName?: string; domain: string }[],
    options: { segment?: SalesSegment; source?: Prospect['source']; sourceDetail?: string; actor?: string } = {},
  ): Promise<ImportOutcome> {
    const outcome: ImportOutcome = { added: 0, duplicates: 0, rejected: [] };
    if (!isSupabaseEnabled()) return outcome;

    const seen = new Set<string>();
    const clean: { companyName: string; domain: string }[] = [];

    entries.forEach((entry, index) => {
      const domain = normaliseDomain(entry.domain ?? '');
      if (!domain || !isValidDomain(domain)) {
        outcome.rejected.push({
          row: index + 1,
          value: entry.domain ?? '',
          reason: 'Not a usable domain',
        });
        return;
      }
      if (seen.has(domain)) {
        outcome.duplicates += 1;
        return;
      }
      seen.add(domain);
      clean.push({ companyName: (entry.companyName ?? '').trim() || domain, domain });
    });

    if (clean.length === 0) return outcome;

    const supabase = getAdminScopedClient();

    /*
      Which of these we already hold, asked in chunks.

      A single `in` filter with four thousand domains is a URL no server
      accepts, and PostgREST's answer to one that is too long is a 414 rather
      than a smaller result - so the question is asked in pieces whose size is
      chosen to keep the query string well inside any limit.
    */
    const known = new Set<string>();
    const ASK_AT_ONCE = 200;
    for (let index = 0; index < clean.length; index += ASK_AT_ONCE) {
      const slice = clean.slice(index, index + ASK_AT_ONCE).map((entry) => entry.domain);
      const { data, error } = await supabase.from('prospects').select('domain').in('domain', slice);
      if (error) throw new Error(`Could not check for existing prospects: ${error.message}`);
      for (const row of data ?? []) known.add(String((row as Row).domain));
    }

    const fresh = clean.filter((entry) => !known.has(entry.domain));
    outcome.duplicates += clean.length - fresh.length;

    const WRITE_AT_ONCE = 100;
    for (let index = 0; index < fresh.length; index += WRITE_AT_ONCE) {
      const slice = fresh.slice(index, index + WRITE_AT_ONCE);
      const { data, error } = await supabase
        .from('prospects')
        .insert(
          slice.map((entry) => ({
            company_name: entry.companyName,
            domain: entry.domain,
            website_url: `https://${entry.domain}/`,
            segment: options.segment ?? 'other',
            source: options.source ?? 'csv',
            source_detail: options.sourceDetail ?? null,
            created_by: options.actor ?? null,
            owner: options.actor ?? null,
          })),
        )
        .select('id');

      if (error) {
        // A race with another import, almost always. The domains that did go
        // in are already in; the rest are counted as duplicates rather than
        // losing the whole chunk.
        outcome.duplicates += slice.length;
        continue;
      }
      outcome.added += (data ?? []).length;
    }

    return outcome;
  },

  async update(
    id: string,
    patch: Partial<
      Pick<
        Prospect,
        | 'companyName'
        | 'segment'
        | 'stage'
        | 'countryCode'
        | 'notes'
        | 'owner'
        | 'websiteUrl'
        | 'disqualifiedReason'
      >
    >,
    actor?: string,
  ): Promise<Prospect | null> {
    if (!isSupabaseEnabled()) return null;

    const row: Row = {};
    const put = (key: string, value: unknown) => {
      if (value !== undefined) row[key] = value;
    };

    put('company_name', patch.companyName);
    put('segment', patch.segment);
    put('stage', patch.stage);
    put('country_code', patch.countryCode);
    put('notes', patch.notes);
    put('owner', patch.owner);
    put('website_url', patch.websiteUrl);
    put('disqualified_reason', patch.disqualifiedReason);

    if (Object.keys(row).length === 0) return prospectService.getById(id);

    const { data, error } = await getAdminScopedClient()
      .from('prospects')
      .update(row)
      .eq('id', id)
      .select(PROSPECT_SELECT)
      .maybeSingle();

    if (error) throw new Error(`Could not update the prospect: ${error.message}`);

    if (patch.stage) {
      await prospectService.recordEvent(id, {
        kind: 'stage_changed',
        summary: `Moved to ${patch.stage.replace(/_/g, ' ')}`,
        actor,
      });
    }

    return data ? mapProspect(data as Row) : null;
  },

  /**
   * Move a prospect through the pipeline.
   *
   * A thin wrapper on `update`, kept separate because it is the one that
   * writes the timeline entry people actually read, and because `unsubscribed`
   * means something the other stages do not: it also has to reach the
   * suppression list, or the stage is a label on a company we will email
   * again tomorrow.
   */
  async setStage(id: string, stage: ProspectStage, actor?: string): Promise<Prospect | null> {
    const prospect = await prospectService.update(id, { stage }, actor);

    if (stage === 'unsubscribed' && prospect) {
      await prospectService.suppressDomain(prospect.domain, 'unsubscribed', actor);
    }

    return prospect;
  },

  /**
   * Stop contacting a whole company.
   *
   * Writes the suppression rather than only the stage. The trigger on
   * `outbound_emails` reads this table, so until the row exists the stage is
   * decoration - and every approved email already in the queue for that
   * company becomes unsendable the moment it does, which is the point.
   */
  async suppressDomain(domain: string, reason: SuppressionReason, actor?: string) {
    const clean = normaliseDomain(domain);
    if (!clean) return;
    await suppress({ domain: clean }, reason, actor);
  },

  async suppressEmail(email: string, reason: SuppressionReason, actor?: string) {
    const clean = email.trim().toLowerCase();
    if (!clean.includes('@')) return;
    await suppress({ email: clean }, reason, actor);
  },

  /** The timeline for one prospect, newest first. */
  async events(prospectId: string, limit = 100): Promise<ProspectEvent[]> {
    if (!isSupabaseEnabled()) return [];

    const { data, error } = await getAdminScopedClient()
      .from('prospect_events')
      .select('id, prospect_id, kind, summary, detail, actor, created_at')
      .eq('prospect_id', prospectId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw new Error(`Could not read the prospect timeline: ${error.message}`);

    return (data ?? []).map((row) => {
      const entry = row as Row;
      return {
        id: String(entry.id),
        prospectId: String(entry.prospect_id),
        kind: String(entry.kind),
        summary: String(entry.summary),
        detail: (entry.detail as Record<string, unknown>) ?? {},
        actor: text(entry.actor),
        createdAt: String(entry.created_at),
      };
    });
  },

  /**
   * Write a timeline entry.
   *
   * Never throws. A timeline is a record of work that already happened, and
   * failing to write one must not undo the work it describes - the same rule
   * `emailService` follows for its log.
   */
  async recordEvent(
    prospectId: string,
    entry: { kind: string; summary: string; detail?: Record<string, unknown>; actor?: string },
  ): Promise<void> {
    if (!isSupabaseEnabled()) return;

    try {
      await getAdminScopedClient().from('prospect_events').insert({
        prospect_id: prospectId,
        kind: entry.kind,
        summary: entry.summary.slice(0, 500),
        detail: entry.detail ?? {},
        actor: entry.actor ?? null,
      });
    } catch (error) {
      console.error('[sales] could not write a prospect event:', String(error).slice(0, 200));
    }
  },

  /** The pages the crawl read, for the research panel. */
  async pages(prospectId: string): Promise<ProspectPage[]> {
    if (!isSupabaseEnabled()) return [];

    const { data, error } = await getAdminScopedClient()
      .from('prospect_pages')
      .select('id, prospect_id, url, kind, http_status, title, text_excerpt, bytes, error, fetched_at')
      .eq('prospect_id', prospectId)
      .order('kind');

    if (error) throw new Error(`Could not read the crawled pages: ${error.message}`);

    return (data ?? []).map((row) => {
      const entry = row as Row;
      return {
        id: String(entry.id),
        prospectId: String(entry.prospect_id),
        url: String(entry.url),
        kind: (entry.kind as ProspectPage['kind']) ?? 'other',
        httpStatus: entry.http_status === null ? undefined : Number(entry.http_status),
        title: text(entry.title),
        textExcerpt: String(entry.text_excerpt ?? ''),
        bytes: entry.bytes === null ? undefined : Number(entry.bytes),
        error: text(entry.error),
        fetchedAt: String(entry.fetched_at),
      };
    });
  },

  /** The qualifications, newest first. History, not a single current value. */
  async qualifications(prospectId: string): Promise<ProspectQualification[]> {
    if (!isSupabaseEnabled()) return [];

    const { data, error } = await getAdminScopedClient()
      .from('prospect_qualifications')
      .select(
        'id, prospect_id, verdict, confidence, segment_guess, reasons, buying_signals, model, prompt_version, input_tokens, output_tokens, cost_usd, created_at',
      )
      .eq('prospect_id', prospectId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Could not read the qualifications: ${error.message}`);

    return (data ?? []).map((row) => {
      const entry = row as Row;
      return {
        id: String(entry.id),
        prospectId: String(entry.prospect_id),
        verdict: entry.verdict as ProspectQualification['verdict'],
        confidence: Number(entry.confidence ?? 0),
        segmentGuess: (entry.segment_guess as SalesSegment) ?? undefined,
        reasons: (entry.reasons as ProspectQualification['reasons']) ?? [],
        buyingSignals: (entry.buying_signals as ProspectQualification['buyingSignals']) ?? [],
        model: String(entry.model ?? ''),
        promptVersion: String(entry.prompt_version ?? ''),
        inputTokens: entry.input_tokens === null ? undefined : Number(entry.input_tokens),
        outputTokens: entry.output_tokens === null ? undefined : Number(entry.output_tokens),
        costUsd: entry.cost_usd === null ? undefined : Number(entry.cost_usd),
        createdAt: String(entry.created_at),
      };
    });
  },

  async contacts(prospectId: string): Promise<ProspectContact[]> {
    if (!isSupabaseEnabled()) return [];

    const { data, error } = await getAdminScopedClient()
      .from('prospect_contacts')
      .select(
        'id, prospect_id, email, full_name, first_name, last_name, role, seniority, department, linkedin_url, email_confidence, verification, source, selected, created_at, updated_at',
      )
      .eq('prospect_id', prospectId)
      .order('selected', { ascending: false })
      .order('email_confidence', { ascending: false, nullsFirst: false });

    if (error) throw new Error(`Could not read the contacts: ${error.message}`);

    return (data ?? []).map((row) => {
      const entry = row as Row;
      return {
        id: String(entry.id),
        prospectId: String(entry.prospect_id),
        email: String(entry.email),
        fullName: text(entry.full_name),
        firstName: text(entry.first_name),
        lastName: text(entry.last_name),
        role: text(entry.role),
        seniority: text(entry.seniority),
        department: text(entry.department),
        linkedinUrl: text(entry.linkedin_url),
        emailConfidence:
          entry.email_confidence === null ? undefined : Number(entry.email_confidence),
        verification: (entry.verification as ProspectContact['verification']) ?? 'unverified',
        source: (entry.source as ProspectContact['source']) ?? 'manual',
        selected: Boolean(entry.selected),
        createdAt: String(entry.created_at),
        updatedAt: String(entry.updated_at),
      };
    });
  },

  /**
   * Choose who we write to.
   *
   * Clears the previous choice first, in a separate statement, because the
   * partial unique index allows exactly one selected contact per prospect and
   * setting the new one first would be refused by it. Two selected contacts
   * would mean one company hearing from us twice on the same morning because
   * Hunter happened to find two of its people.
   */
  async selectContact(prospectId: string, contactId: string, actor?: string): Promise<void> {
    if (!isSupabaseEnabled()) return;

    const supabase = getAdminScopedClient();

    await supabase
      .from('prospect_contacts')
      .update({ selected: false })
      .eq('prospect_id', prospectId)
      .eq('selected', true);

    const { data, error } = await supabase
      .from('prospect_contacts')
      .update({ selected: true })
      .eq('id', contactId)
      .eq('prospect_id', prospectId)
      .select('email')
      .maybeSingle();

    if (error) throw new Error(`Could not select that contact: ${error.message}`);

    if (data) {
      await prospectService.recordEvent(prospectId, {
        kind: 'contact_selected',
        summary: `Recipient set to ${String((data as Row).email)}`,
        actor,
      });
    }
  },

  /**
   * Prospects we may approach, in the order worth approaching them.
   *
   * Three conditions, and the third is the one nobody thinks of: a competitor
   * must not be pitched. `publisher_network` sells what we sell, so an email
   * to one hands our price list to somebody selling against us - obvious
   * afterwards, invisible in a list of four hundred rows.
   */
  async contactable(minScore: number, limit = 50): Promise<Prospect[]> {
    const rows = await prospectService.list({ qualifiedOnly: true, minScore });

    return rows
      .filter((prospect) => isContactable(prospect.segment))
      .filter((prospect) => prospect.stage === 'qualified')
      .slice(0, limit);
  },
};
