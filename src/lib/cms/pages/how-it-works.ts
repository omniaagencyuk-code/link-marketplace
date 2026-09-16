import { link, list, section, text, textarea } from '../fields';
import type { PageDef, PageValues } from '../types';

/**
 * /how-it-works
 *
 * The four journey steps are editable here rather than in
 * `lib/config/how-it-works`, so the page an editor changes is the page a
 * visitor reads. The homepage keeps its own copy of the same steps - the two
 * pages frame them differently and nothing good comes of forcing one wording
 * to serve both.
 */

export const definition: PageDef = {
  slug: 'how-it-works',
  label: 'How it works',
  path: '/how-it-works',
  description: 'The journey from shortlist to live link, the three link products and vetting.',
  sections: [
    section(
      'hero',
      'Hero',
      [
        text('eyebrow', 'Eyebrow', { maxLength: 60 }),
        text('title', 'Headline', { maxLength: 120 }),
        textarea('intro', 'Intro paragraph', { rows: 3, maxLength: 400 }),
        link('primaryCta', 'Primary button'),
        link('secondaryCta', 'Secondary button'),
      ],
      'The band at the top of the page.',
    ),

    section(
      'journey',
      'The four steps',
      [
        text('heading', 'Heading', { maxLength: 120 }),
        textarea('intro', 'Intro paragraph', { rows: 3, maxLength: 400 }),
        list(
          'steps',
          'Steps',
          [
            text('number', 'Number', { maxLength: 4, help: 'e.g. 01' }),
            text('title', 'Title', { maxLength: 60 }),
            textarea('description', 'Short line', { rows: 2, maxLength: 200 }),
            textarea('detail', 'Longer explanation', { rows: 3, maxLength: 300 }),
          ],
          { itemLabelKey: 'title', minItems: 2, maxItems: 4 },
        ),
      ],
      'The dark green band. Designed for four steps across - fewer will stretch, more will wrap.',
    ),

    section(
      'products',
      'Three ways to place a link',
      [
        text('heading', 'Heading', { maxLength: 120 }),
        textarea('intro', 'Intro paragraph', { rows: 3, maxLength: 400 }),
        list(
          'items',
          'Products',
          [
            text('title', 'Title', { maxLength: 60 }),
            textarea('body', 'Description', { rows: 3, maxLength: 400 }),
            text('best', 'Best for', { maxLength: 120 }),
            text('href', 'Link', { maxLength: 200, help: 'An internal path.' }),
            text('linkLabel', 'Link label', { maxLength: 60 }),
          ],
          { itemLabelKey: 'title', minItems: 1, maxItems: 3 },
        ),
      ],
      'The three cards. Icons are fixed in code.',
    ),

    section(
      'vetting',
      'What vetted means',
      [
        text('heading', 'Heading', { maxLength: 120 }),
        textarea('intro', 'Intro paragraph', { rows: 4, maxLength: 500 }),
        list('items', 'Criteria', [textarea('text', 'Criterion', { rows: 2, maxLength: 300 })], {
          itemLabelKey: 'text',
          maxItems: 10,
        }),
      ],
      'Only claim what you actually check. This is the page a sceptical buyer reads most carefully.',
    ),

    section(
      'faqs',
      'FAQs',
      [
        list(
          'items',
          'Questions',
          [
            text('question', 'Question', { maxLength: 200 }),
            textarea('answer', 'Answer', { rows: 4, maxLength: 800 }),
          ],
          { itemLabelKey: 'question', maxItems: 15 },
        ),
      ],
      'Shown on the page and published as FAQ structured data.',
    ),

    section(
      'seo',
      'Search engine listing',
      [
        text('metaTitle', 'Meta title', { maxLength: 70 }),
        textarea('metaDescription', 'Meta description', { rows: 3, maxLength: 170 }),
      ],
      'How the page appears in search results.',
    ),
  ],
};

