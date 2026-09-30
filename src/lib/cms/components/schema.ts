/**
 * What sections exist, and what an editor may change about each.
 *
 * **This file must never import a frontend component.** It is the half of the
 * registry the admin uses - labels, field definitions, variant lists - and it
 * is paired with `render.tsx`, which is the half the public site uses. Keeping
 * them apart is what stops the admin's editor, its drag-and-drop and its
 * TipTap bundle from reaching a public page: the public renderer imports
 * `render.tsx` and never gets here, and the admin imports this and never gets
 * a frontend component. The module graph enforces it, so nobody has to
 * remember.
 *
 * A component declares content. It cannot declare a font, a size, a colour, a
 * margin, a radius or a breakpoint, because there is no field type for any of
 * those. An editor picks a variant from a list the component names; what that
 * variant means belongs to the frontend. That is the whole design constraint,
 * expressed as an absence.
 */

import { image, link, list, richtext, text, textarea } from '../fields';
import { cleanRichTextDoc, isRichTextDoc } from '../rich-text';
import type { FieldDef, ListField } from '../types';
import type { SectionValues } from '../sections';

/** Where a component appears in the "add section" library. */
export type ComponentGroup =
  | 'content'
  | 'marketplace'
  | 'visual'
  | 'parrot'
  | 'conversion'
  | 'seo';

export const GROUP_LABELS: Record<ComponentGroup, string> = {
  content: 'Content',
  marketplace: 'Marketplace',
  visual: 'Visual',
  parrot: 'Press Parrot',
  conversion: 'Conversion',
  seo: 'SEO',
};

export interface ComponentVariant {
  key: string;
  label: string;
  /** What it looks like, in a few words, for the admin's variant picker. */
  help?: string;
}

export interface ComponentDef {
  /** Stored in `page_sections.component`. Never renamed once it is live. */
  key: string;
  label: string;
  group: ComponentGroup;
  /** One line in the section library, explaining when to reach for it. */
  description: string;
  fields: FieldDef[];
  /** The first is the default. A component with one variant offers no choice. */
  variants: ComponentVariant[];
  defaults: SectionValues;
  /**
   * Whether an entrance animation makes sense here.
   *
   * False for anything that is mostly long-form reading: animating a wall of
   * paragraphs as somebody scrolls into it is the thing that makes a site
   * feel like a template.
   */
  animatable: boolean;
  /**
   * Structural sections are locked by default when a page is created from a
   * template - a hero that can be dragged to the bottom of the page is a
   * mistake waiting to happen. Content stays editable; the lock is about
   * position and deletion.
   */
  structural?: boolean;
}

/*
  The library.

  Grouped the way the admin's picker groups them. Adding one later is an entry
  here and a component in `render.tsx` - no change to the CMS, the editor, the
  renderer or the database.

  Two patterns worth noticing. Several entries share a renderer and differ only
  in their defaults: a Signup CTA and a Marketplace CTA are the same layout
  pointed at different places, and an editor should find both in the library
  rather than find one and be told to retype it. And nothing here has a field
  for a colour, a size, a width or a class, which is not an omission.
*/

/** A card list, used by several components with different wording. */
const cardList = (label: string, itemLabel = 'Title') =>
  list(
    'items',
    label,
    [text('title', itemLabel, { maxLength: 80 }), textarea('body', 'Description', { rows: 3, maxLength: 300 })],
    { itemLabelKey: 'title', minItems: 1, maxItems: 12 },
  );

/** A list of single lines: checklist points, trust logos, reassurance. */
const lineList = (key: string, label: string, max = 20) =>
  list(key, label, [text('text', 'Line', { maxLength: 200 })], { itemLabelKey: 'text', maxItems: max });
