import type { SalesSegment } from '@/lib/types/sales';

/**
 * Who buys backlinks, and what to say to each of them.
 *
 * One shared list, for the same reason `accepted-niches.ts` is one shared
 * list: the prospect form, the campaign filter, the qualification prompt and
 * the email generator all have to mean the same thing by "affiliate".
 *
 * `terms` are the phrases that appear in these businesses' own copy. They are
 * evidence, not a verdict - a marketing agency's site saying "link building"
 * is a reason to look, and the model decides whether they buy or sell. The
 * crawl records which of them appeared and on which page, so a judgement can
 * always be traced back to a sentence somebody at that company wrote.
 *
 * `angle` is what we have that they want, in one line. It is guidance for the
 * generator and never copied into an email verbatim: an email that reads like
 * a template is an email that gets deleted like one.
 */
export interface SegmentDefinition {
  slug: SalesSegment;
  label: string;
  /** Shown beside the label where the distinction is not obvious. */
  hint?: string;
  terms: string[];
  angle: string;
  /**
   * Niches this segment usually needs placements in, as slugs from
   * `accepted-niches`. Used to pick which of our listings to cite, so an
   * iGaming affiliate is shown sites that accept gambling rather than our
   * highest DR travel blog.
   */
  niches: string[];
}

export const salesSegments: SegmentDefinition[] = [
  {
    slug: 'seo_agency',
    label: 'SEO agency',
    hint: 'Buys placements on behalf of its own clients.',
    terms: ['seo agency', 'seo services', 'search engine optimisation', 'search engine optimization', 'technical seo', 'local seo'],
    angle:
      'They resell to their own clients, so the thing that matters is margin and ' +
      'repeatability: a priced inventory they can quote from, and placements that ' +
      'land without them chasing a publisher.',
    niches: ['general', 'business', 'marketing', 'technology'],
  },
  {
    slug: 'digital_pr',
    label: 'Digital PR agency',
    terms: ['digital pr', 'press coverage', 'media relations', 'earned media', 'newsjacking', 'link earning'],
    angle:
      'They sell coverage, and a campaign that under-delivers is their problem to ' +
      'explain. Guaranteed placements on real sites fill the gap when a story ' +
      'does not land.',
    niches: ['general', 'business', 'lifestyle', 'entertainment'],
  },
  {
    slug: 'link_building',
    label: 'Link building agency',
    hint: 'The segment most likely to buy, and the one most likely to also sell.',
    terms: ['link building', 'guest posting', 'guest post service', 'outreach service', 'niche edits', 'backlink packages', 'white label links'],
    angle:
      'They buy at volume and already know what a placement is worth. Price, DR ' +
      'and turnaround decide it; nothing else needs explaining.',
    niches: ['general', 'business', 'marketing'],
  },
  {
    slug: 'affiliate_igaming',
    label: 'iGaming affiliate',
    terms: ['casino bonus', 'best casinos', 'online casino', 'sportsbook', 'free spins', 'betting sites', 'slots review'],
    angle:
      'Their whole business is ranking for terms most publishers refuse to carry, ' +
      'so the scarce thing is a site that accepts gambling at all - and knowing ' +
      'the price before asking.',
    niches: ['gambling'],
  },
  {
    slug: 'affiliate_sports',
    label: 'Sports betting affiliate',
    terms: ['betting tips', 'free bets', 'odds comparison', 'acca', 'bookmaker review', 'betting offers'],
    angle:
      'Seasonal and competitive: they need placements live before a fixture, not ' +
      'in six weeks. Turnaround is the pitch.',
    niches: ['gambling'],
  },
  {
    slug: 'affiliate_finance',
    label: 'Finance or crypto affiliate',
    terms: ['best credit cards', 'compare loans', 'crypto exchange', 'trading platform review', 'best brokers', 'forex broker'],
    angle:
      'High-value terms, heavily regulated, and most publishers will not touch ' +
      'them. Which sites accept finance, crypto or forex is the question they ' +
      'cannot answer without asking fifty people.',
    niches: ['finance', 'crypto', 'forex', 'loan'],
  },
  {
    slug: 'affiliate_other',
    label: 'Other affiliate',
    terms: ['best', 'review', 'compare', 'top 10', 'buying guide', 'affiliate disclosure'],
    angle:
      'They live on category rankings. Steady, cheap placements in their own ' +
      'vertical beat one expensive one.',
    niches: ['general', 'lifestyle', 'technology', 'home'],
  },
  {
    slug: 'ecommerce',
    label: 'Ecommerce brand',
    terms: ['add to cart', 'free shipping', 'our products', 'shop now', 'wholesale', 'returns policy'],
    angle:
      'They are buying authority for category and product pages, usually without ' +
      'an agency. The pitch is plain: what it costs, what it does, who else sells ' +
      'to brands like them.',
    niches: ['general', 'home', 'lifestyle', 'food', 'automotive'],
  },
  {
    slug: 'saas',
    label: 'SaaS or software',
    terms: ['start free trial', 'pricing plans', 'integrations', 'api documentation', 'book a demo', 'per user per month'],
    angle:
      'Content-led growth with a measured cost per signup. They will want to know ' +
      'the traffic and the topic relevance before the DR.',
    niches: ['technology', 'business', 'marketing'],
  },
  {
    slug: 'publisher_network',
    label: 'Publisher or marketplace',
    hint: 'A competitor. Worth recording so nobody pitches them by accident.',
    terms: ['sell guest posts', 'our inventory', 'publisher network', 'list your site', 'become a publisher'],
    angle:
      'These sell what we sell. Not a buyer - recorded so the same company is not ' +
      'pitched twice and so a competitor is not emailed our price list.',
    niches: [],
  },
  {
    slug: 'other',
    label: 'Other',
    terms: [],
    angle: 'Nothing established yet. Research first.',
    niches: ['general'],
  },
];

const bySlug = new Map(salesSegments.map((entry) => [entry.slug, entry]));

export function segmentDefinition(slug: SalesSegment): SegmentDefinition {
  return bySlug.get(slug) ?? bySlug.get('other')!;
}

export function segmentLabel(slug: SalesSegment): string {
  return segmentDefinition(slug).label;
}

/**
 * Segments nobody should be emailed from.
 *
 * A publisher network is a competitor. Pitching them leaks our price list to
 * somebody selling against us, and it is the kind of mistake that is obvious
 * afterwards and invisible in a list of four hundred prospects.
 */
export const neverContactSegments: SalesSegment[] = ['publisher_network'];

export function isContactable(slug: SalesSegment): boolean {
  return !neverContactSegments.includes(slug);
}
