/**
 * Finding two listings that are the same site.
 *
 * Pure, so the part that can be wrong is the part that can be checked. The
 * script that prints this report talks to the live database and cannot be
 * run without one; these two functions are the whole of its judgement and
 * need neither.
 *
 * The question is not "are there two rows with the same domain" - the column
 * is unique, so there cannot be. It is "are there two rows that mean the same
 * site", which is a different question because the constraint compares text
 * and the importer compares normalised text. `example.com` and
 * `www.example.com` are two values and one site, and only the second of those
 * facts is interesting.
 */
import { normaliseDomain } from './normalise';

export interface ListingRow {
  id: string;
  domain: string;
}

export interface Collision<T extends ListingRow> {
  /** The normalised domain the rows have in common. */
  domain: string;
  rows: T[];
}

/**
 * Listings that normalise to the same site.
 *
 * Sorted by that domain so two runs over the same data print the same report,
 * which matters when somebody is comparing before and after.
 */
export function findCollisions<T extends ListingRow>(rows: T[]): Collision<T>[] {
  const byDomain = new Map<string, T[]>();

  for (const row of rows) {
    const key = normaliseDomain(row.domain);
    // A row whose domain cannot be parsed at all is not a collision with
    // anything. It is its own problem, and grouping them all under one empty
    // key would invent a collision between unrelated broken rows.
    if (!key) continue;
    byDomain.set(key, [...(byDomain.get(key) ?? []), row]);
  }

  return [...byDomain]
    .filter(([, group]) => group.length > 1)
    .map(([domain, group]) => ({ domain, rows: group }))
    .sort((a, b) => a.domain.localeCompare(b.domain));
}

/**
 * Listings stored as something other than their normalised form.
 *
 * Not damage. It is the shape damage arrives in: the importer looks a domain
 * up by its normalised spelling, so a row stored as `www.example.com` is
 * invisible to a CSV offering `example.com`, and the insert that follows is
 * free to sit down beside it. Finding none is the finding - it means the
 * unique constraint is doing the whole job it looks like it is doing.
 */
export function findUnnormalised<T extends ListingRow>(rows: T[]): T[] {
  return rows.filter((row) => {
    const key = normaliseDomain(row.domain);
    return key !== null && key !== row.domain;
  });
}
