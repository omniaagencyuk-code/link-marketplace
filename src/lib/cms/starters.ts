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
  /**
   * Component keys, in order. Empty means an empty page.
   *
   * A starter is the whole page, so every non-empty one begins with that
   * page's first screen. That was once only true of the niche template: a
   * service page drew its template and hung its sections off the end, so its
   * starters deliberately carried no hero, because the template was already
   * drawing one and two H1s is worse than none.
   *
   * Service pages render from their sections now, which turns that reasoning
   * around completely - a starter without a hero would produce a page with no
   * hero at all. Hence the first entry in each list below.
   */
  sections: string[];
}

export const STARTERS: Starter[] = [
  {
    key: 'blank',
    label: 'Empty page',
    help: 'No sections. The page renders from its template until you convert it, which brings every band across as an editable section.',
    templates: ['service', 'niche'],
    sections: [],
  },
  {
    key: 'seo-landing',
    label: 'SEO landing page',
    help: 'Copy, a comparison, a checklist and questions. For a page that has to rank before it sells.',
    templates: ['service'],
    sections: [
      'hero',
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
    help: 'The shape of the gambling page, block for block.',
    templates: ['niche'],
    sections: [
      'niche-hero',
      'niche-preview',
      'topic-pills',
      'benefit-cards',
      'journey-steps',
      'article-body',
      'content-upsell',
      'faq',
      'cta',
    ],
  },
  {
    key: 'service',
    label: 'Service page',
    help: 'What the service is, why it works, what it costs, and the ask. The same shape converting an existing service page produces.',
    templates: ['service'],
    /*
      Deliberately the same list `servicePageBlueprint` produces, in the same
      order. A page created from this starter and a page converted from the
      template are then the same page, which is what stops "new" and
      "converted" quietly becoming two different designs.

      `article-body` rather than a bare `rich-text`: it is the editorial column
      with the related links sticky beside it, which is the band the service
      template drew and the one worth keeping.
    */
    sections: [
      'hero',
      'feature-cards',
      'marketplace-preview',
      'article-body',
      'faq',
      'cta',
    ],
  },
  {
    key: 'guide',
    label: 'Long form guide',
    help: 'Mostly reading, broken up. For something somebody sits down with.',
    templates: ['service'],
    sections: [
      'hero',
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
