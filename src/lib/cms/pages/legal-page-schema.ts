import { richtext, section, text, textarea } from '../fields';
import type { SectionDef } from '../types';

/**
 * The shape shared by every legal page.
 *
 * Terms, privacy and cookies are all the same object: a title, a date the
 * document was last changed, and a body. The body is markdown edited in the
 * admin, because these documents are revised by the business and its advisers
 * rather than by whoever is next deploying the site.
 *
 * The "last updated" date is a field rather than a file timestamp on purpose.
 * It should change when the document's meaning changes, not when somebody
 * fixes a typo or redeploys.
 */
export function legalSections(): SectionDef[] {
  return [
    section(
      'page',
      'Document',
      [
        text('title', 'Title', { maxLength: 120 }),
        text('updatedAt', 'Last updated', {
          maxLength: 40,
          help: 'Shown under the heading, e.g. "16 September 2026". Change it when the terms change.',
        }),
        textarea('intro', 'Standfirst', {
          rows: 3,
          maxLength: 400,
          help: 'One short paragraph under the title. Optional.',
        }),
        richtext('body', 'Body', {
          rows: 30,
          maxLength: 60_000,
          help: 'Markdown. ## for a section heading, - for bullets, [text](/page) for a link.',
        }),
      ],
      'The whole document. Have a solicitor review the wording before relying on it.',
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
  ];
}
