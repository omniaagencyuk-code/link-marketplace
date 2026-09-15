import { image, link, list, richtext, section, text, textarea } from '../fields';
import type { SectionDef } from '../types';

/**
 * The shape shared by every service page.
 *
 * /link-building, /guest-posts, /niche-edits, /digital-pr and
 * /link-building-agencies all render through one template, so they share one
 * editable schema. Adding a sixth service page means adding its defaults, not
 * another schema.
 *
 * Icons are deliberately *not* editable. An editor choosing icons is how a
 * consistent page turns into a jumble, and the icon carries no meaning a
 * reader depends on.
 */
export function serviceSections(): SectionDef[] {
  return [
    section(
      'hero',
      'Hero',
      [
        text('eyebrow', 'Eyebrow', { maxLength: 60, help: 'Small uppercase line above the headline.' }),
        text('title', 'Headline', { maxLength: 120 }),
        textarea('intro', 'Intro paragraph', { rows: 4, maxLength: 500 }),
        link('primaryCta', 'Primary button'),
        link('secondaryCta', 'Secondary button'),
        text('microcopy', 'Reassurance line', {
          maxLength: 120,
          help: 'The small print under the buttons, e.g. "Free account, no subscription".',
        }),
      ],
      'The first screen. Changing the headline here changes what the page is about, so it is worth a moment.',
    ),

    section(
      'highlights',
      'Value points',
      [
        list(
          'items',
          'Points',
          [text('title', 'Title', { maxLength: 60 }), textarea('body', 'Description', { rows: 3, maxLength: 300 })],
          { itemLabelKey: 'title', minItems: 2, maxItems: 4 },
        ),
      ],
      'The four short points below the hero. Between two and four - the row is designed for four.',
    ),

    section(
      'preview',
      'Marketplace preview',
      [
        text('heading', 'Heading', { maxLength: 120 }),
        textarea('body', 'Supporting copy', { rows: 3, maxLength: 400 }),
      ],
      'Wraps the redacted marketplace table. The table itself is generated - it never shows real domains.',
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
              help: 'Markdown. ## for a subheading, - for bullets, [text](/page) for an internal link.',
            }),
          ],
          { itemLabelKey: 'heading', minItems: 1, maxItems: 12 },
        ),
      ],
      'The editorial body of the page. This is the part search engines read most closely.',
    ),

    section(
      'faqs',
      'FAQs',
      [
        list(
          'items',
          'Questions',
          [text('question', 'Question', { maxLength: 200 }), textarea('answer', 'Answer', { rows: 4, maxLength: 800 })],
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
            text('href', 'Path', { maxLength: 120, help: 'An internal path, e.g. /guest-posts' }),
            text('description', 'Description', { maxLength: 120 }),
          ],
          { itemLabelKey: 'label', maxItems: 8 },
        ),
      ],
      'The sidebar links. Good internal linking is one of the cheapest SEO wins available, so keep these relevant.',
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
        text('metaTitle', 'Meta title', {
          maxLength: 70,
          help: 'What Google shows as the blue link. Around 60 characters reads best.',
        }),
        textarea('metaDescription', 'Meta description', {
          rows: 3,
          maxLength: 170,
          help: 'The grey text under the link. Around 155 characters.',
        }),
        image('ogImage', 'Social share image', {
          help: 'Shown when the page is shared. 1200x630 works everywhere.',
        }),
      ],
      'How the page appears in search results and when shared.',
    ),
  ];
}