export const defaults: PageValues = {
  hero: {
    eyebrow: 'How it works',
    title: 'From shortlist to live link, without the back-and-forth',
    intro:
      'Press Parrot replaces outreach spreadsheets, email chains and invoice chasing with a single marketplace. You see the site, the metrics and the price before you commit.',
    primaryCta: { label: 'Browse the marketplace', href: '/marketplace' },
    secondaryCta: { label: 'Create an account', href: '/signup' },
  },

  journey: {
    heading: 'Built for marketers, by marketers',
    intro:
      'No back-and-forth emails, no invoice chasing and no guessing whether a site is real. Four steps from search to live link.',
    steps: [
      {
        number: '01',
        title: 'Create Your Free Account',
        description: 'Unlock the Press Parrot marketplace.',
        detail:
          'Signing up takes about a minute, costs nothing and carries no subscription. The marketplace opens as soon as you are in.',
      },
      {
        number: '02',
        title: 'Find the Right Websites',
        description:
          'Filter publishers by niche, country, DR, traffic, pricing and other SEO metrics.',
        detail:
          'Stack filters on domain rating, organic traffic, referring domains, country, language, turnaround and price until the shortlist is exactly right.',
      },
      {
        number: '03',
        title: 'Place Your Order',
        description:
          'Choose your placement, provide your URL and anchor text and add content if required.',
        detail:
          'Add the details once on the order page, attach an article if you have one, or order the writing from us in the same order.',
      },
      {
        number: '04',
        title: 'Track Your Links',
        description: 'Follow your order through publication and receive the live URL when complete.',
        detail:
          'Every order shows its current status, and you get the live URL as soon as the placement is published.',
      },
    ],
  },

  products: {
    heading: 'Three ways to place a link',
    intro:
      'Pick the product that matches the page you are trying to rank. Most campaigns use a mix of all three.',
    items: [
      {
        title: 'Guest post',
        body: 'A new article written around your subject and published with a contextual link to your page.',
        best: 'Best for new pages and topical authority',
        href: '/guest-posts',
        linkLabel: 'Browse guest post inventory',
      },
      {
        title: 'Niche edit',
        body: 'Your link added to an article that is already published and already indexed.',
        best: 'Best for fast links on aged, indexed pages',
        href: '/niche-edits',
        linkLabel: 'Browse niche edit inventory',
      },
      {
        title: 'Digital PR',
        body: 'Editorial coverage or expert commentary placed with a publication through its newsroom.',
        best: 'Best for brand coverage on large publications',
        href: '/digital-pr',
        linkLabel: 'Browse digital PR inventory',
      },
    ],
  },

  vetting: {
    heading: 'What "vetted" actually means',
    intro:
      'Roughly one in four websites that apply to join the marketplace is accepted. The rest fail on traffic quality, link profile or editorial standards. Vetting is repeated every quarter, and listings that slip are paused.',
    items: [
      { text: 'Real organic traffic confirmed against two independent SEO data sources.' },
      { text: 'An editorial team and a publishing history that predates any link selling.' },
      { text: 'No link farms, private blog networks or sites built purely for placements.' },
      { text: 'Clean outbound link profile with a sensible ratio of sponsored content.' },
      { text: 'Indexed pages, a working sitemap and no manual action history we can detect.' },
      { text: 'Response times and publication reliability tracked on every completed order.' },
    ],
  },

  faqs: {
    items: [
      {
        question: 'Are the links permanent?',
        answer:
          'Yes. Every placement is sold as a permanent link with no yearly renewal fee. If a publisher removes a link within 12 months we replace it on a site of equal or better quality at no cost.',
      },
      {
        question: 'Who writes the content?',
        answer:
          'You can supply your own article, or let the publisher write it. Most listings support both. Where the publisher writes, one round of revisions is included in the price shown.',
      },
      {
        question: 'How fast are placements published?',
        answer:
          'Turnaround is shown on every listing and is measured in working days from content approval. Most guest posts go live within 24 to 72 hours; digital PR placements take longer because they go through a newsroom.',
      },
      {
        question: 'Do you accept gambling, finance or crypto content?',
        answer:
          'Many publishers do. Each listing states exactly which regulated topics it accepts, and you can filter the marketplace by niche to see only relevant inventory.',
      },
      {
        question: 'Can I see the site before I buy?',
        answer:
          'Every listing shows the domain, live metrics, audience geography, publishing rules and example placement paths once you have a free account. Nothing is hidden behind a paywall or an anonymised listing.',
      },
    ],
  },

  seo: {
    metaTitle: 'How it works',
    metaDescription:
      'How the Press Parrot link building marketplace works: search vetted websites, review metrics, order guest posts or niche edits and get the live URL.',
  },
};