const COMPONENTS: ComponentDef[] = [
  {
    key: 'rich-text',
    label: 'Rich Text',
    group: 'content',
    description: 'Headings, paragraphs, lists, links, images and tables.',
    animatable: false,
    variants: [
      { key: 'default', label: 'Standard', help: 'The usual reading column.' },
      { key: 'narrow', label: 'Narrow article', help: 'Tighter measure, for long reading.' },
      { key: 'wide', label: 'Wide', help: 'Full content width, for tables and wide images.' },
    ],
    fields: [
      text('heading', 'Heading', { maxLength: 160, help: 'Left blank, the section has no heading.' }),
      richtext('body', 'Content', { rows: 14 }),
    ],
    defaults: { heading: '', body: '' },
  },

  {
    key: 'cta',
    label: 'Call to Action',
    group: 'conversion',
    description: 'A heading, a line of copy and up to two buttons.',
    animatable: true,
    variants: [
      { key: 'light', label: 'Light', help: 'On the page background.' },
      { key: 'dark', label: 'Dark', help: 'Navy panel, for the end of a page.' },
      { key: 'marketplace', label: 'Marketplace', help: 'Points at the marketplace.' },
    ],
    fields: [
      text('heading', 'Heading', { maxLength: 160 }),
      textarea('body', 'Supporting copy', { rows: 2, maxLength: 400 }),
      link('primaryCta', 'Primary button'),
      link('secondaryCta', 'Second button', {
        help: 'Leave the label blank for a single button.',
      }),
    ],
    defaults: {
      heading: 'Ready to start?',
      body: '',
      primaryCta: { label: 'Create Free Account', href: '/signup' },
      secondaryCta: { label: '', href: '' },
    },
  },

  {
    key: 'feature-cards',
    label: 'Feature Cards',
    group: 'visual',
    description: 'A row of short points, each with a title and a sentence.',
    animatable: true,
    variants: [
      { key: 'three', label: '3 columns' },
      { key: 'four', label: '4 columns' },
    ],
    fields: [
      text('heading', 'Heading', { maxLength: 160 }),
      textarea('body', 'Supporting copy', { rows: 2, maxLength: 400 }),
      list(
        'items',
        'Cards',
        [text('title', 'Title', { maxLength: 80 }), textarea('body', 'Description', { rows: 3, maxLength: 300 })],
        { itemLabelKey: 'title', minItems: 2, maxItems: 8 },
      ),
    ],
    defaults: { heading: '', body: '', items: [] },
  },

  {
    key: 'faq',
    label: 'FAQ',
    group: 'seo',
    description: 'Questions and answers, with the structured data Google reads.',
    animatable: true,
    variants: [{ key: 'default', label: 'Standard' }],
    fields: [
      text('heading', 'Heading', { maxLength: 160 }),
      list(
        'items',
        'Questions',
        [
          text('question', 'Question', { maxLength: 300 }),
          textarea('answer', 'Answer', { rows: 4, maxLength: 1500 }),
        ],
        { itemLabelKey: 'question', minItems: 1, maxItems: 30 },
      ),
    ],
    defaults: { heading: 'Frequently asked questions', items: [] },
  },

  // ----------------------------------------------------------------- content

  {
    key: 'text-image',
    label: 'Text + Image',
    group: 'content',
    description: 'Copy beside a picture, either way round.',
    animatable: true,
    variants: [
      { key: 'text-left', label: 'Text left' },
      { key: 'text-right', label: 'Text right' },
      { key: 'full-width', label: 'Full width', help: 'Copy only, no picture.' },
    ],
    fields: [
      text('heading', 'Heading', { maxLength: 160 }),
      richtext('body', 'Content', { rows: 10 }),
      image('image', 'Picture'),
    ],
    defaults: { heading: '', body: '', image: { src: '', alt: '' } },
  },

  {
    key: 'two-column',
    label: 'Two Column Content',
    group: 'content',
    description: 'Two columns of copy side by side.',
    animatable: true,
    variants: [{ key: 'default', label: 'Standard' }],
    fields: [
      text('heading', 'Heading', { maxLength: 160 }),
      richtext('left', 'Left column', { rows: 10 }),
      richtext('right', 'Right column', { rows: 10 }),
    ],
    defaults: { heading: '', left: '', right: '' },
  },

  {
    key: 'image',
    label: 'Image',
    group: 'content',
    description: 'A picture on its own, with an optional caption.',
    animatable: true,
    variants: [
      { key: 'default', label: 'Standard' },
      { key: 'wide', label: 'Full width' },
    ],
    fields: [
      image('image', 'Picture'),
      text('caption', 'Caption', { maxLength: 300 }),
      link('link', 'Link to', { help: 'Optional. Makes the picture clickable.' }),
    ],
    defaults: { image: { src: '', alt: '' }, caption: '', link: { label: '', href: '' } },
  },

  {
    key: 'table',
    label: 'Table',
    group: 'content',
    description: 'An editorial table. Scrolls sideways on a phone rather than squashing.',
    animatable: false,
    variants: [{ key: 'default', label: 'Standard' }],
    fields: [
      text('heading', 'Heading', { maxLength: 160 }),
      list('columns', 'Columns', [text('label', 'Heading', { maxLength: 60 })], {
        itemLabelKey: 'label',
        maxItems: 6,
      }),
      list(
        'rows',
        'Rows',
        [
          text('cells', 'Cells', {
            maxLength: 600,
            help: 'One row, cells separated by a vertical bar: Domain | DR | Price',
          }),
        ],
        { itemLabelKey: 'cells', maxItems: 60 },
      ),
    ],
    defaults: { heading: '', columns: [], rows: [] },
  },

  // --------------------------------------------------------------- marketplace

  {
    key: 'marketplace-preview',
    label: 'Marketplace Preview',
    group: 'marketplace',
    description: 'Copy beside a redacted table of real listings.',
    animatable: true,
    variants: [{ key: 'default', label: 'Standard' }],
    fields: [
      text('heading', 'Heading', { maxLength: 160 }),
      textarea('body', 'Supporting copy', { rows: 3, maxLength: 600 }),
      link('cta', 'Button'),
      text('note', 'Line under the button', { maxLength: 200 }),
    ],
    defaults: {
      heading: 'See what a placement actually costs',
      body: '',
      cta: { label: 'Unlock the Marketplace', href: '/marketplace' },
      note: 'Create a free account to browse publishers and pricing.',
    },
  },

  {
    key: 'marketplace-stats',
    label: 'Marketplace Stats',
    group: 'marketplace',
    description: 'Live counts: websites, niches, countries. Counted, never typed.',
    animatable: true,
    variants: [{ key: 'default', label: 'Standard' }],
    fields: [
      text('heading', 'Heading', { maxLength: 160 }),
      text('websitesLabel', 'Label for the website count', { maxLength: 40 }),
      text('nichesLabel', 'Label for the niche count', { maxLength: 40 }),
      text('countriesLabel', 'Label for the country count', { maxLength: 40 }),
    ],
    defaults: {
      heading: 'Trusted by SEO professionals, agencies and brands',
      websitesLabel: 'Websites',
      nichesLabel: 'Niches',
      countriesLabel: 'Countries',
    },
  },

  {
    key: 'niche-categories',
    label: 'Niche Categories',
    group: 'marketplace',
    description: 'Cards for each niche, with live counts. Empty niches are left out.',
    animatable: true,
    variants: [{ key: 'default', label: 'Standard' }],
    fields: [
      text('heading', 'Heading', { maxLength: 160 }),
      textarea('body', 'Supporting copy', { rows: 2, maxLength: 400 }),
      link('cta', 'Link beside the heading'),
    ],
    defaults: {
      heading: 'Link building opportunities in every industry',
      body: '',
      cta: { label: 'View all niches', href: '/marketplace' },
    },
  },

  {
    key: 'marketplace-search',
    label: 'Marketplace Search',
    group: 'marketplace',
    description: 'A search box that takes the visitor to the marketplace.',
    animatable: true,
    variants: [{ key: 'default', label: 'Standard' }],
    fields: [
      text('heading', 'Heading', { maxLength: 160 }),
      textarea('body', 'Supporting copy', { rows: 2, maxLength: 400 }),
      text('placeholder', 'Placeholder', { maxLength: 120 }),
      link('cta', 'Button'),
      text('note', 'Line under the box', { maxLength: 200 }),
    ],
    defaults: {
      heading: 'Find link building opportunities',
      body: '',
      placeholder: 'Search publishers by domain, topic or country',
      cta: { label: 'Search websites', href: '/marketplace' },
      note: '',
    },
  },

  // -------------------------------------------------------------------- visual

  {
    key: 'stats',
    label: 'Stats',
    group: 'visual',
    description: 'Figures you write yourself, for anything not counted from the database.',
    animatable: true,
    variants: [
      { key: 'default', label: 'On the page' },
      { key: 'panel', label: 'On a panel' },
    ],
    fields: [
      text('heading', 'Heading', { maxLength: 160 }),
      textarea('body', 'Supporting copy', { rows: 2, maxLength: 400 }),
      list(
        'items',
        'Figures',
        [text('value', 'Figure', { maxLength: 20 }), text('label', 'Label', { maxLength: 80 })],
        { itemLabelKey: 'label', minItems: 2, maxItems: 4 },
      ),
    ],
    defaults: { heading: '', body: '', items: [] },
  },

  {
    key: 'checklist',
    label: 'Checklist',
    group: 'visual',
    description: 'A list of ticked points.',
    animatable: true,
    variants: [
      { key: 'default', label: 'On the page' },
      { key: 'panel', label: 'On a panel' },
    ],
    fields: [
      text('heading', 'Heading', { maxLength: 160 }),
      textarea('body', 'Supporting copy', { rows: 2, maxLength: 400 }),
      lineList('items', 'Points'),
    ],
    defaults: { heading: '', body: '', items: [] },
  },

  {
    key: 'comparison',
    label: 'Comparison',
    group: 'visual',
    description: 'Two lists side by side - what to look for, what to avoid.',
    animatable: true,
    variants: [{ key: 'default', label: 'Side by side' }],
    fields: [
      text('heading', 'Heading', { maxLength: 160 }),
      textarea('body', 'Supporting copy', { rows: 2, maxLength: 400 }),
      text('goodTitle', 'Left column heading', { maxLength: 80 }),
      lineList('good', 'Left column points'),
      text('badTitle', 'Right column heading', { maxLength: 80 }),
      lineList('bad', 'Right column points'),
    ],
    defaults: {
      heading: '',
      body: '',
      goodTitle: 'A good opportunity',
      good: [],
      badTitle: 'A site to avoid',
      bad: [],
    },
  },

  {
    key: 'icon-grid',
    label: 'Icon Grid',
    group: 'visual',
    description: 'Short points in a grid, each with a mark beside it.',
    animatable: true,
    variants: [
      { key: 'three', label: '3 columns' },
      { key: 'four', label: '4 columns' },
    ],
    fields: [
      text('heading', 'Heading', { maxLength: 160 }),
      textarea('body', 'Supporting copy', { rows: 2, maxLength: 400 }),
      cardList('Points'),
    ],
    defaults: { heading: '', body: '', items: [] },
  },

  {
    key: 'trust-bar',
    label: 'Trust Bar',
    group: 'visual',
    description: 'A quiet row of names or credentials.',
    animatable: true,
    variants: [{ key: 'default', label: 'Standard' }],
    fields: [
      text('heading', 'Line above', { maxLength: 120 }),
      lineList('items', 'Names', 10),
    ],
    defaults: { heading: 'Trusted by SEO professionals, agencies and brands', items: [] },
  },

  {
    key: 'steps',
    label: 'Steps',
    group: 'visual',
    description: 'A numbered process, across or down.',
    animatable: true,
    variants: [
      { key: 'default', label: 'Across' },
      { key: 'timeline', label: 'Down the page' },
    ],
    fields: [
      text('heading', 'Heading', { maxLength: 160 }),
      textarea('body', 'Supporting copy', { rows: 2, maxLength: 400 }),
      cardList('Steps', 'Step'),
      link('cta', 'Button'),
    ],
    defaults: { heading: '', body: '', items: [], cta: { label: '', href: '' } },
  },

  // ------------------------------------------------------------- press parrot

  {
    key: 'parrot-says',
    label: 'Parrot Says',
    group: 'parrot',
    description: 'A short aside with the mascot, to break up a long read.',
    animatable: true,
    variants: [
      { key: 'default', label: 'Quiet' },
      { key: 'accent', label: 'Accent panel' },
    ],
    fields: [
      text('label', 'Label', { maxLength: 40 }),
      textarea('body', 'What the parrot says', { rows: 3, maxLength: 600 }),
    ],
    defaults: { label: 'Parrot says', body: '' },
  },

  {
    key: 'parrot-checklist',
    label: 'Parrot Checklist',
    group: 'parrot',
    description: 'Selection criteria, with the mascot beside them.',
    animatable: true,
    variants: [{ key: 'default', label: 'Standard' }],
    fields: [
      text('heading', 'Heading', { maxLength: 160 }),
      textarea('body', 'Supporting copy', { rows: 2, maxLength: 400 }),
      lineList('items', 'Points'),
    ],
    defaults: { heading: '', body: '', items: [] },
  },

  {
    key: 'parrot-view',
    label: "Parrot's View",
    group: 'parrot',
    description: 'One live figure on a dark panel, with a line about what it means.',
    animatable: true,
    variants: [{ key: 'default', label: 'Standard' }],
    fields: [
      text('label', 'Label', { maxLength: 40 }),
      textarea('body', 'What the figure means', { rows: 3, maxLength: 400 }),
    ],
    defaults: { label: "Parrot's view", body: '' },
  },

  {
    key: 'parrot-cta',
    label: 'Parrot CTA',
    group: 'parrot',
    description: 'A call to action with the mascot, for the end of an article.',
    animatable: true,
    variants: [{ key: 'default', label: 'Standard' }],
    fields: [
      text('heading', 'Heading', { maxLength: 160 }),
      textarea('body', 'Supporting copy', { rows: 2, maxLength: 400 }),
      link('primaryCta', 'Primary button'),
      link('secondaryCta', 'Second button'),
    ],
    defaults: {
      heading: '',
      body: '',
      primaryCta: { label: 'Browse Websites', href: '/marketplace' },
      secondaryCta: { label: '', href: '' },
    },
  },

  {
    key: 'parrot-flight-path',
    label: 'Parrot Flight Path',
    group: 'parrot',
    description: 'A process with a dotted line through it.',
    animatable: true,
    variants: [{ key: 'default', label: 'Standard' }],
    fields: [
      text('heading', 'Heading', { maxLength: 160 }),
      textarea('body', 'Supporting copy', { rows: 2, maxLength: 400 }),
      cardList('Stages', 'Stage'),
    ],
    defaults: { heading: '', body: '', items: [] },
  },

  // ---------------------------------------------------------------- conversion

  {
    key: 'signup-cta',
    label: 'Signup CTA',
    group: 'conversion',
    description: 'The account call to action. Same layout as the CTA, pointed at signup.',
    animatable: true,
    variants: [
      { key: 'light', label: 'Light' },
      { key: 'dark', label: 'Dark' },
    ],
    fields: [
      text('heading', 'Heading', { maxLength: 160 }),
      textarea('body', 'Supporting copy', { rows: 2, maxLength: 400 }),
      link('primaryCta', 'Primary button'),
      link('secondaryCta', 'Second button'),
    ],
    defaults: {
      heading: 'Create your free account today',
      body: 'Get instant access to thousands of websites and start building high quality backlinks.',
      primaryCta: { label: 'Create Free Account', href: '/signup' },
      secondaryCta: { label: 'Browse Websites', href: '/marketplace' },
    },
  },

  {
    key: 'marketplace-cta',
    label: 'Marketplace CTA',
    group: 'conversion',
    description: 'Points at the marketplace, with the filter already applied.',
    animatable: true,
    variants: [
      { key: 'light', label: 'Light' },
      { key: 'dark', label: 'Dark' },
    ],
    fields: [
      text('heading', 'Heading', { maxLength: 160 }),
      textarea('body', 'Supporting copy', { rows: 2, maxLength: 400 }),
      link('primaryCta', 'Primary button', {
        help: 'Send this to /marketplace?niche=igaming to open with that filter applied.',
      }),
      link('secondaryCta', 'Second button'),
    ],
    defaults: {
      heading: 'Browse the websites',
      body: '',
      primaryCta: { label: 'Browse Websites', href: '/marketplace' },
      secondaryCta: { label: '', href: '' },
    },
  },

  {
    key: 'order-content-cta',
    label: 'Order Content CTA',
    group: 'conversion',
    description: 'For pages about writing rather than about placements.',
    animatable: true,
    variants: [
      { key: 'light', label: 'Light' },
      { key: 'dark', label: 'Dark' },
    ],
    fields: [
      text('heading', 'Heading', { maxLength: 160 }),
      textarea('body', 'Supporting copy', { rows: 2, maxLength: 400 }),
      link('primaryCta', 'Primary button'),
      link('secondaryCta', 'Second button'),
    ],
    defaults: {
      heading: 'Let us write it',
      body: 'Add content writing to the same order and we will produce something the publisher will accept.',
      primaryCta: { label: 'Order Content', href: '/content-writing' },
      secondaryCta: { label: '', href: '' },
    },
  },

  // ---------------------------------------------------------------------- seo

  {
    key: 'expandable',
    label: 'Expandable Content',
    group: 'seo',
    description:
      'An introduction with the rest behind a link. Every word is in the page source, so search engines read all of it.',
    animatable: false,
    variants: [{ key: 'default', label: 'Standard' }],
    fields: [
      text('heading', 'Heading', { maxLength: 160 }),
      richtext('intro', 'Always visible', { rows: 8 }),
      text('label', 'Link label', {
        maxLength: 80,
        help: 'Say what is behind it - "Learn more about buying backlinks" beats "Read more".',
      }),
      richtext('more', 'Behind the link', { rows: 14 }),
    ],
    defaults: { heading: '', intro: '', label: 'Read more', more: '' },
  },

  {
    key: 'related-pages',
    label: 'Related Pages',
    group: 'seo',
    description: 'Cards linking to other pages on the site.',
    animatable: true,
    variants: [{ key: 'default', label: 'Standard' }],
    fields: [
      text('heading', 'Heading', { maxLength: 160 }),
      textarea('body', 'Supporting copy', { rows: 2, maxLength: 400 }),
      list(
        'items',
        'Pages',
        [
          text('label', 'Label', { maxLength: 80 }),
          text('description', 'One line about it', { maxLength: 200 }),
          text('href', 'Path', { maxLength: 200, help: 'An internal path, e.g. /guest-posts' }),
        ],
        { itemLabelKey: 'label', maxItems: 12 },
      ),
    ],
    defaults: { heading: '', body: '', items: [] },
  },

  // -------------------------------------------------------------------- hero

  {
    key: 'hero',
    label: 'Hero',
    group: 'content',
    description: 'The first screen. Holds the page\'s only H1.',
    animatable: false,
    structural: true,
    variants: [
      { key: 'default', label: 'Standard' },
      { key: 'with-count', label: 'With the live website count' },
    ],
    fields: [
      text('eyebrow', 'Eyebrow', { maxLength: 60 }),
      text('heading', 'Headline', { maxLength: 120, help: 'The page\'s H1. There is only one.' }),
      textarea('body', 'Intro paragraph', { rows: 4, maxLength: 500 }),
      link('primaryCta', 'Primary button'),
      link('secondaryCta', 'Second button'),
      lineList('points', 'Reassurance points', 4),
      text('microcopy', 'Small print', { maxLength: 160 }),
      image('image', 'Artwork'),
    ],
    defaults: {
      eyebrow: '',
      heading: '',
      body: '',
      primaryCta: { label: 'Browse Websites', href: '/marketplace' },
      secondaryCta: { label: 'Create Free Account', href: '/signup' },
      points: [],
      microcopy: 'Free account - No subscription - Pay only for what you order',
      image: { src: '', alt: '' },
    },
  },
];

