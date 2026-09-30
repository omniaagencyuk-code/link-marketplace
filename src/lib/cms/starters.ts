import type { PageTemplate } from './custom-page';

/**
 * What sections a new page starts with.
 *
 * Distinct from a page's template, which decides its design and its fields.
 * This decides what is already on it the first time somebody opens it - a
 * starting structure, not a rigid one, and everything in it can be reordered,
 * hidden or deleted afterwards.
 *
 * The reason to have them at all is that an empty page is a harder brief than
 * a wrong one. Somebody told to build an SEO landing page from nothing has to
 * decide the shape before they can start writing; somebody given eleven
 * sections in a sensible order only has to write.
 *
 * Deliberately short lists of common shapes rather than a library of them.
 * Duplicating a page that is already right covers most of what a longer list
 * would, and does it better.
 */

export interface Starter {
  key: string;
  label: string;
  help: string;
  /** Which designs this starter suits. */
  templates: PageTemplate[];
  /** Component keys, in order. Empty means an empty page. */
  sections: string[];
}

export const STARTERS: Starter[] = [
  {
    key: 'blank',
    label: 'Empty page',
    help: 'Just the page and its own fields. Add sections yourself.',
    templates: ['service', 'niche'],
    sections: [],
  },
  {
    key: 'seo-landing',
    label: 'SEO landing page',
    help: 'Copy, a comparison, a checklist and questions. For a page that has to rank before it sells.',
    templates: ['service', 'niche'],
    sections: [
      'rich-text',
      'marketplace-search',
      'expandable',
      'comparison',
      'checklist',
      'related-pages',
      'faq',
      'signup-cta',
    ],
  },
  {
    key: 'niche-landing',
    label: 'Niche link building page',
    help: 'The shape of the gambling page: the marketplace up front, then the argument.',
    templates: ['niche'],
    sections: [
      'marketplace-stats',
      'marketplace-preview',
      'feature-cards',
      'rich-text',
      'parrot-says',
      'checklist',
      'marketplace-cta',
      'related-pages',
      'faq',
      'signup-cta',
    ],
  },
  {
    key: 'service',
    label: 'Service page',
    help: 'What the service is, why it works, what it costs, and the ask.',
    templates: ['service'],
    sections: [
      'rich-text',
      'icon-grid',
      'steps',
      'marketplace-preview',
      'faq',
      'signup-cta',
    ],
  },
  {
    key: 'guide',
    label: 'Long form guide',
    help: 'Mostly reading, broken up. For something somebody sits down with.',
    templates: ['service'],
    sections: [
      'rich-text',
      'parrot-says',
      'expandable',
      'table',
      'checklist',
      'rich-text',
      'related-pages',
      'faq',
    ],
  },
];

/** The starters that suit a design, with the empty one always first. */
export function startersFor(template: PageTemplate): Starter[] {
  return STARTERS.filter((starter) => starter.templates.includes(template));
}

/** A chosen starter, or the empty one. Never something else. */
export function readStarter(raw: unknown, template: PageTemplate): Starter {
  const found = STARTERS.find((starter) => starter.key === raw);
  return found && found.templates.includes(template) ? found : STARTERS[0];
}
