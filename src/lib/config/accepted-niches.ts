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
  { slug: 'crypto', label: 'Crypto and web3', regulated: true, legacyKey: 'acceptsCrypto' },
  { slug: 'gambling', label: 'Gambling and iGaming', regulated: true, legacyKey: 'acceptsGambling' },
  { slug: 'cbd', label: 'CBD and cannabis', regulated: true, legacyKey: 'acceptsCbd' },
  { slug: 'adult', label: 'Adult', regulated: true, legacyKey: 'acceptsAdult' },
  { slug: 'forex', label: 'Forex and trading', regulated: true },
  { slug: 'dating', label: 'Dating', regulated: true },
  { slug: 'vaping', label: 'Vaping', regulated: true },
  { slug: 'pharma', label: 'Pharmaceutical', regulated: true },
];

export const acceptedNicheSlugs = acceptedNiches.map((niche) => niche.slug);

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