const BY_KEY = new Map(COMPONENTS.map((component) => [component.key, component]));

export function listComponents(): ComponentDef[] {
  return COMPONENTS;
}

/**
 * A component by key, or null.
 *
 * Null rather than a throw on purpose. A row naming a component that was
 * removed in code must render as nothing, not as a five hundred on a live
 * page - the registry is code and the rows are data, and they are deployed
 * at different moments.
 */
export function getComponent(key: string): ComponentDef | null {
  return BY_KEY.get(key) ?? null;
}

/** The variant an editor chose, or the component's first, or 'default'. */
export function resolveVariant(component: ComponentDef | null, variant: string): string {
  if (!component) return 'default';
  const known = component.variants.some((option) => option.key === variant);
  return known ? variant : (component.variants[0]?.key ?? 'default');
}

/**
 * Rebuild a section's values from its component's fields.
 *
 * The same discipline the rich text whitelist applies, generalised: what comes
 * back is built from the schema rather than filtered from the input, so a key
 * the component does not declare cannot survive, whatever was posted. An admin
 * screen is not a reason to trust what arrives at the database - the server
 * action behind it is a public endpoint like any other.
 *
 * Missing fields fall back to the component's defaults, so a component that
 * gains a field renders correctly on sections saved before it existed.
 */
