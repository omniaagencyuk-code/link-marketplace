import { getAdminScopedClient } from '@/lib/supabase/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { chunk } from '@/lib/utils/chunk';
import { nicheName } from '@/lib/data/categories';
import { suggestNiches } from '@/lib/majestic/topics';
import type { MajesticReading } from '@/lib/majestic/parse';
import type { NicheSlug } from '@/lib/types';

/**
 * Writing a Majestic export onto listings we already have.
 *
 * An enrichment pass, not an import: it never creates a listing, never
 * touches a price, a cost, a contact or a category. A domain in the file that
 * we do not sell is reported and skipped, because a Bulk Backlink Checker
 * export is often run against a wider list than the marketplace holds.
 *
 * The category suggestion is stored nowhere. It is worked out from the topics
 * whenever somebody looks, so it cannot go stale against a mapping table that
 * has since gained a rule - and so that accepting one is always a deliberate
 * act rather than something that happened during an import.
 */

export interface MajesticApplyResult {
  /** Listings whose figures were written. */
  updated: number;
  /** Domains in the file we do not have a listing for. */
  unknown: string[];
  /** Rows Majestic returned nothing usable for. */
  unusable: string[];
  error?: string;
}

/** How many listings to write in one request. */
const WRITE_CHUNK = 200;

