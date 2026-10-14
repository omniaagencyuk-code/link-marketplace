import { list, section, text, textarea } from '../fields';
import { serviceSections } from './service-page-schema';
import type { PageDef, PageValues } from '../types';

/**
 * /guest-posts
 *
 * The shared service schema plus two sections only this page has. They are
 * appended rather than added to `serviceSections()` because that function is
 * the editor for five pages, and a "how it works" box appearing on the other
 * four - empty, with nothing rendering it - would be an editor asking for
 * copy that goes nowhere.
 *
 * Everything the redesign animates is still typed here. The sequence, the
 * figures and the icons are fixed in code; the words are not. An editor who
 * rewrites the three steps gets three different steps, animated the same way.
 */
export const definition: PageDef = {
  slug: 'guest-posts',
  label: 'Guest posts',
  path: '/guest-posts',
  description: 'Service page targeting "buy guest posts" and related terms.',
  sections: [
    ...serviceSections(),

    section(
      'howItWorks',
      'How it works',
      [
        text('heading', 'Heading', { maxLength: 120 }),
        textarea('intro', 'Intro paragraph', { rows: 3, maxLength: 400 }),
        list(
          'items',
          'Steps',
          [
            text('title', 'Step title', { maxLength: 60 }),
            textarea('body', 'Step description', { rows: 3, maxLength: 300 }),
          ],
          { itemLabelKey: 'title', minItems: 1, maxItems: 3 },
        ),
      ],
      'Three cards, numbered and animated in order. Designed for three - a fourth will not get a number of its own.',
    ),

    section(
      'metrics',
      'Metrics showcase',
      [
        text('heading', 'Heading', { maxLength: 120 }),
        textarea('intro', 'Intro paragraph', { rows: 3, maxLength: 400 }),
        text('caption', 'Caption under the panels', { maxLength: 200 }),
      ],
      'The animated traffic, rating, keyword and country panels. The figures in them are demonstration data fixed in code - only this copy is editable.',
    ),
  ],
};

