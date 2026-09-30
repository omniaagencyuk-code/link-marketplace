import { image, link, list, richtext, section, text, textarea } from '../fields';
import type { SectionDef } from '../types';

/**
 * The shape shared by every niche landing page.
 *
 * Extracted from the gambling page, which is where it was designed and which
 * is still the only page rendering it today. The comment on that file said
 * "when a second niche page arrives, this schema is the one to share", and
 * this is that.
 *
 * It differs from `serviceSections()` in the ways a niche page differs from a
 * service page: a mascot and a wide banner, a live count of how many
 * publishers are in this niche, a row of filter shortcuts into the
 * marketplace, and a content upsell. The five service pages have no use for
 * any of those, which is why there are two schemas rather than one with
 * everything optional.
 *
 * A page created in the admin can choose this shape, which is the point of
 * pulling it out: a sports or finance landing page is now a page somebody
 * makes, not a page somebody deploys.
 */
export function nicheSections(): SectionDef[] {
  return [
    section(
      'marketplace',
      'Marketplace category',
      [
        text('niche', 'Category slug', {
          maxLength: 40,
          help:
            'Which marketplace category this page is about, e.g. igaming, finance, technology. The live count, the preview rows and the filter all follow it. Leave it blank to show the whole marketplace.',
        }),
      ],
      'Which part of the marketplace this page is an entry point to. /gambling-link-building sets this in code instead, so it cannot drift.',
    ),

    section(
      'hero',
      'Hero',
      [
        text('eyebrow', 'Eyebrow', { maxLength: 60 }),
        text('title', 'Headline', { maxLength: 120 }),
        textarea('intro', 'Intro paragraph', { rows: 4, maxLength: 500 }),
        list(
          'trust',
          'Trust indicators',
          [text('label', 'Label', { maxLength: 40 })],
          { itemLabelKey: 'label', minItems: 2, maxItems: 4 },
        ),
        link('primaryCta', 'Primary button', {
          help: 'Send this to /marketplace?niche=igaming so the filter is already applied.',
        }),
        link('secondaryCta', 'Secondary button'),
        text('microcopy', 'Reassurance line', { maxLength: 120 }),
        image('mascot', 'Mascot artwork', {
          help:
            'Shown on phones and tablets, and on desktop only when there is no hero banner. ' +
            'Drop the file at /public/images/parrots/gambling-parrot.webp and it appears here. ' +
            'Until then the drawn parrot is used, so the page is never broken.',
        }),
        image('banner', 'Hero banner', {
          help:
            'Wide artwork behind the whole first screen on desktop, replacing the mascot there. ' +
            'Draw it about 2000x700 with the subject on the right and the left kept clear, ' +
            'because the headline sits over that half. Clear this field to go back to the mascot.',
        }),
      ],
      'The first screen: headline, buttons, and either a mascot beside them or a banner behind them.',
    ),

    section(
      'preview',
      'Marketplace preview',
      [
        text('heading', 'Heading', { maxLength: 120 }),
        textarea('body', 'Supporting copy', { rows: 3, maxLength: 400 }),
        text('lockNote', 'Line above the table', { maxLength: 200 }),
        link('cta', 'Button'),
        text('countSuffix', 'Wording after the live count', {
          maxLength: 60,
          help: 'The number itself is counted from the marketplace and cannot be edited here.',
        }),
      ],
      'Wraps the redacted table. The rows are generated from real listings with everything identifying removed - no domain, price or id ever reaches this page.',
    ),

    section(
      'categories',
      'What publishers cover',
      [
        text('heading', 'Heading', { maxLength: 120 }),
        textarea('body', 'Supporting copy', { rows: 2, maxLength: 300 }),
        list(
          'items',
          'Shortcuts',
          [
            text('label', 'Label', { maxLength: 40 }),
            text('href', 'Marketplace link', {
              maxLength: 160,
              help: 'A real marketplace query, e.g. /marketplace?niche=igaming&q=casino',
            }),
          ],
          { itemLabelKey: 'label', maxItems: 12 },
        ),
      ],
      'Each one is a real marketplace search. Keep them that way: a shortcut that returns nothing teaches a visitor the marketplace is empty.',
    ),

    section(
      'highlights',
      'Why Press Parrot',
      [
        text('heading', 'Heading', { maxLength: 120 }),
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
      'The four cards. Claims here should be things the platform actually does.',
    ),

    section(
      'body',
      'Main content',
      [
        list(
          'sections',
          'Content sections',
          [
            text('heading', 'Heading', { maxLength: 120 }),
            richtext('content', 'Content', {
              rows: 10,
              help: 'Headings, lists, links, images and tables. The page decides how each one looks.',
            }),
          ],
          { itemLabelKey: 'heading', minItems: 1, maxItems: 12 },
        ),
      ],
      'The editorial body. This is the part search engines read most closely.',
    ),

    section(
      'content',
      'Content upsell',
      [
        text('heading', 'Heading', { maxLength: 120 }),
        textarea('body', 'Supporting copy', { rows: 3, maxLength: 300 }),
        link('cta', 'Button'),
      ],
      'The small band pointing at content ordering.',
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
      'Shown on the page and published as FAQ structured data. Only add questions you genuinely answer here.',
    ),

    section(
      'related',
      'Related links',
      [
        list(
          'items',
          'Links',
          [
            text('label', 'Label', { maxLength: 60 }),
            text('href', 'Path', { maxLength: 120 }),
            text('description', 'Description', { maxLength: 120 }),
          ],
          { itemLabelKey: 'label', maxItems: 8 },
        ),
      ],
      'The sidebar links beside the body copy.',
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
        image('ogImage', 'Social share image', { help: '1200x630 works everywhere.' }),
      ],
      'How the page appears in search results and when shared.',
    ),
  ];
}