export const majesticService = {
  /**
   * Apply a parsed export.
   *
   * Matched on the normalised domain, which is the same rule the website
   * importer and the publisher inbox use - so a listing stored as
   * `www.example.com` and a Majestic row reading `example.com/` are the same
   * site here as they are everywhere else.
   */
  async apply(readings: readonly MajesticReading[], unusable: string[] = []): Promise<MajesticApplyResult> {
    if (!isSupabaseEnabled()) {
      return { updated: 0, unknown: [], unusable, error: 'The database is not connected on this deployment.' };
    }
    if (readings.length === 0) return { updated: 0, unknown: [], unusable };

    const supabase = getAdminScopedClient();

    // Look the domains up in batches rather than reading the whole table: at
    // nine hundred listings the table is past one page of rows, and a
    // truncated read here would silently report half the file as unknown.
    const byDomain = new Map<string, string>();
    for (const group of chunk(readings.map((reading) => reading.domain), WRITE_CHUNK)) {
      const { data } = await supabase.from('websites').select('id, domain').in('domain', group);
      for (const row of (data ?? []) as { id: string; domain: string }[]) {
        byDomain.set(row.domain, row.id);
      }
    }

    const matched = readings.filter((reading) => byDomain.has(reading.domain));
    const unknown = readings
      .filter((reading) => !byDomain.has(reading.domain))
      .map((reading) => reading.raw || reading.domain);

    const now = new Date().toISOString();
    let updated = 0;

    for (const group of chunk(matched, WRITE_CHUNK)) {
      await Promise.all(
        group.map(async (reading) => {
          const websiteId = byDomain.get(reading.domain) as string;

          /*
            Only the fields that were measured.

            A file that carries a trust flow but no citation flow must not
            blank the citation flow already stored: the column is nullable so
            that "unmeasured" can be said, and writing null over a real
            reading would say it falsely.
          */
          const patch: Record<string, unknown> = { majestic_updated_at: now };
          if (reading.trustFlow != null) patch.trust_flow = reading.trustFlow;
          if (reading.citationFlow != null) patch.citation_flow = reading.citationFlow;
          /*
            Referring domains is Ahrefs' column too, and Ahrefs is the source
            we refresh on a schedule. Majestic fills it only where nobody has
            - which is most of the inventory right now, and none of it once
            the Ahrefs refresh has been over it.
          */
          if (reading.referringDomains != null) {
            const { data: existing } = await supabase
              .from('websites')
              .select('referring_domains')
              .eq('id', websiteId)
              .maybeSingle();
            const current = (existing as { referring_domains: number | null } | null)?.referring_domains;
            if (!current) patch.referring_domains = reading.referringDomains;
          }

          await supabase.from('websites').update(patch).eq('id', websiteId);

          // Replaced wholesale, because the positions are the measurement: a
          // site that dropped from three topics to two must not keep a third.
          await supabase.from('website_topics').delete().eq('website_id', websiteId);
          if (reading.topics.length > 0) {
            await supabase.from('website_topics').insert(
              reading.topics.map((reading_, position) => ({
                website_id: websiteId,
                position,
                topic: reading_.topic,
                value: reading_.value,
              })),
            );
          }

          updated += 1;
        }),
      );
    }

    return { updated, unknown, unusable };
  },

  /**
   * Listings whose topics suggest a category other than the one they carry.
   *
   * Computed on read, never stored. The nine hundred listings sourced from
   * email all carry whatever the importer defaulted to, so for most of them
   * this is the difference between a category and none at all - but it is
   * still a suggestion, and approving it is a person's decision.
   */
  async suggestions(): Promise<MajesticSuggestion[]> {
    if (!isSupabaseEnabled()) return [];
    const supabase = getAdminScopedClient();

    /*
      Read in pages, and read all of them.

      This took a row limit of three times the number of listings it meant to
      return, on the reasoning that a listing has at most three topics. Nine
      hundred listings is two and three-quarter thousand topic rows, so the
      limit cut it at five hundred listings - and because the order is stable,
      the same five hundred came back every time. The other four hundred were
      not "not suggested yet"; they were unreachable, and nothing said so.

      There is no cap on the result any more either. A cap is a silent
      truncation with a friendlier name, and the table renders nine hundred
      rows elsewhere in this admin without complaint.
    */
    const PAGE = 1000;
    const rows: Record<string, unknown>[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data: page, error } = await supabase
        .from('website_topics')
        .select(
          'website_id, position, topic, value, websites (id, domain, categories:primary_category_id (slug), website_categories (is_primary, categories (slug)))',
        )
        .order('website_id')
        .order('position')
        .range(from, from + PAGE - 1);
      if (error) break;
      const batch = (page ?? []) as Record<string, unknown>[];
      rows.push(...batch);
      if (batch.length < PAGE) break;
    }

    const data = rows;

    interface Gathered {
      domain: string;
      current: NicheSlug | null;
      secondary: NicheSlug[];
      topics: { topic: string; value: number; position: number }[];
    }

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const byWebsite = new Map<string, Gathered>();
    for (const row of (data ?? []) as any[]) {
      const site = Array.isArray(row.websites) ? row.websites[0] : row.websites;
      if (!site) continue;
      const current =
        (Array.isArray(site.categories) ? site.categories[0]?.slug : site.categories?.slug) ?? null;

      const entry: Gathered = byWebsite.get(String(row.website_id)) ?? {
        domain: String(site.domain),
        current,
        // The primary is filtered out: it is already `current`, and a
        // category listed as both is one a reviewer has to read twice.
        secondary: ((site.website_categories ?? []) as any[])
          .filter((join) => !join.is_primary)
          .map((join) => (Array.isArray(join.categories) ? join.categories[0]?.slug : join.categories?.slug))
          .filter((slug: string | undefined): slug is NicheSlug => Boolean(slug) && slug !== current),
        topics: [],
      };
      entry.topics.push({ topic: String(row.topic), value: Number(row.value), position: Number(row.position) });
      byWebsite.set(String(row.website_id), entry);
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */

    const out: MajesticSuggestion[] = [];

    for (const [websiteId, entry] of byWebsite) {
      const topics = entry.topics.sort((a, b) => a.position - b.position);
      const suggestion = suggestNiches(topics);
      if (!suggestion) continue;

      /*
        Worth showing when either half differs.

        A listing already in the right category but with no secondary niches
        is exactly the case this was missing: the second and third topics were
        read, mapped, and then thrown away, so a Swedish football site sat
        under one category when its own backlinks named two more.
      */
      const missingSecondary = suggestion.secondary.filter(
        (slug) => !entry.secondary.includes(slug),
      );
      if (suggestion.primary === entry.current && missingSecondary.length === 0) continue;

      out.push({
        websiteId,
        domain: entry.domain,
        current: entry.current,
        currentName: entry.current ? nicheName(entry.current) : null,
        suggested: suggestion.primary,
        suggestedName: nicheName(suggestion.primary),
        // Only the ones it does not already have. Accepting must add to a
        // listing's secondary niches, never replace what somebody set.
        secondary: missingSecondary,
        secondaryNames: missingSecondary.map(nicheName),
        existingSecondary: entry.secondary,
        from: suggestion.from.topic,
        value: suggestion.from.value,
        topics: topics.map((topic) => ({ topic: topic.topic, value: topic.value })),
      });
    }

    // Strongest evidence first: a suggestion backed by a trust flow of 40
    // deserves a look before one backed by 4.
    return out.sort((a, b) => b.value - a.value);
  },

  /**
   * Apply accepted suggestions: the category, and the secondary niches.
   *
   * The secondary niches are added to whatever a listing already has rather
   * than replacing them. Most of these have none, but the ones that do had
   * them set by a person, and a bulk action that quietly overwrote that would
   * be the worst kind of helpful.
   */
  async acceptSuggestions(accepted: AcceptedSuggestion[]) {
    if (!isSupabaseEnabled() || accepted.length === 0) return { changed: 0 };
    const supabase = getAdminScopedClient();

    const wanted = [
      ...new Set(accepted.flatMap((entry) => [entry.niche, ...entry.secondary, ...entry.existingSecondary])),
    ];
    const { data: categories } = await supabase
      .from('categories')
      .select('id, slug')
      .in('slug', wanted);
    const idFor = new Map(
      ((categories ?? []) as { id: string; slug: string }[]).map((row) => [row.slug, row.id]),
    );

    let changed = 0;
    for (const group of chunk(accepted, WRITE_CHUNK)) {
      await Promise.all(
        group.map(async (entry) => {
          const primaryId = idFor.get(entry.niche);
          if (!primaryId) return;

          await supabase
            .from('websites')
            .update({ primary_category_id: primaryId })
            .eq('id', entry.websiteId);

          /*
            The join table is replaced wholesale, which is what the website
            repository does for the same rows and for the same reason: it is
            a handful of rows and a diff would be more code than it is worth.
            What must not be lost is the listing's existing secondary niches,
            so they are unioned in rather than dropped.
          */
          const secondary = [
            ...new Set([...entry.existingSecondary, ...entry.secondary]),
          ].filter((slug) => slug !== entry.niche && idFor.has(slug));

          await supabase.from('website_categories').delete().eq('website_id', entry.websiteId);
          await supabase.from('website_categories').insert([
            { website_id: entry.websiteId, category_id: primaryId, is_primary: true },
            ...secondary.map((slug) => ({
              website_id: entry.websiteId,
              category_id: idFor.get(slug) as string,
              is_primary: false,
            })),
          ]);

          changed += 1;
        }),
      );
    }

    return { changed };
  },
};

export interface AcceptedSuggestion {
  websiteId: string;
  niche: NicheSlug;
  /** The ones the topics point at that it does not already have. */
  secondary: NicheSlug[];
  /** What it already has, so accepting adds rather than replaces. */
  existingSecondary: NicheSlug[];
}

export interface MajesticSuggestion {
  websiteId: string;
  domain: string;
  current: NicheSlug | null;
  currentName: string | null;
  suggested: NicheSlug;
  suggestedName: string;
  /** Secondary niches the topics point at that the listing does not have. */
  secondary: NicheSlug[];
  secondaryNames: string[];
  /** What it already has, so accepting adds rather than replaces. */
  existingSecondary: NicheSlug[];
  /** The topic the suggestion came from, so a reviewer can judge it. */
  from: string;
  value: number;
  topics: { topic: string; value: number }[];
}
