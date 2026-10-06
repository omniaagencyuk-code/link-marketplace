import { isValidDomain, normaliseDomain } from '@/lib/import/normalise';

/**
 * Normalised, and actually a domain.
 *
 * `normaliseDomain` lowercases and strips a protocol, a www and a path; it
 * does not judge what is left. "not a domain at all" survives it intact, and
 * a pull for that is fifty units for an empty answer. The importer always
 * pairs the two functions, and so must this - the verifier caught the version
 * that did not.
 */
function cleanDomain(raw: string): string | null {
  const domain = normaliseDomain(raw ?? '');
  if (!domain || !isValidDomain(domain)) return null;
  return domain;
}

/**
 * Working out the gap itself.
 *
 * Pure: sets of referring domains in, the gap out. No network and no
 * database, so the rules below are checked against the case that triggers
 * them rather than against whichever competitor somebody happened to try.
 *
 * ## What a gap is here
 *
 * A domain that links to at least one named competitor and does not link to
 * the customer. That is the whole definition, and the two things it excludes
 * are worth stating because both have bitten link-gap tools before:
 *
 * - **A competitor is not a gap.** Competitors link to each other constantly,
 *   and "get a link from your direct rival" is not advice.
 * - **The customer's own domain is not a gap**, nor are its subdomains.
 */

export interface GapInput {
  /** Already normalised: lowercase, no protocol, no www. */
  target: string;
  competitors: string[];
  /** Referring domains per competitor, keyed by competitor domain. */
  refdomainsByCompetitor: Map<string, string[]>;
  /** The customer's own referring domains. */
  targetRefdomains: string[];
}

export interface GapRow {
  domain: string;
  /** Which of the named competitors this domain links to. The evidence. */
  linkingCompetitors: string[];
}

/**
 * The gap, strongest signal first.
 *
 * Sorted by how many competitors link to it. A domain linking to all three is
 * a far better prospect than one linking to a single competitor - it is a
 * site that covers the niche rather than one that happened to mention
 * somebody - and that ordering is the only ranking available without buying
 * metrics for domains we may not be able to sell anyway.
 */
export function findGap(input: GapInput): GapRow[] {
  const target = cleanDomain(input.target) ?? input.target;

  /*
    Everything that is not a gap by definition, in one set.

    The customer's own domain and every competitor. Built before the walk so
    the check is a lookup rather than a scan per row.
  */
  const excluded = new Set<string>([target]);
  for (const competitor of input.competitors) {
    const clean = cleanDomain(competitor);
    if (clean) excluded.add(clean);
  }

  const theirs = new Set<string>();
  for (const domain of input.targetRefdomains) {
    const clean = cleanDomain(domain);
    if (clean) theirs.add(clean);
  }

  const found = new Map<string, Set<string>>();

  for (const competitor of input.competitors) {
    const competitorDomain = cleanDomain(competitor) ?? competitor;
    const refdomains = input.refdomainsByCompetitor.get(competitorDomain) ?? [];

    for (const raw of refdomains) {
      const domain = cleanDomain(raw);
      if (!domain) continue;
      if (excluded.has(domain)) continue;
      // Already links to the customer, so there is no gap to close.
      if (theirs.has(domain)) continue;

      const linking = found.get(domain) ?? new Set<string>();
      linking.add(competitorDomain);
      found.set(domain, linking);
    }
  }

  return [...found.entries()]
    .map(([domain, linking]) => ({
      domain,
      linkingCompetitors: [...linking].sort(),
    }))
    .sort(
      (a, b) =>
        b.linkingCompetitors.length - a.linkingCompetitors.length ||
        a.domain.localeCompare(b.domain),
    );
}

/**
 * Check what the customer typed before any of it costs money.
 *
 * Returns the cleaned domains or the sentence to show them. Every rule here
 * exists to stop a pull that would be wasted: a malformed domain is fifty
 * units for an empty answer, and the same company entered as its own
 * competitor is a pull for a gap that is empty by definition.
 */
export interface CheckedTargets {
  target: string;
  competitors: string[];
}

export function checkTargets(
  rawTarget: string,
  rawCompetitors: string[],
  maxCompetitors: number,
): { ok: true; targets: CheckedTargets } | { ok: false; error: string } {
  const target = cleanDomain(rawTarget ?? '');
  if (!target) return { ok: false, error: 'Enter your own domain first.' };

  const seen = new Set<string>([target]);
  const competitors: string[] = [];

  for (const raw of rawCompetitors) {
    if (!raw?.trim()) continue;

    const clean = cleanDomain(raw);
    if (!clean) return { ok: false, error: `"${raw.trim()}" is not a domain we can read.` };

    /*
      The customer's own domain among the competitors, and a competitor listed
      twice, are both silently dropped rather than refused.

      Typing your own site into the first competitor box is an ordinary
      mistake, and refusing the whole form over it is worse than ignoring it.
      What it must not do is cost a pull.
    */
    if (seen.has(clean)) continue;

    seen.add(clean);
    competitors.push(clean);
  }

  if (competitors.length === 0) {
    return { ok: false, error: 'Add at least one competitor to compare against.' };
  }
  if (competitors.length > maxCompetitors) {
    return {
      ok: false,
      error: `That is more than ${maxCompetitors} competitors. Compare against your closest ${maxCompetitors}.`,
    };
  }

  return { ok: true, targets: { target, competitors } };
}