export const defaults: PageValues = {
  hero: {
    eyebrow: 'Guest posts',
    title: 'Guest Posts on Websites People Actually Read',
    intro:
      'Get a contextual backlink inside an original article published on a relevant site. Choose the publisher yourself, supply the article or let us write it, and see the price before you commit.',
    primaryCta: { label: 'Get Started Free', href: '/signup' },
    secondaryCta: { label: 'How It Works', href: '/how-it-works' },
    microcopy: 'Free account · No subscription · Pay only for what you order',
  },

  highlights: {
    items: [
      {
        title: 'Choose the site yourself',
        body: 'No opaque bundles or "DR 50+ package". You see each publisher, its metrics and its price, and you decide.',
      },
      {
        title: 'Bring content or order it',
        body: 'Send us your article, or add writing to the same order and we will produce something the publisher will accept.',
      },
      {
        title: 'Contextual by default',
        body: 'Your link sits inside the body of the article, in a sentence that makes sense without it.',
      },
      {
        title: 'Turnaround shown upfront',
        body: 'Each listing states its own typical turnaround, so you can plan a campaign rather than guess at one.',
      },
    ],
  },

  preview: {
    heading: 'Pick the publisher, not a package',
    body: 'Filter by niche, country, domain rating, traffic and price until the shortlist fits the campaign. Publisher names appear once you have a free account.',
  },

  howItWorks: {
    heading: 'Three steps from search to published link',
    intro:
      'No calls, no proposals and no waiting for a quote. The marketplace is open once you have a free account, and every publisher in it shows its own price.',
    items: [
      {
        title: 'Find the right websites',
        body: 'Filter by niche, country, domain rating, traffic and price until the shortlist is sites you would be happy to be published on.',
      },
      {
        title: 'Check the metrics yourself',
        body: 'Open any listing for its traffic trend, referring domains, keyword count and where its readers actually are, before you spend anything.',
      },
      {
        title: 'Order the guest post',
        body: 'Add the placement to an order, supply your article or add writing to it, and track the piece through to the live URL.',
      },
    ],
  },

  metrics: {
    heading: 'The numbers that decide whether a link is worth buying',
    intro:
      'A domain rating on its own is easy to manufacture. These are the figures shown on every listing, so you can tell a site with an audience from a site with a score.',
    caption:
      'Figures shown for an example publisher. Real listings carry their own measured metrics, refreshed from Ahrefs.',
  },

  body: {
    sections: [
      {
        heading: 'What a guest post is',
        content: `A guest post is an article written for someone else's website, published under their editorial standards, containing a link back to a page of yours. Unlike a link added to an existing article, the whole piece is written around a subject you choose, which gives you far more control over the context your link appears in.

That control is the point. You decide which page the article supports, what the surrounding argument is, and where in the piece the link naturally belongs.`,
      },
      {
        heading: 'When a guest post is the right choice',
        content: `Guest posts suit pages that need context to make sense of them: a new service page with nothing pointing at it yet, a commercial term where the competition is entrenched, or a subject your own site has not established any authority on.

They are also the better option when the framing matters. If the useful link is one that explains why your approach is different, that explanation has to exist somewhere, and an existing article will rarely contain it.

- New pages with no existing links
- Competitive commercial terms
- Subjects where your site has little topical authority yet
- Campaigns where the surrounding argument matters as much as the link`,
      },
      {
        heading: 'Guest posts vs niche edits',
        content: `A [niche edit](/niche-edits) puts your link into an article that already exists and is already indexed, which usually means a faster result and a page with some history behind it. A guest post creates a new article, which takes a little longer but gives you the whole piece to work with.

In practice most campaigns use both. Niche edits keep momentum on pages that are already close, while guest posts do the heavier lifting on pages that need to establish relevance from scratch.`,
      },
      {
        heading: 'What we check before a site is listed',
        content: `A high domain rating is easy to manufacture and tells you very little on its own, so we look at whether the organic traffic is real and reasonably distributed, whether the site publishes anything other than sponsored posts, and how many outbound links its articles already carry.

Sites that fail are not listed at a discount. They are not listed.

- Real, sustained organic traffic rather than a spike
- Genuine editorial content alongside any sponsored work
- A sensible outbound link profile
- Indexed pages and a plausible publishing history`,
      },
    ],
  },

  faqs: {
    items: [
      {
        question: 'Do you offer guest posts?',
        answer:
          'Yes. Guest posts are one of three placement types in the marketplace, alongside niche edits and digital PR. You choose the publisher and can either supply the article or order the writing from us.',
      },
      {
        question: 'Do I have to write the article?',
        answer:
          'No. You can supply your own article, or add content writing to the same order and our team will write it to the publisher’s requirements.',
      },
      {
        question: 'Will the link be dofollow?',
        answer:
          'Each listing states its own link policy, including whether links are dofollow and whether a sponsored tag is applied, so you know before you order rather than after.',
      },
      {
        question: 'How long does a guest post take to go live?',
        answer:
          'Typically a few days to a couple of weeks, depending on the publisher’s own schedule. The expected turnaround is shown on each listing.',
      },
    ],
  },

  related: {
    items: [
      { label: 'Niche edits', href: '/niche-edits', description: 'Links added to existing articles.' },
      { label: 'Content writing', href: '/content-writing', description: 'Order the article on its own.' },
      { label: 'Link building', href: '/link-building', description: 'How the whole service fits together.' },
      { label: 'Pricing', href: '/pricing', description: 'What placements cost.' },
    ],
  },

  cta: {
    heading: 'Start building links that hold up',
    body: 'Create a free account, open the marketplace and order your first placement today.',
    primaryCta: { label: 'Create Free Account', href: '/signup' },
    secondaryCta: { label: 'See pricing', href: '/pricing' },
  },

  seo: {
    metaTitle: 'Buy guest posts',
    metaDescription:
      'Buy guest posts on vetted websites with real organic traffic. Filter by domain rating, niche and country, see the price upfront and order in a few clicks.',
    ogImage: { src: '', alt: '' },
  },
};
