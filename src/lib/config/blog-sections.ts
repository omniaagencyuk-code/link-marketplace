/**
 * The parts of a blog post beyond its title and its body.
 *
 * A post used to be a slug, some markdown, and a page that hard-coded
 * everything around it: the same closing call to action on every article, the
 * same three related posts, and no way to put a question and answer on a page
 * that was answering questions. Those were reasonable defaults and a bad
 * ceiling - the moment one article wanted a different ending, the only way to
 * get one was a deploy.
 *
 * So each is a field now, and each default below reproduces exactly what the
 * page rendered when it was hard-coded. A post that nobody edits looks the
 * same as it did; a post that somebody edits can differ.
 *
 * Deliberately *not* here: the value-point row that service pages carry. Four
 * short benefit statements make sense under a headline selling something and
 * make none under the headline of an article, which is why the blog editor
 * does not offer them.
 */

/** Which posts appear under the article, if any. */
export type RelatedMode = 'related' | 'latest' | 'none';

export const RELATED_MODES: { value: RelatedMode; label: string; help: string }[] = [
  {
    value: 'related',
    label: 'Related posts',
    help: 'Other posts in the same category, newest first.',
  },
  {
    value: 'latest',
    label: 'Latest posts',
    help: 'The newest posts from anywhere on the blog, whatever the category.',
  },
  { value: 'none', label: 'Nothing', help: 'End the page at the call to action.' },
];

export interface BlogMarketplaceSection {
  show: boolean;
  heading: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
  /** The small line under the button. */
  note: string;
}

export interface BlogFaq {
  question: string;
  answer: string;
}

export interface BlogCtaSection {
  show: boolean;
  heading: string;
  body: string;
  primaryLabel: string;
  primaryHref: string;
  /** Both blank hides the second button rather than rendering an empty one. */
  secondaryLabel: string;
  secondaryHref: string;
}

export interface BlogSections {
  marketplace: BlogMarketplaceSection;
  faqs: BlogFaq[];
  relatedMode: RelatedMode;
  cta: BlogCtaSection;
}

/** How many posts the related and latest lists show. */
export const RELATED_POST_COUNT = 3;

export const blogSectionDefaults: BlogSections = {
  marketplace: {
    show: true,
    heading: 'See what a placement actually costs',
    body:
      'Every listing carries its domain rating, organic traffic, referring domains, country and price before you commit to anything. Filter to the publishers that fit the campaign you have just read about.',
    ctaLabel: 'Unlock the Marketplace',
    ctaHref: '/marketplace',
    note: 'Create a free account to browse publishers and pricing.',
  },

  faqs: [],

  relatedMode: 'related',

  // Word for word what the page rendered before any of this was editable.
  cta: {
    show: true,
    heading: 'Put it into practice',
    body: 'Create a free account and search thousands of vetted publishers in a few minutes.',
    primaryLabel: 'Create Free Account',
    primaryHref: '/signup',
    secondaryLabel: 'Explore the marketplace',
    secondaryHref: '/marketplace',
  },
};

/**
 * A stored value merged onto the defaults, one field at a time.
 *
 * Shallow per section rather than a wholesale replace: a post saved before a
 * field existed, or saved with half a section filled in, still renders a
 * complete page instead of a heading with no body under it. Anything that is
 * not the right shape is ignored rather than trusted - this comes out of the
 * database as `jsonb`, which is to say as whatever was last written there.
 */
export function readBlogSections(raw: unknown): BlogSections {
  const stored = isRecord(raw) ? raw : {};

  return {
    marketplace: {
      ...blogSectionDefaults.marketplace,
      ...pick(stored.marketplace, {
        show: 'boolean',
        heading: 'string',
        body: 'string',
        ctaLabel: 'string',
        ctaHref: 'string',
        note: 'string',
      }),
    },
    faqs: readFaqs(stored.faqs),
    relatedMode: RELATED_MODES.some((mode) => mode.value === stored.relatedMode)
      ? (stored.relatedMode as RelatedMode)
      : blogSectionDefaults.relatedMode,
    cta: {
      ...blogSectionDefaults.cta,
      ...pick(stored.cta, {
        show: 'boolean',
        heading: 'string',
        body: 'string',
        primaryLabel: 'string',
        primaryHref: 'string',
        secondaryLabel: 'string',
        secondaryHref: 'string',
      }),
    },
  };
}

/**
 * A question with no answer is not a FAQ.
 *
 * Both halves are required because the pair becomes a `FAQPage` entry in the
 * structured data, and Google treats a question with an empty answer as a
 * reason to distrust the markup on the whole page rather than as one row to
 * skip.
 */
function readFaqs(raw: unknown): BlogFaq[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isRecord)
    .map((entry) => ({
      question: typeof entry.question === 'string' ? entry.question.trim() : '',
      answer: typeof entry.answer === 'string' ? entry.answer.trim() : '',
    }))
    .filter((faq) => faq.question.length > 0 && faq.answer.length > 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The named keys, only where the stored value is of the type expected. */
function pick<T extends Record<string, unknown>>(
  raw: unknown,
  shape: Record<string, 'string' | 'boolean'>,
): Partial<T> {
  if (!isRecord(raw)) return {};
  const out: Record<string, unknown> = {};
  for (const [key, kind] of Object.entries(shape)) {
    if (typeof raw[key] === kind) out[key] = raw[key];
  }
  return out as Partial<T>;
}
