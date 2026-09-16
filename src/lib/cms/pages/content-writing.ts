import { link, list, richtext, section, text, textarea } from '../fields';
import type { PageDef, PageValues } from '../types';

/**
 * /content-writing
 *
 * The one thing on this page that is *not* editable copy is the price table:
 * those numbers come from settings, so that the price quoted on the marketing
 * page and the price charged in the order form can never drift apart. Where no
 * price is configured the table says "on request" rather than inventing one.
 */

export const definition: PageDef = {
  slug: 'content-writing',
  label: 'Content writing',
  path: '/content-writing',
  description: 'The standalone content ordering service page.',
  sections: [
    section(
      'hero',
      'Hero',
      [
        text('eyebrow', 'Eyebrow', { maxLength: 60 }),
        text('title', 'Headline', { maxLength: 120 }),
        textarea('intro', 'Intro paragraph', { rows: 4, maxLength: 500 }),
        link('primaryCta', 'Primary button'),
        link('secondaryCta', 'Secondary button'),
        text('microcopy', 'Reassurance line', { maxLength: 120 }),
      ],
      'The first screen.',
    ),

    section(
      'highlights',
      'Value points',
      [
        list(
          'items',
          'Points',
          [
            text('title', 'Title', { maxLength: 60 }),
            textarea('body', 'Description', { rows: 3, maxLength: 300 }),
          ],
          { itemLabelKey: 'title', minItems: 2, maxItems: 4 },
        ),
      ],
      'The four points below the hero. The row is designed for four.',
    ),

    section(
      'types',
      'What we write',
      [
        text('heading', 'Heading', { maxLength: 120 }),
        textarea('intro', 'Intro paragraph', { rows: 3, maxLength: 400 }),
      ],
      'Wraps the content type cards. The cards themselves come from the ordering options, so they always match what a customer can actually order.',
    ),

    section(
      'pricing',
      'Pricing',
      [
        text('heading', 'Heading', { maxLength: 120 }),
        textarea('introConfigured', 'Intro when prices are set', { rows: 3, maxLength: 400 }),
        textarea('introUnset', 'Intro when no prices are set', {
          rows: 3,
          maxLength: 400,
          help: 'Shown until content prices are configured in Settings. Never promises a number.',
        }),
        text('customHeading', 'Custom length label', { maxLength: 60 }),
        textarea('customBody', 'Custom length copy', { rows: 3, maxLength: 400 }),
      ],
      'The price figures themselves come from Settings, not from here - so the page can never quote a price the order form does not charge.',
    ),

    section(
      'steps',
      'How ordering works',
      [
        text('heading', 'Heading', { maxLength: 120 }),
        list(
          'items',
          'Steps',
          [
            text('step', 'Number', { maxLength: 4, help: 'e.g. 01' }),
            text('title', 'Title', { maxLength: 60 }),
            textarea('body', 'Description', { rows: 3, maxLength: 300 }),
          ],
          { itemLabelKey: 'title', minItems: 1, maxItems: 6 },
        ),
        link('cta', 'Button'),
        text('annotation', 'Handwritten note', {
          maxLength: 40,
          help: 'The green handwritten line beside the sidebar. Short works best.',
        }),
        text('includesHeading', 'Sidebar heading', { maxLength: 60 }),
        list('includes', 'Sidebar list', [text('text', 'Item', { maxLength: 120 })], {
          itemLabelKey: 'text',
          maxItems: 8,
        }),
      ],
      'The numbered steps and the "every article includes" panel beside them.',
    ),

    section(
      'body',
      'Editorial sections',
      [
        list(
          'sections',
          'Sections',
          [
            text('heading', 'Heading', { maxLength: 120 }),
            richtext('content', 'Content', {
              rows: 10,
              help: 'Markdown. ## for a subheading, - for bullets, [text](/page) for an internal link.',
            }),
          ],
          { itemLabelKey: 'heading', maxItems: 8 },
        ),
      ],
      'The longer-form copy near the bottom. This is the part search engines read most closely.',
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
      'cta',
      'Closing call to action',
      [
        text('heading', 'Heading', { maxLength: 120 }),
        textarea('body', 'Supporting copy', { rows: 3, maxLength: 300 }),
        link('primaryCta', 'Primary button'),
        link('secondaryCta', 'Secondary button'),
      ],
      'The dark band at the bottom of the page.',
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
    eyebrow: 'SEO content writing',
    title: 'SEO Content Written for Rankings, Links and Real Readers',
    intro:
      'Order professionally written SEO content without buying a placement. Brief the article once, choose the length and tone, and get something you would be happy to publish under your own name.',
    primaryCta: { label: 'Order Content', href: '/dashboard/content/new' },
    secondaryCta: { label: 'How It Works', href: '#how-it-works' },
    microcopy: 'Free account · No subscription · No placement required',
  },

  highlights: {
    items: [
      {
        title: 'Briefed from the search results',
        body: 'We start from what already ranks for your keyword and what it fails to answer, not from a blank page.',
      },
      {
        title: 'Written for readers too',
        body: 'Content that only satisfies a checklist tends to satisfy nobody. Structure serves the argument, not the other way round.',
      },
      {
        title: 'No placement required',
        body: 'Order content on its own. You do not have to buy a backlink to get an article written.',
      },
      {
        title: 'UK and US English',
        body: 'Choose the variant per article. More languages are planned; the ordering flow already accounts for them.',
      },
    ],
  },

  types: {
    heading: 'What we write',
    intro:
      'Five content types cover most of what an SEO campaign needs. If yours is not on the list, describe it in the brief and we will scope it.',
  },

  pricing: {
    heading: 'Content pricing',
    introConfigured:
      'Fixed prices by length. Longer or more specialised pieces are quoted before any writing begins.',
    introUnset:
      'Prices are set per length and confirmed before any writing begins. Tell us what you need and we will quote it.',
    customHeading: 'Custom length',
    customBody:
      'Any length from 500 to 3,000 words is available in the order form, and anything beyond that is quoted individually.',
  },

  steps: {
    heading: 'How ordering content works',
    items: [
      {
        step: '01',
        title: 'Create a free account',
        body: 'No subscription and no minimum. You only pay for what you order.',
      },
      {
        step: '02',
        title: 'Brief the article',
        body: 'Topic, target keyword, word count, tone, audience and anything the writer should know. Attach a brief document if you have one.',
      },
      {
        step: '03',
        title: 'Add it to your order',
        body: 'Queue several articles before checking out - three 1,000 word pieces, or a mix of lengths and types.',
      },
      {
        step: '04',
        title: 'Review and approve',
        body: 'Read the draft in your dashboard, request a revision if it needs one, and download the final article.',
      },
    ],
    cta: { label: 'Order Content', href: '/dashboard/content/new' },
    annotation: 'No filler. No fluff.',
    includesHeading: 'Every article includes',
    includes: [
      { text: 'Keyword-led structure and headings' },
      { text: 'Your target URL and anchor placed naturally' },
      { text: 'Internal link suggestions where relevant' },
      { text: 'A meta title and description' },
      { text: 'One round of revisions as standard' },
    ],
  },

  body: {
    sections: [
      {
        heading: 'Content and link building work better together',
        content: `A link points at a page. If that page does not answer the question the reader arrived with, the link has done its job and the page has wasted it. This is the most common reason a link building campaign underperforms: the target pages were never strong enough to hold a ranking once they got there.

Ordering content and [link building](/link-building) through the same account keeps the two aligned. The article that goes out as a [guest post](/guest-posts) can be briefed against the same keyword as the page it links to, and the page itself can be strengthened at the same time.`,
      },
      {
        heading: 'What good SEO content looks like now',
        content: `Keyword density stopped being a useful target a long time ago. What matters is whether a page covers the subject properly: the main question, the follow-up questions, the comparisons a reader will want, and the caveats an expert would mention.

We brief every article from the search results for its target keyword, which shows both what is expected and what everyone currently ranking has left out. The second of those is usually where the opportunity is.`,
      },
    ],
  },

  faqs: {
    items: [
      {
        question: 'Can I order content without buying a backlink?',
        answer:
          'Yes. Content ordering is a standalone service. You can order articles, blog posts, landing pages or website copy without buying any placement, and you can order a placement without ordering content.',
      },
      {
        question: 'What does SEO content writing cost?',
        answer:
          'Pricing is set per word count and content type. The table on this page shows current prices; where a length is not listed we quote it before any writing begins.',
      },
      {
        question: 'How do revisions work?',
        answer:
          'Every article can be sent back for revision from your dashboard with notes on what needs changing. The request goes straight to the writer and you can see the status of it throughout.',
      },
      {
        question: 'Can you write guest posts for a specific publisher?',
        answer:
          'Yes. Tell us the publisher and we will write to their editorial requirements, whether or not you buy the placement through Press Parrot.',
      },
      {
        question: 'Who writes the content?',
        answer:
          'Our in-house writing team and a small vetted pool of specialist freelancers for technical niches. You are told which brief went to which writer inside your order.',
      },
      {
        question: 'Do you use AI to write the articles?',
        answer:
          'Articles are written and edited by people. Where research tools are used, a writer is still responsible for the argument, the accuracy and the final draft.',
      },
    ],
  },

  cta: {
    heading: 'Order your first article',
    body: 'Create a free account, brief the piece and we will take it from there.',
    primaryCta: { label: 'Order Content', href: '/dashboard/content/new' },
    secondaryCta: { label: 'Explore the marketplace', href: '/marketplace' },
  },

  seo: {
    metaTitle: 'SEO content writing services',
    metaDescription:
      'Order SEO content writing without buying a placement. Articles, blog posts, guest posts, landing pages and website copy, briefed by you and written to rank and read well.',
  },
};
