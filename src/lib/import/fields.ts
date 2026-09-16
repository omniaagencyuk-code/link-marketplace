import type { NicheSlug } from '@/lib/types';

/**
 * The importable surface of a website.
 *
 * One entry per column the importer understands. `aliases` drives automatic
 * header detection, so adding a new recognised spelling is a one-line change.
 * Keep this list in step with `toWebsitePatch` in `to-website.ts`.
 */
export type ImportFieldKey =
  | 'domain'
  | 'website_name'
  | 'description'
  | 'primary_niche'
  | 'secondary_niches'
  | 'country'
  | 'language'
  | 'domain_rating'
  | 'organic_traffic'
  | 'referring_domains'
  | 'guest_post_price'
  | 'niche_edit_price'
  | 'digital_pr_price'
  | 'guest_post_cost'
  | 'niche_edit_cost'
  | 'digital_pr_cost'
  | 'currency'
  | 'turnaround_min_days'
  | 'turnaround_max_days'
  | 'dofollow'
  | 'sponsored_tag'
  | 'minimum_word_count'
  | 'maximum_links'
  | 'accepted_niches'
  | 'restricted_niches'
  | 'notes'
  | 'status';

export type ImportFieldType = 'text' | 'number' | 'price' | 'boolean' | 'list' | 'enum';

export interface ImportField {
  key: ImportFieldKey;
  label: string;
  type: ImportFieldType;
  required?: boolean;
  /** Lower-cased spellings recognised during automatic mapping. */
  aliases: string[];
  hint?: string;
}

export const importFields: ImportField[] = [
  {
    key: 'domain',
    label: 'Domain',
    type: 'text',
    required: true,
    aliases: ['domain', 'website', 'website url', 'websiteurl', 'url', 'domain name', 'site', 'site url', 'web address', 'host'],
    hint: 'Root domain. Full URLs and www are normalised automatically.',
  },
  {
    key: 'website_name',
    label: 'Website title',
    type: 'text',
    aliases: ['website name', 'websitename', 'name', 'title', 'site name', 'publication', 'publisher'],
  },
  {
    key: 'description',
    label: 'Description',
    type: 'text',
    aliases: ['description', 'desc', 'summary', 'about', 'notes about site'],
  },
  {
    key: 'primary_niche',
    label: 'Primary niche',
    type: 'enum',
    aliases: ['primary niche', 'primaryniche', 'niche', 'category', 'vertical', 'topic', 'main niche', 'industry'],
  },
  {
    key: 'secondary_niches',
    label: 'Secondary niches',
    type: 'list',
    aliases: ['secondary niches', 'secondaryniches', 'other niches', 'additional niches', 'categories', 'sub niches', 'tags'],
  },
  {
    key: 'country',
    label: 'Country',
    type: 'enum',
    aliases: ['country', 'location', 'geo', 'market', 'region', 'country code', 'audience country'],
  },
  {
    key: 'language',
    label: 'Language',
    type: 'enum',
    aliases: ['language', 'lang', 'content language'],
  },
  {
    key: 'domain_rating',
    label: 'Domain rating',
    type: 'number',
    aliases: ['domain rating', 'domainrating', 'dr', 'ahrefs dr', 'dr score', 'domain authority', 'da'],
  },
  {
    key: 'organic_traffic',
    label: 'Organic traffic',
    type: 'number',
    aliases: ['organic traffic', 'organictraffic', 'traffic', 'monthly traffic', 'monthly organic traffic', 'visits', 'sessions', 'organic'],
  },
  {
    key: 'referring_domains',
    label: 'Referring domains',
    type: 'number',
    aliases: ['referring domains', 'referringdomains', 'ref domains', 'refdomains', 'rd', 'rds', 'ref_domains', 'linking domains', 'backlinks domains'],
  },
  {
    key: 'guest_post_price',
    label: 'Guest post price',
    type: 'price',
    // A bare "cost" is deliberately not an alias here. It used to map to the
    // sell price, which was harmless when there was nowhere else for it to go
    // - but now that cost columns exist and feed the margin figures, guessing
    // wrong would put a publisher's buy price in the customer-facing price.
    // Left unmapped, the admin is asked which one it is.
    aliases: ['guest post price', 'guestpostprice', 'guest post', 'guestpost', 'price', 'gp price', 'gp', 'post price', 'rate'],
  },
  {
    key: 'niche_edit_price',
    label: 'Niche edit price',
    type: 'price',
    aliases: ['niche edit price', 'nicheeditprice', 'niche edit', 'nicheedit', 'link insertion price', 'link insertion', 'ne price', 'ne'],
  },
  {
    key: 'digital_pr_price',
    label: 'Digital PR price',
    type: 'price',
    aliases: ['digital pr price', 'digitalprprice', 'digital pr', 'digitalpr', 'pr price', 'pr'],
  },
  {
    key: 'guest_post_cost',
    label: 'Guest post cost',
    type: 'price',
    aliases: [
      'guest post cost', 'guestpostcost', 'gp cost', 'cost price', 'costprice',
      'our cost', 'buy price', 'buying price', 'publisher price', 'publisher cost',
      'wholesale', 'wholesale price', 'net price', 'net cost',
    ],
    hint: 'What we pay the publisher. Internal only - never shown to customers.',
  },
  {
    key: 'niche_edit_cost',
    label: 'Niche edit cost',
    type: 'price',
    aliases: [
      'niche edit cost', 'nicheeditcost', 'ne cost', 'link insertion cost',
      'niche edit buy price', 'niche edit net',
    ],
    hint: 'What we pay the publisher for a link insertion.',
  },
  {
    key: 'digital_pr_cost',
    label: 'Digital PR cost',
    type: 'price',
    aliases: ['digital pr cost', 'digitalprcost', 'pr cost', 'digital pr buy price', 'pr net'],
    hint: 'What we pay for a digital PR placement.',
  },
  {
    key: 'currency',
    label: 'Currency',
    type: 'text',
    aliases: ['currency', 'ccy', 'currency code'],
    hint: 'Used to check prices match the marketplace currency.',
  },
  {
    key: 'turnaround_min_days',
    label: 'Turnaround min (days)',
    type: 'number',
    aliases: ['turnaround min days', 'turnaround min', 'min turnaround', 'turnaround', 'turnaround days', 'tat', 'delivery time', 'lead time'],
  },
  {
    key: 'turnaround_max_days',
    label: 'Turnaround max (days)',
    type: 'number',
    aliases: ['turnaround max days', 'turnaround max', 'max turnaround', 'turnaround to'],
  },
  {
    key: 'dofollow',
    label: 'Dofollow',
    type: 'boolean',
    aliases: ['dofollow', 'do follow', 'follow', 'link type', 'link attribute', 'is dofollow'],
  },
  {
    key: 'sponsored_tag',
    label: 'Sponsored tag',
    type: 'boolean',
    aliases: ['sponsored tag', 'sponsored', 'sponsored label', 'disclosure', 'paid tag'],
  },
  {
    key: 'minimum_word_count',
    label: 'Minimum word count',
    type: 'number',
    aliases: ['minimum word count', 'min word count', 'word count', 'words', 'min words'],
  },
  {
    key: 'maximum_links',
    label: 'Maximum links',
    type: 'number',
    aliases: ['maximum links', 'max links', 'links allowed', 'link limit', 'no of links'],
  },
  {
    key: 'accepted_niches',
    label: 'Accepted niches',
    type: 'list',
    aliases: [
      'accepted niches', 'accepts', 'allowed niches', 'accepted topics',
      'accepted content', 'niches accepted', 'topics accepted', 'allowed topics',
      'accepted verticals', 'we accept',
    ],
    hint: 'Separate with | or a comma. Matched to the marketplace niche list; unrecognised entries are ignored.',
  },
  {
    key: 'restricted_niches',
    label: 'Restricted niches',
    type: 'list',
    aliases: ['restricted niches', 'restrictions', 'prohibited', 'not accepted', 'banned niches', 'excluded niches'],
  },
  {
    key: 'notes',
    label: 'Notes',
    type: 'text',
    aliases: ['notes', 'internal notes', 'comment', 'comments', 'remarks'],
  },
  {
    key: 'status',
    label: 'Status',
    type: 'enum',
    aliases: ['status', 'state', 'listing status', 'active'],
    hint: 'draft, active, paused or archived. Defaults to draft.',
  },
];

