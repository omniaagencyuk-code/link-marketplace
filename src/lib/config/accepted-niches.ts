/**
 * Topics a publisher will accept.
 *
 * One shared list so that the admin form, the listing page and the
 * marketplace filters all talk about the same things. Regulated topics are
 * flagged because they are the ones a buyer specifically hunts for and a
 * publisher specifically refuses - the rest are ordinary editorial categories.
 *
 * Adding an entry here is all that is needed: the admin form, the stored array
 * and the listing display are driven from it. Removing one leaves existing
 * stored values alone, so nothing breaks - the value simply stops being
 * offered as a choice.
 */

export interface AcceptedNiche {
  slug: string;
  label: string;
  /** Subject to advertising rules, or commonly refused. */
  regulated?: boolean;
  /**
   * Priced as a "sensitive topic" by publishers.
   *
   * Narrower than `regulated`, and deliberately so: when a publisher quotes a
   * single rate for "sensitive niches" they mean these seven, and extending
   * that rate to Finance or Pharma would invent a price they never gave.
   */
  sensitive?: boolean;
  /**
   * The legacy boolean this drives, where one exists. Listing pages and
   * filters still read these, so writes keep them in step.
   */
  legacyKey?: 'acceptsGambling' | 'acceptsFinance' | 'acceptsCrypto' | 'acceptsCbd' | 'acceptsAdult';
}

export const acceptedNiches: AcceptedNiche[] = [
  { slug: 'general', label: 'General / any topic' },
  { slug: 'business', label: 'Business' },
  { slug: 'technology', label: 'Technology' },
  { slug: 'marketing', label: 'Marketing and SEO' },
  { slug: 'health', label: 'Health and wellness' },
  { slug: 'lifestyle', label: 'Lifestyle' },
  { slug: 'travel', label: 'Travel' },
  { slug: 'home', label: 'Home and garden' },
  { slug: 'automotive', label: 'Automotive' },
  { slug: 'food', label: 'Food and drink' },
  { slug: 'sports', label: 'Sports' },
  { slug: 'entertainment', label: 'Entertainment' },
  { slug: 'education', label: 'Education' },
  { slug: 'real-estate', label: 'Real estate' },
  { slug: 'legal', label: 'Legal' },
  { slug: 'finance', label: 'Finance', regulated: true, legacyKey: 'acceptsFinance' },
  { slug: 'crypto', label: 'Crypto and web3', regulated: true, sensitive: true, legacyKey: 'acceptsCrypto' },
  { slug: 'gambling', label: 'Gambling and iGaming', regulated: true, sensitive: true, legacyKey: 'acceptsGambling' },
  { slug: 'cbd', label: 'CBD and cannabis', regulated: true, sensitive: true, legacyKey: 'acceptsCbd' },
  { slug: 'adult', label: 'Adult', regulated: true, sensitive: true, legacyKey: 'acceptsAdult' },
  { slug: 'forex', label: 'Forex and trading', regulated: true, sensitive: true },
  { slug: 'dating', label: 'Dating', regulated: true, sensitive: true },
  { slug: 'loan', label: 'Loans and credit', regulated: true, sensitive: true },
  { slug: 'vaping', label: 'Vaping', regulated: true },
  { slug: 'pharma', label: 'Pharmaceutical', regulated: true },
];

export const acceptedNicheSlugs = acceptedNiches.map((niche) => niche.slug);

/**
 * The topics a "sensitive niche" rate covers.
 *
 * Publishers quote one number for "sensitive topics" far more often than they
 * itemise. This is the list that phrase buys, and nothing outside it: a
 * publisher who says "sensitive niches 200 EUR" has priced these seven and
 * said nothing at all about Finance, Vaping or Pharma.
 */
export const sensitiveNicheSlugs = acceptedNiches
  .filter((niche) => niche.sensitive)
  .map((niche) => niche.slug);

/** The catch-all topic. Everything not in `sensitiveNicheSlugs` prices as this. */
export const GENERAL_NICHE = 'general';

const bySlug = new Map(acceptedNiches.map((niche) => [niche.slug, niche]));

export function acceptedNicheLabel(slug: string): string {
  return bySlug.get(slug)?.label ?? slug;
}

export function isAcceptedNicheSlug(value: string): boolean {
  return bySlug.has(value);
}

/**
 * The legacy booleans implied by a set of accepted niches.
 *
 * Written on every save so the two representations cannot drift. If they ever
 * disagree, this is the one that is right.
 */
