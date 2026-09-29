import { normaliseDomain } from '@/lib/import/normalise';
import { suggestNiches, type TopicReading } from './topics';
import type { NicheSlug } from '@/lib/types';

/**
 * Reading a Majestic Bulk Backlink Checker export.
 *
 * The file is what the web tool downloads on a Pro plan - no API key, no unit
 * budget, no cron. It carries sixty-odd columns; six of them matter here and
 * the rest are ignored rather than stored, because storing a column nobody
 * reads is how a table becomes impossible to change.
 *
 * Header names are matched case- and space-insensitively against a list of
 * spellings, the same way the website importer works, because Majestic's
 * exports differ between the interactive table and the downloaded file.
 */

export interface MajesticReading {
  /** Normalised, so it matches a listing by the same rule everything else does. */
  domain: string;
  /** As it appeared in the file, for reporting a row that matched nothing. */
  raw: string;
  trustFlow: number | null;
  citationFlow: number | null;
  /** Up to three, strongest first, blanks dropped. */
  topics: TopicReading[];
  referringDomains: number | null;
  /** Our category, suggested from the topics. Null when none of them maps. */
  suggestedNiche: NicheSlug | null;
  /** The other categories the topics point at, for the secondary niches. */
  suggestedSecondary: NicheSlug[];
  /** The topic the suggestion came from, so a reviewer can judge it. */
  suggestedFrom: TopicReading | null;
}

/** How many topics we keep. Majestic exports ten; three is what a card shows. */
export const TOPICS_KEPT = 3;

/**
 * The spellings each column answers to.
 *
 * Exported because the screen that explains why a file was unusable has to
 * accept exactly what this accepts. A second list would eventually tell
 * somebody their perfectly good export has no Trust Flow column in it.
 */
export const COLUMNS = {
  domain: ['item', 'domain', 'url', 'target', 'subdomain'],
  trustFlow: ['trust flow', 'trustflow', 'tf'],
  citationFlow: ['citation flow', 'citationflow', 'cf'],
  referringDomains: ['referring domains', 'refdomains', 'referringdomains', 'ref domains'],
} as const;

/** What a topic column at `position` may be called. */
export function topicColumn(position: number): string[] {
  return [
    `topical trust flow topic ${position}`,
    `topicaltrustflow topic ${position}`,
    `topicaltrustflow topic ${position}`,
    `ttf topic ${position}`,
  ];
}

/** Header names are compared with underscores and runs of space flattened. */
export function columnKey(header: string): string {
  return header.trim().toLowerCase().replace(/[_\s]+/g, ' ');
}

const key = columnKey;

/** The first header in `row` that matches one of `names`. */
function pick(row: Record<string, string>, names: readonly string[]): string | undefined {
  for (const header of Object.keys(row)) {
    if (names.includes(key(header))) return row[header];
  }
  return undefined;
}

/**
 * A whole number, or null.
 *
 * Null rather than zero throughout: a domain Majestic has never crawled and a
 * domain with a trust flow of zero are different statements, and only one of
 * them should be printed on a card.
 */
function count(value: string | undefined): number | null {
  if (value == null) return null;
  const text = value.replace(/[,\s]/g, '');
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

/** `Topical Trust Flow Topic 0` and its value, for each position. */
function topicsFrom(row: Record<string, string>): TopicReading[] {
  const readings: TopicReading[] = [];

  for (let position = 0; position < TOPICS_KEPT; position += 1) {
    const topic = pick(row, topicColumn(position));
    const value = pick(row, [
      `topical trust flow value ${position}`,
      `topicaltrustflow value ${position}`,
      `ttf value ${position}`,
    ]);

    const name = (topic ?? '').trim();
    // A blank topic ends the list: Majestic fills them left to right, so a gap
    // means the domain has fewer than three and not that one is missing.
    if (!name) break;
    readings.push({ topic: name, value: count(value) ?? 0 });
  }

  return readings;
}

/**
 * One row, or null when it is not about a domain we can match.
 *
 * Majestic returns a row for every item it was asked about, including ones it
 * found nothing for. Those carry a status and no numbers, and they are
 * dropped here rather than written as zeroes over a listing that already has
 * figures.
 */
export function readRow(row: Record<string, string>): MajesticReading | null {
  const raw = (pick(row, COLUMNS.domain) ?? '').trim();
  const domain = normaliseDomain(raw);
  if (!domain) return null;

  const trustFlow = count(pick(row, COLUMNS.trustFlow));
  const citationFlow = count(pick(row, COLUMNS.citationFlow));
  const topics = topicsFrom(row);

  // Nothing usable at all. A row like this is Majestic saying "not found",
  // and overwriting a listing's metrics with it would lose real data.
  if (trustFlow == null && citationFlow == null && topics.length === 0) return null;

  const suggestion = suggestNiches(topics);

  return {
    domain,
    raw,
    trustFlow,
    citationFlow,
    topics,
    referringDomains: count(pick(row, COLUMNS.referringDomains)),
    suggestedNiche: suggestion?.primary ?? null,
    suggestedSecondary: suggestion?.secondary ?? [],
    suggestedFrom: suggestion?.from ?? null,
  };
}

export interface MajesticFile {
  readings: MajesticReading[];
  /** Rows that carried no usable figures, by the text in their domain column. */
  unusable: string[];
}

/**
 * The whole file.
 *
 * Later rows win on a repeated domain. An export that contains a domain twice
 * is one somebody ran twice, and the second run is the newer measurement.
 */
export function readMajesticCsv(rows: readonly Record<string, string>[]): MajesticFile {
  const byDomain = new Map<string, MajesticReading>();
  const unusable: string[] = [];

  for (const row of rows) {
    const reading = readRow(row);
    if (reading) byDomain.set(reading.domain, reading);
    else {
      const raw = (pick(row, COLUMNS.domain) ?? '').trim();
      if (raw) unusable.push(raw);
    }
  }

  return { readings: [...byDomain.values()], unusable };
}
