import { COLUMNS, columnKey, topicColumn } from './parse';
import type { MajesticReading } from './parse';

/**
 * What a file holds, before anything is written.
 *
 * Shown on the import screen so the decision to apply is made against numbers
 * rather than a filename. Pure, so the wording can be checked without a file.
 */
export function acceptedOrEmpty(readings: readonly MajesticReading[]): {
  withTopics: number;
  suggested: number;
  withTrustFlow: number;
} {
  return {
    withTopics: readings.filter((reading) => reading.topics.length > 0).length,
    suggested: readings.filter((reading) => reading.suggestedNiche != null).length,
    withTrustFlow: readings.filter((reading) => reading.trustFlow != null).length,
  };
}

/**
 * The columns an export must have, in the parser's own words.
 *
 * Taken from `COLUMNS` rather than written out again: a second list of
 * spellings would eventually tell somebody their perfectly good export has no
 * Trust Flow column in it, which is worse than saying nothing.
 */
const REQUIRED: { label: string; spellings: readonly string[] }[] = [
  { label: 'Trust Flow', spellings: COLUMNS.trustFlow },
  { label: 'Citation Flow', spellings: COLUMNS.citationFlow },
  { label: 'a topic column', spellings: topicColumn(0) },
];

/**
 * Why a file produced nothing, in the words somebody needs to fix it.
 *
 * The commonest cause by a distance: the list of domains that went *into*
 * Majestic gets dropped in instead of the file that came *out*. They are both
 * CSVs, they are both called something like "all domains", and one of them has
 * no Trust Flow column at all.
 *
 * Until this existed the screen said nothing whatsoever - it parsed the file,
 * found no readings, and rendered no summary, because the summary was only
 * written for the case where there was something to summarise. Silence is the
 * one answer that leaves somebody with nowhere to go.
 *
 * Null when the file is fine and simply empty of rows.
 */
export function describeUnusableFile(headers: readonly string[], rows: number): string {
  const present = new Set(headers.map(columnKey));
  const missing = REQUIRED.filter(
    (column) => !column.spellings.some((spelling) => present.has(spelling)),
  );

  if (missing.length === REQUIRED.length) {
    return (
      `That file has no Majestic columns in it - no Trust Flow, no Citation Flow, no topics. ` +
      `It looks like the list of domains you pasted *into* Majestic rather than the export that ` +
      `came out of it; the export is usually named after it with ".backlinks" in the middle. ` +
      `The columns it does have are: ${headers.slice(0, 6).join(', ')}${headers.length > 6 ? `, and ${headers.length - 6} more` : ''}.`
    );
  }

  if (missing.length > 0) {
    return (
      `That file is missing ${missing.map((column) => column.label).join(' and ')}. Export from the Bulk Backlink Checker with ` +
      `the default columns and every one of them is included.`
    );
  }

  if (rows === 0) return 'That file has the right columns but no rows in it.';

  return (
    `${rows} rows read, but Majestic returned no figures for any of them - every row came back ` +
    `as not found. Check the domains in the file are the ones you meant to look up.`
  );
}