export const importFieldByKey = new Map<ImportFieldKey, ImportField>(
  importFields.map((field) => [field.key, field]),
);

/** Header order used by the downloadable template. */
export const templateHeaders: ImportFieldKey[] = importFields.map((field) => field.key);

/** Example row shipped in the template, so the expected formats are obvious. */
export const templateExampleRow: Record<ImportFieldKey, string> = {
  domain: 'example-publication.co.uk',
  website_name: 'Example Publication',
  description: 'Independent UK publication covering personal finance.',
  primary_niche: 'Finance',
  secondary_niches: 'Business|Technology',
  country: 'United Kingdom',
  language: 'English',
  domain_rating: '62',
  organic_traffic: '48K',
  referring_domains: '8.1K',
  guest_post_price: '180',
  niche_edit_price: '140',
  digital_pr_price: '450',
  guest_post_cost: '95',
  niche_edit_cost: '70',
  digital_pr_cost: '260',
  currency: 'GBP',
  turnaround_min_days: '2',
  turnaround_max_days: '3',
  dofollow: 'yes',
  sponsored_tag: 'no',
  minimum_word_count: '800',
  maximum_links: '2',
  accepted_niches: 'Finance|Business|Crypto',
  restricted_niches: 'Adult|Gambling',
  notes: 'Editor prefers data-led pitches.',
  status: 'active',
};

/** Niche labels accepted in `primary_niche`, mapped to marketplace slugs. */
export const nicheAliases: Record<string, NicheSlug> = {
  igaming: 'igaming',
  'i gaming': 'igaming',
  gambling: 'igaming',
  casino: 'igaming',
  betting: 'igaming',
  sports: 'sports',
  sport: 'sports',
  finance: 'finance',
  financial: 'finance',
  money: 'finance',
  technology: 'technology',
  tech: 'technology',
  it: 'technology',
  software: 'technology',
  business: 'business',
  b2b: 'business',
  startups: 'business',
  health: 'health',
  healthcare: 'health',
  wellness: 'health',
  fitness: 'health',
  travel: 'travel',
  tourism: 'travel',
  lifestyle: 'lifestyle',
  fashion: 'lifestyle',
  crypto: 'crypto',
  cryptocurrency: 'crypto',
  blockchain: 'crypto',
  web3: 'crypto',
  entertainment: 'entertainment',
  music: 'entertainment',
  film: 'entertainment',
  movies: 'entertainment',
  automotive: 'automotive',
  cars: 'automotive',
  motoring: 'automotive',
  food: 'food',
  drink: 'food',
  recipes: 'food',
  'home and garden': 'home-garden',
  'home & garden': 'home-garden',
  'home-garden': 'home-garden',
  home: 'home-garden',
  garden: 'home-garden',
  interiors: 'home-garden',
};
