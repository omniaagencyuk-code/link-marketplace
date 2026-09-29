import { getAdminScopedClient } from '@/lib/supabase/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { chunk } from '@/lib/utils/chunk';
import { nicheName } from '@/lib/data/categories';
import { suggestNiche } from '@/lib/majestic/topics';
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
  async suggestions(limit = 500): Promise<MajesticSuggestion[]> {
    if (!isSupabaseEnabled()) return [];
    const supabase = getAdminScopedClient();

    const { data } = await supabase
      .from('website_topics')
      .select('website_id, position, topic, value, websites (id, domain, primary_category_id, categories:primary_category_id (slug))')
      .order('website_id')
      .limit(limit * 3);

    interface Gathered {
      domain: string;
      current: NicheSlug | null;
      topics: { topic: string; value: number; position: number }[];
    }

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const byWebsite = new Map<string, Gathered>();
    for (const row of (data ?? []) as any[]) {
      const site = Array.isArray(row.websites) ? row.websites[0] : row.websites;
      if (!site) continue;
      const entry: Gathered = byWebsite.get(String(row.website_id)) ?? {
        domain: String(site.domain),
        current: (Array.isArray(site.categories) ? site.categories[0]?.slug : site.categories?.slug) ?? null,
        topics: [],
      };
      entry.topics.push({ topic: String(row.topic), value: Number(row.value), position: Number(row.position) });
      byWebsite.set(String(row.website_id), entry);
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */

    const out: MajesticSuggestion[] = [];

    for (const [websiteId, entry] of byWebsite) {
      const topics = entry.topics.sort((a, b) => a.position - b.position);
      const suggestion = suggestNiche(topics);
      if (!suggestion) continue;
      if (suggestion.niche === entry.current) continue;

      out.push({
        websiteId,
        domain: entry.domain,
        current: entry.current,
        currentName: entry.current ? nicheName(entry.current) : null,
        suggested: suggestion.niche,
        suggestedName: nicheName(suggestion.niche),
        from: suggestion.from.topic,
        value: suggestion.from.value,
        topics: topics.map((topic) => ({ topic: topic.topic, value: topic.value })),
      });
    }

    // Strongest evidence first: a suggestion backed by a trust flow of 40
    // deserves a look before one backed by 4.
    return out.sort((a, b) => b.value - a.value).slice(0, limit);
  },

  /** Set the primary category on listings whose suggestion was accepted. */
  async acceptSuggestions(websiteIds: string[], niches: Record<string, NicheSlug>) {
    if (!isSupabaseEnabled() || websiteIds.length === 0) return { changed: 0 };
    const supabase = getAdminScopedClient();

    const wanted = [...new Set(Object.values(niches))];
    const { data: categories } = await supabase.from('categories').select('id, slug').in('slug', wanted);
    const idFor = new Map(
      ((categories ?? []) as { id: string; slug: string }[]).map((row) => [row.slug, row.id]),
    );

    let changed = 0;
    for (const group of chunk(websiteIds, WRITE_CHUNK)) {
      await Promise.all(
        group.map(async (websiteId) => {
          const categoryId = idFor.get(niches[websiteId]);
          if (!categoryId) return;
          await supabase
            .from('websites')
            .update({ primary_category_id: categoryId })
            .eq('id', websiteId);
          changed += 1;
        }),
      );
    }

    return { changed };
  },
};

export interface MajesticSuggestion {
  websiteId: string;
  domain: string;
  current: NicheSlug | null;
  currentName: string | null;
  suggested: NicheSlug;
  suggestedName: string;
  /** The topic the suggestion came from, so a reviewer can judge it. */
  from: string;
  value: number;
  topics: { topic: string; value: number }[];
}