export function legacyAcceptanceFlags(slugs: string[]) {
  const set = new Set(slugs);
  const flags = {
    acceptsGambling: false,
    acceptsFinance: false,
    acceptsCrypto: false,
    acceptsCbd: false,
    acceptsAdult: false,
  };
  for (const niche of acceptedNiches) {
    if (niche.legacyKey && set.has(niche.slug)) flags[niche.legacyKey] = true;
  }
  return flags;
}

/** The accepted-niche list implied by the legacy booleans, for old records. */
export function acceptedNichesFromFlags(rules: {
  acceptsGambling?: boolean;
  acceptsFinance?: boolean;
  acceptsCrypto?: boolean;
  acceptsCbd?: boolean;
  acceptsAdult?: boolean;
}): string[] {
  const slugs: string[] = [];
  for (const niche of acceptedNiches) {
    if (niche.legacyKey && rules[niche.legacyKey]) slugs.push(niche.slug);
  }
  return slugs;
}

/**
 * Free text from a publisher's spreadsheet, matched to the shared list.
 *
 * Publisher lists write the same topic a dozen ways - "iGaming", "casino",
 * "betting", "gambling/casino" - so matching is on substrings against a small
 * alias table rather than on exact equality. Anything unrecognised is dropped
 * rather than guessed at: a wrong regulated flag is worse than a missing one,
 * because it puts a publisher in front of buyers they have not agreed to take.
 */
const importAliases: { pattern: RegExp; slug: string }[] = [
  { pattern: /gambl|casino|betting|igaming|i-gaming|poker|slots|bingo/, slug: 'gambling' },
  { pattern: /crypto|blockchain|web ?3|bitcoin|nft|defi/, slug: 'crypto' },
  { pattern: /cbd|cannabis|hemp|marijuana|weed/, slug: 'cbd' },
  { pattern: /forex|trading|binary option/, slug: 'forex' },
  { pattern: /adult|xxx|porn|escort/, slug: 'adult' },
  { pattern: /dating|hookup/, slug: 'dating' },
  { pattern: /vap(e|ing)|e-?cig/, slug: 'vaping' },
  { pattern: /pharma|medicine|supplement|nootropic/, slug: 'pharma' },
  { pattern: /financ|money|invest|loan|insurance|banking|fintech/, slug: 'finance' },
  { pattern: /health|wellness|fitness|medical|nutrition/, slug: 'health' },
  { pattern: /tech|software|saas|it|gadget|ai\b/, slug: 'technology' },
  { pattern: /market|seo|advertis|digital marketing|pr\b/, slug: 'marketing' },
  { pattern: /business|b2b|startup|entrepreneur|corporate/, slug: 'business' },
  { pattern: /travel|tourism|holiday|hotel/, slug: 'travel' },
  { pattern: /lifestyle|fashion|beauty|style/, slug: 'lifestyle' },
  { pattern: /home|garden|interior|diy|property improvement/, slug: 'home' },
  { pattern: /real ?estate|property|mortgage/, slug: 'real-estate' },
  { pattern: /legal|law|solicitor|attorney/, slug: 'legal' },
  { pattern: /auto|car|motor|vehicle/, slug: 'automotive' },
  { pattern: /food|drink|recipe|restaurant|cooking/, slug: 'food' },
  { pattern: /sport|football|soccer|golf|fitness sport/, slug: 'sports' },
  { pattern: /entertain|music|film|movie|celebrity|gaming(?!.*gambl)/, slug: 'entertainment' },
  { pattern: /educat|student|university|school|e-?learning/, slug: 'education' },
  { pattern: /general|any topic|all niches|all topics|any niche|everything/, slug: 'general' },
];

/**
 * Accepted-niche slugs for a list of free-text entries.
 *
 * Each entry is matched independently, so "Gambling, CBD, Finance" yields
 * three slugs rather than whichever pattern happened to hit the joined string
 * first. Duplicates are collapsed and order is preserved.
 */
export function matchAcceptedNiches(entries: string[]): string[] {
  const found: string[] = [];

  for (const entry of entries) {
    const text = entry.trim().toLowerCase();
    if (!text) continue;

    // An exact slug or label wins outright - a CSV exported from this system
    // should round-trip without going near the fuzzy matching.
    const exact = acceptedNiches.find(
      (niche) => niche.slug === text || niche.label.toLowerCase() === text,
    );
    if (exact) {
      if (!found.includes(exact.slug)) found.push(exact.slug);
      continue;
    }

    for (const alias of importAliases) {
      if (alias.pattern.test(text) && !found.includes(alias.slug)) {
        found.push(alias.slug);
        break;
      }
    }
  }

  return found;
}