export function cleanSectionValues(component: ComponentDef, raw: unknown): SectionValues {
  const input = isRecord(raw) ? raw : {};
  const out: SectionValues = {};

  for (const field of component.fields) {
    const value = cleanField(field, input[field.key]);
    out[field.key] = value === undefined ? component.defaults[field.key] : value;
  }

  return out;
}

function cleanField(field: FieldDef, raw: unknown): unknown {
  switch (field.type) {
    case 'text':
    case 'textarea':
      return typeof raw === 'string' ? oneLine(raw, field.maxLength ?? 500) : undefined;

    case 'richtext':
      // Either a document from the editor or markdown from shipped copy.
      if (isRichTextDoc(raw)) return cleanRichTextDoc(raw);
      return typeof raw === 'string' ? raw.slice(0, 120_000) : undefined;

    case 'link': {
      if (!isRecord(raw)) return undefined;
      return {
        label: typeof raw.label === 'string' ? oneLine(raw.label, 80) : '',
        href: safeHref(raw.href, field.internalOnly ?? false),
      };
    }

    case 'image': {
      if (!isRecord(raw)) return undefined;
      return {
        src: safeHref(raw.src, false),
        alt: typeof raw.alt === 'string' ? oneLine(raw.alt, 300) : '',
      };
    }

    case 'list':
      return cleanList(field, raw);

    default:
      return undefined;
  }
}

function cleanList(field: ListField, raw: unknown): unknown[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter(isRecord)
    .slice(0, field.maxItems ?? 50)
    .map((entry) => {
      const item: Record<string, unknown> = {};
      for (const sub of field.fields) {
        const value = cleanField(sub, entry[sub.key]);
        if (value !== undefined) item[sub.key] = value;
      }
      return item;
    })
    // A row where every field came back empty is a row somebody started and
    // abandoned, not content.
    .filter((item) => Object.values(item).some((value) => value !== '' && value != null));
}

/** Copy is one line: a heading with a newline in it is a heading typed badly. */
function oneLine(raw: string, max: number): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * An internal path, or an absolute http(s) URL where the field allows one.
 *
 * Never `javascript:` and never `data:`, whatever was posted. The rich text
 * whitelist makes the same check on links inside a document; this is the same
 * rule for links that are fields.
 */
function safeHref(raw: unknown, internalOnly: boolean): string {
  const href = typeof raw === 'string' ? raw.trim() : '';
  if (href.startsWith('/')) return href.slice(0, 500);
  if (!internalOnly && /^https?:\/\//i.test(href)) return href.slice(0, 500);
  return '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
