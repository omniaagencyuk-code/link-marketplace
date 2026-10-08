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
import {
  BACKGROUND_DEFS,
  readStyle,
  safeAccent,
  safeTextTone,
  type SectionStyle,
} from '../style';
import type { FieldDef, ListField } from '../types';
import type { SectionValues } from '../sections';

/** Where a component appears in the "add section" library. */
export type ComponentGroup =
  | 'content'
  | 'marketplace'
  | 'visual'
  | 'parrot'
  | 'conversion'
  | 'seo'
  | 'niche';

export const GROUP_LABELS: Record<ComponentGroup, string> = {
  content: 'Content',
  marketplace: 'Marketplace',
  visual: 'Visual',
  parrot: 'Press Parrot',
  conversion: 'Conversion',
  seo: 'SEO',
  niche: 'Niche landing page',
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
  /**
   * Which of the palette's controls this component offers.
   *
   * Absent means the sensible default: the soft washes and a decoration, no
   * accent, no artwork placement. A component says more than that only when
   * it can genuinely carry more.
   */
  styling?: ComponentStyling;
}

export interface ComponentStyling {
  /**
   * `soft` is the seven washes. `full` adds navy and the two brand colours,
   * and is only given to bands of short copy with no white cards inside them
   * - a white card on a navy band inherits the band's white text and becomes
   * unreadable, which is a combination the editor should not be able to
   * reach rather than one they have to learn to avoid.
   *
   * `none` means the component's own background, always.
   */
  backgrounds?: 'none' | 'soft' | 'full';
  /**
   * True where the component draws something in the brand accent that is
   * worth recolouring - a highlighted word, an icon chip, a tick. Never a
   * button: a button recoloured to yellow is a button nobody can read.
   */
  accent?: boolean;
  /** True where the component draws artwork whose side and size can move. */
  artwork?: boolean;
  /** False where a decoration behind the content would be clutter. */
  decoration?: boolean;
}

/** What a component offers, with the defaults filled in. */
export function stylingFor(component: ComponentDef | null): Required<ComponentStyling> {
  return {
    backgrounds: component?.styling?.backgrounds ?? 'soft',
    accent: component?.styling?.accent ?? false,
    artwork: component?.styling?.artwork ?? false,
    decoration: component?.styling?.decoration ?? true,
  };
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

/** The same, for the components that store the line under `label`. */
const lineList2 = (key: string, label: string, max = 20) =>
  list(key, label, [text('label', 'Line', { maxLength: 200 })], { itemLabelKey: 'label', maxItems: max });
const COMPONENTS: ComponentDef[] = [
  {
    key: 'rich-text',
    label: 'Rich Text',
    group: 'content',
    description: 'Headings, paragraphs, lists, links, images and tables.',
    animatable: false,
    styling: { backgrounds: 'full' },
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
    styling: { backgrounds: 'full' },
    variants: [
      { key: 'light', label: 'Light', help: 'On the page background.' },
      { key: 'dark', label: 'Dark', help: 'Navy band across the page.' },
      { key: 'panel', label: 'Green panel', help: 'A dark card inside the page, with foliage.' },
      { key: 'marketplace', label: 'Marketplace', help: 'Points at the marketplace.' },
    ],
    fields: [
      text('heading', 'Heading', { maxLength: 160 }),
      textarea('body', 'Supporting copy', { rows: 2, maxLength: 400 }),
      link('primaryCta', 'Primary button'),
      link('secondaryCta', 'Second button', {
        help: 'Leave the label blank for a single button.',
      }),
      text('annotation', 'Handwritten note', {
        maxLength: 40,
        help: 'Shown on the green panel only.',
      }),
    ],
    defaults: {
      heading: 'Ready to start?',
      body: '',
      primaryCta: { label: 'Create Free Account', href: '/signup' },
      secondaryCta: { label: '', href: '' },
      annotation: '',
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
    variants: [
      { key: 'default', label: 'Standard', help: 'Tighter measure.' },
      { key: 'wide', label: 'Wide, white', help: 'What the niche pages use.' },
      { key: 'wide-muted', label: 'Wide, on the page background', help: 'What the homepage uses.' },
    ],
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
    label: 'Browse by Niche',
    group: 'marketplace',
    description: 'A card per niche with its live count, linking into the marketplace.',
    animatable: true,
    variants: [
      { key: 'cards', label: 'Icon cards', help: 'Five across, with a mark per niche.' },
      { key: 'list', label: 'Plain rows', help: 'Three across, name and count only.' },
    ],
    fields: [
      text('eyebrow', 'Eyebrow', { maxLength: 60 }),
      text('heading', 'Heading', { maxLength: 160 }),
      textarea('body', 'Supporting copy', { rows: 2, maxLength: 400 }),
      list(
        'items',
        'Which niches',
        [
          text('slug', 'Category slug', {
            maxLength: 40,
            help: 'e.g. igaming, sports, finance. See Categories in the admin for the list.',
          }),
        ],
        {
          itemLabelKey: 'slug',
          maxItems: 12,
          help:
            'Named here, they appear in this order, including any with nothing listed yet - the card still links to a real marketplace filter. Leave the list empty to show whatever is busiest.',
        },
      ),
      link('cta', 'Link beside the heading'),
    ],
    defaults: {
      eyebrow: 'Every industry',
      heading: 'Link building opportunities in every industry',
      body: '',
      items: [],
      cta: { label: 'See the whole marketplace', href: '/marketplace' },
    },
  },

  {
    key: 'marketplace-search',
    label: 'Marketplace Search',
    group: 'marketplace',
    description: 'A search box that takes the visitor to the marketplace.',
    animatable: true,
    styling: { backgrounds: 'full' },
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
    styling: { backgrounds: 'full', accent: true },
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
    styling: { accent: true },
    variants: [
      { key: 'default', label: 'Across' },
      { key: 'flight-path', label: 'Flight path', help: 'Across, with the curve drawn between them.' },
      { key: 'timeline', label: 'Down the page' },
    ],
    fields: [
      text('eyebrow', 'Eyebrow', { maxLength: 60 }),
      text('heading', 'Heading', { maxLength: 160 }),
      textarea('body', 'Supporting copy', { rows: 2, maxLength: 400 }),
      list(
        'items',
        'Steps',
        [
          text('number', 'Number', {
            maxLength: 4,
            help: 'Left blank, the steps number themselves.',
          }),
          text('title', 'Title', { maxLength: 80 }),
          textarea('body', 'Description', { rows: 3, maxLength: 300 }),
        ],
        { itemLabelKey: 'title', minItems: 1, maxItems: 8 },
      ),
      link('cta', 'Button'),
    ],
    defaults: { eyebrow: '', heading: '', body: '', items: [], cta: { label: '', href: '' } },
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
    styling: { backgrounds: 'full' },
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



  // ------------------------------------------------------------------ pages
  //
  // The bands the homepage is made of, registered rather than hardcoded. They
  // are deliberately not called "homepage sections": a trust row, a
  // marketplace demonstration, a set of service cards and an editorial column
  // are what the next paid landing page is assembled from too.
  //
  // None of them has a field for a figure. Every number on them is counted on
  // the render that draws it.

  {
    key: 'home-hero',
    label: 'Marketplace Hero',
    group: 'content',
    description: 'Three-line headline, two buttons, and live counts floating over the mascot.',
    animatable: false,
    structural: true,
    styling: { accent: true, decoration: false },
    variants: [{ key: 'default', label: 'Standard' }],
    fields: [
      text('eyebrow', 'Eyebrow', { maxLength: 80 }),
      text('titleLine1', 'Headline, first line', { maxLength: 60 }),
      text('titleLine2', 'Headline, second line', { maxLength: 60 }),
      text('titleAccent', 'Headline, highlighted line', {
        maxLength: 60,
        help: 'Rendered in Press Parrot green.',
      }),
      textarea('intro', 'Intro paragraph', { rows: 4, maxLength: 400 }),
      link('primaryCta', 'Primary button'),
      link('secondaryCta', 'Second button'),
      list('reassurance', 'Ticks under the buttons', [text('label', 'Text', { maxLength: 60 })], {
        itemLabelKey: 'label',
        maxItems: 4,
      }),
      text('annotation', 'Handwritten note', {
        maxLength: 60,
        help: 'The scribble beside the parrot. Two lines are allowed.',
      }),
      text('cardWebsites', 'First card label', {
        maxLength: 40,
        help: 'The figure beside it is counted from the marketplace, not typed here.',
      }),
      text('cardNiches', 'Second card label', { maxLength: 40 }),
      text('cardCountries', 'Third card label', { maxLength: 40 }),
      image('image', 'Mascot artwork', {
        help: 'Leave blank to use the shipped Press Parrot mascot.',
      }),
    ],
    defaults: {
      eyebrow: 'The link building marketplace',
      titleLine1: 'Real Websites.',
      titleLine2: 'Real Traffic.',
      titleAccent: 'Better Rankings.',
      intro: '',
      primaryCta: { label: 'Create Free Account', href: '/signup' },
      secondaryCta: { label: 'See How It Works', href: '/how-it-works' },
      reassurance: [],
      annotation: '',
      cardWebsites: 'Websites listed',
      cardNiches: 'Niches covered',
      cardCountries: 'Countries',
      image: { src: '', alt: '' },
    },
  },

  {
    key: 'trust-stats',
    label: 'Trust Numbers',
    group: 'marketplace',
    description: 'A row of figures. The first three are counted; anything else is typed.',
    animatable: true,
    styling: { backgrounds: 'full' },
    variants: [{ key: 'default', label: 'Standard' }],
    fields: [
      text('websitesLabel', 'Label for the website count', { maxLength: 40 }),
      text('nichesLabel', 'Label for the niche count', { maxLength: 40 }),
      text('countriesLabel', 'Label for the country count', { maxLength: 40 }),
      list(
        'items',
        'Extra figures',
        [text('value', 'Value', { maxLength: 24 }), text('label', 'Label', { maxLength: 40 })],
        {
          itemLabelKey: 'label',
          maxItems: 2,
          help:
            'For anything the marketplace cannot count, such as turnaround. Only claim numbers you can stand behind - these are typed, so nothing keeps them true.',
        },
      ),
    ],
    defaults: {
      websitesLabel: 'Websites in the marketplace',
      nichesLabel: 'Niches and industries',
      countriesLabel: 'Countries',
      items: [],
    },
  },

  {
    key: 'testimonials',
    label: 'Customer Quotes',
    group: 'visual',
    description: 'Real, attributable quotes. Renders nothing while it holds none.',
    animatable: true,
    variants: [{ key: 'default', label: 'Standard' }],
    fields: [
      text('eyebrow', 'Eyebrow', { maxLength: 60 }),
      text('heading', 'Heading', { maxLength: 160 }),
      textarea('body', 'Supporting copy', { rows: 2, maxLength: 400 }),
      list(
        'items',
        'Quotes',
        [
          textarea('quote', 'What they said', { rows: 4, maxLength: 600 }),
          text('name', 'Name', { maxLength: 60 }),
          text('role', 'Role', { maxLength: 60 }),
          text('company', 'Company', { maxLength: 60 }),
          text('rating', 'Rating out of 5', {
            maxLength: 1,
            help: 'Only if they actually gave one. Leave blank otherwise.',
          }),
          image('avatar', 'Photo or logo'),
        ],
        {
          itemLabelKey: 'name',
          maxItems: 9,
          help:
            'Only quotes somebody really gave, with permission to publish them. An invented testimonial is a lie on the page a stranger judges the business by, and this section renders nothing while it is empty.',
        },
      ),
    ],
    defaults: {
      eyebrow: 'Trusted by SEOs and agencies',
      heading: 'What our customers say',
      body: '',
      items: [],
    },
  },

  {
    key: 'marketplace-demo',
    label: 'Marketplace Demo',
    group: 'marketplace',
    description: 'The redacted listings table, with the reason to register beside it.',
    animatable: true,
    variants: [
      { key: 'unlock', label: 'Unlock panel', help: 'Table first, signup benefits beside it.' },
      { key: 'metrics', label: 'Filters and totals', help: 'The argument beside the table.' },
    ],
    fields: [
      text('eyebrow', 'Eyebrow', { maxLength: 60 }),
      text('heading', 'Heading', { maxLength: 160 }),
      textarea('body', 'Supporting copy', { rows: 4, maxLength: 500 }),
      text('unlockHeading', 'Heading on the signup panel', { maxLength: 120 }),
      lineList('benefits', 'What an account gets you', 6),
      link('cta', 'Primary button'),
      link('secondaryCta', 'Link under the button'),
      text('ctaCaption', 'Caption under the button', {
        maxLength: 120,
        help: 'Shown on the filters layout only.',
      }),
    ],
    defaults: {
      eyebrow: 'The marketplace',
      heading: 'Thousands of real websites at your fingertips',
      body: '',
      unlockHeading: 'Create a free account to unlock the marketplace',
      benefits: [],
      cta: { label: 'Create Free Account', href: '/signup' },
      secondaryCta: { label: 'Or browse niches first', href: '/marketplace' },
      ctaCaption: '',
    },
  },

  {
    key: 'old-vs-new',
    label: 'Old Way vs Press Parrot',
    group: 'visual',
    description: 'Copy beside two lists: doing it yourself, and doing it here.',
    animatable: true,
    variants: [{ key: 'default', label: 'Standard' }],
    fields: [
      text('heading', 'Heading', { maxLength: 160 }),
      richtext('body', 'Supporting copy', { rows: 6 }),
      text('annotation', 'Handwritten note', { maxLength: 40 }),
      link('cta', 'Button'),
      text('oldHeading', 'Left column heading', { maxLength: 40 }),
      lineList2('oldWay', 'Doing it yourself', 12),
      text('newHeading', 'Right column heading', { maxLength: 40 }),
      lineList2('newWay', 'With Press Parrot', 12),
    ],
    defaults: {
      heading: '',
      body: '',
      annotation: '',
      cta: { label: 'Browse Websites', href: '/marketplace' },
      oldHeading: 'On your own',
      oldWay: [],
      newHeading: 'With Press Parrot',
      newWay: [],
    },
  },

  {
    key: 'service-cards',
    label: 'Service Cards',
    group: 'content',
    description: 'What you sell, each card linking to the page that explains it.',
    animatable: true,
    variants: [{ key: 'default', label: 'Standard' }],
    fields: [
      text('heading', 'Heading', { maxLength: 160 }),
      textarea('intro', 'Intro', { rows: 3, maxLength: 300 }),
      list(
        'items',
        'Cards',
        [
          text('title', 'Title', { maxLength: 40 }),
          textarea('body', 'Description', { rows: 3, maxLength: 240 }),
          link('cta', 'Link'),
        ],
        { itemLabelKey: 'title', maxItems: 4 },
      ),
    ],
    defaults: { heading: '', intro: '', items: [] },
  },

  {
    key: 'feature-list',
    label: 'Platform Features',
    group: 'visual',
    description: 'What the platform does, four across, with a Coming soon badge.',
    animatable: true,
    variants: [{ key: 'default', label: 'Standard' }],
    fields: [
      text('heading', 'Heading', { maxLength: 160 }),
      textarea('intro', 'Intro', { rows: 3, maxLength: 300 }),
      list(
        'items',
        'Features',
        [
          text('title', 'Title', { maxLength: 40 }),
          textarea('body', 'Description', { rows: 3, maxLength: 240 }),
          text('comingSoon', 'Coming soon?', {
            maxLength: 3,
            help: 'Type "yes" to show a Coming soon badge. Never list something as built when it is not.',
          }),
        ],
        { itemLabelKey: 'title', maxItems: 12 },
      ),
    ],
    defaults: { heading: '', intro: '', items: [] },
  },

  {
    key: 'agency-panel',
    label: 'Audience Panel',
    group: 'conversion',
    description: 'A panel aimed at one audience: copy and buttons beside a grid of points.',
    animatable: true,
    variants: [{ key: 'default', label: 'Standard' }],
    fields: [
      text('eyebrow', 'Eyebrow', { maxLength: 60 }),
      text('heading', 'Heading', { maxLength: 160 }),
      textarea('body', 'Supporting copy', { rows: 4, maxLength: 500 }),
      link('primaryCta', 'Primary button'),
      link('secondaryCta', 'Second button'),
      lineList2('items', 'Points', 8),
    ],
    defaults: {
      eyebrow: '',
      heading: '',
      body: '',
      primaryCta: { label: 'Create Free Account', href: '/signup' },
      secondaryCta: { label: 'Browse Websites', href: '/marketplace' },
      items: [],
    },
  },

  {
    key: 'editorial',
    label: 'Editorial Column',
    group: 'seo',
    description: 'Long-form copy with its own contents list and an anchor per article.',
    animatable: false,
    variants: [{ key: 'default', label: 'Standard' }],
    fields: [
      text('eyebrow', 'Eyebrow', { maxLength: 60 }),
      text('heading', 'Heading', { maxLength: 160 }),
      list(
        'articles',
        'Articles',
        [
          text('id', 'Anchor id', {
            maxLength: 60,
            help: 'Used for the contents links, e.g. what-is-link-building. Lowercase, hyphens only.',
          }),
          text('heading', 'Heading', { maxLength: 120 }),
          richtext('content', 'Content', {
            rows: 8,
            help: 'Internal links here are worth getting right - they are read as much as the copy.',
          }),
        ],
        { itemLabelKey: 'heading', maxItems: 12 },
      ),
    ],
    defaults: { eyebrow: '', heading: '', articles: [] },
  },

  {
    key: 'metric-cards',
    label: 'Metric Cards',
    group: 'seo',
    description: 'What each metric measures, each card linking to where it is explained.',
    animatable: true,
    variants: [{ key: 'default', label: 'Standard' }],
    fields: [
      text('heading', 'Heading', { maxLength: 160 }),
      textarea('body', 'Supporting copy', { rows: 3, maxLength: 400 }),
      list(
        'items',
        'Metrics',
        [
          text('title', 'Name', { maxLength: 60 }),
          textarea('body', 'One or two lines', { rows: 2, maxLength: 240 }),
          text('href', 'Link', {
            maxLength: 160,
            help: 'An anchor on the metrics page, e.g. /link-building-metrics#organic-traffic',
          }),
        ],
        { itemLabelKey: 'title', maxItems: 6 },
      ),
      link('cta', 'Link under the cards'),
    ],
    defaults: {
      heading: '',
      body: '',
      items: [],
      cta: { label: 'Learn more about metrics', href: '/link-building-metrics' },
    },
  },

  // --------------------------------------------------------------- niche pages
  //
  // The blocks a niche landing page is made of. They exist because the
  // gambling page was a hand-written template, and converting it into generic
  // text boxes would have thrown the design away to gain the ordering. These
  // are that design, registered - so the page can be reordered, hidden and
  // added to without being redrawn.
  //
  // Notice what none of them has a field for: the marketplace category. That
  // is page-level configuration, set once in the page's settings, so a section
  // never has to be told which niche it is on.

  {
    key: 'niche-hero',
    label: 'Niche Hero',
    group: 'niche',
    description: 'The first screen of a landing page: headline, buttons, mascot or banner.',
    animatable: false,
    structural: true,
    styling: { accent: true, decoration: false },
    variants: [{ key: 'default', label: 'Standard' }],
    fields: [
      text('eyebrow', 'Eyebrow', { maxLength: 60 }),
      text('heading', 'Headline', { maxLength: 120, help: 'The page\'s H1. There is only one.' }),
      textarea('intro', 'Intro paragraph', { rows: 4, maxLength: 500 }),
      list('trust', 'Trust indicators', [text('label', 'Label', { maxLength: 40 })], {
        itemLabelKey: 'label',
        maxItems: 4,
      }),
      link('primaryCta', 'Primary button'),
      link('secondaryCta', 'Second button'),
      text('microcopy', 'Reassurance line', { maxLength: 160 }),
      image('mascot', 'Mascot artwork', {
        help: 'Beside the headline on phones and tablets, and on desktop when there is no banner.',
      }),
      image('banner', 'Hero banner', {
        help:
          'Wide artwork behind the whole first screen on desktop, replacing the mascot there. ' +
          'About 2000x700 with the subject on the right, because the headline sits over the left half.',
      }),
    ],
    defaults: {
      eyebrow: '',
      heading: '',
      intro: '',
      trust: [],
      primaryCta: { label: 'Browse Websites', href: '/marketplace' },
      secondaryCta: { label: 'Create Free Account', href: '/signup' },
      microcopy: 'Free account - No subscription - Pay only for what you order',
      mascot: { src: '', alt: '' },
      banner: { src: '', alt: '' },
    },
  },

  {
    key: 'niche-preview',
    label: 'Niche Marketplace Preview',
    group: 'niche',
    description: 'Live count and redacted listings for this page\'s category.',
    animatable: true,
    variants: [{ key: 'default', label: 'Standard' }],
    fields: [
      text('heading', 'Heading', { maxLength: 160 }),
      text('countSuffix', 'Wording after the live count', {
        maxLength: 60,
        help: 'The number itself is counted from the marketplace and cannot be edited here.',
      }),
      textarea('body', 'Supporting copy', { rows: 3, maxLength: 600 }),
      text('lockNote', 'Line above the button', { maxLength: 200 }),
      link('cta', 'Button'),
    ],
    defaults: {
      heading: 'See what a placement actually costs',
      countSuffix: 'websites listed right now',
      body: '',
      lockNote: 'Website names and prices are shown to members.',
      cta: { label: 'Unlock the Marketplace', href: '/marketplace' },
    },
  },

  {
    key: 'topic-pills',
    label: 'Publisher Coverage',
    group: 'niche',
    description: 'A row of shortcuts into the marketplace, each one a real search.',
    animatable: true,
    styling: { accent: true },
    variants: [{ key: 'default', label: 'Standard' }],
    fields: [
      text('heading', 'Heading', { maxLength: 160 }),
      textarea('body', 'Supporting copy', { rows: 2, maxLength: 400 }),
      list(
        'items',
        'Shortcuts',
        [
          text('label', 'Label', { maxLength: 40 }),
          text('href', 'Marketplace link', {
            maxLength: 200,
            help: 'A real marketplace query, e.g. /marketplace?niche=igaming&q=casino',
          }),
        ],
        { itemLabelKey: 'label', maxItems: 12 },
      ),
    ],
    defaults: { heading: 'What publishers cover', body: '', items: [] },
  },

  {
    key: 'benefit-cards',
    label: 'Why Press Parrot',
    group: 'visual',
    description: 'Cards with a mark, a claim and a sentence. Artwork beside them, optionally.',
    animatable: true,
    styling: { accent: true, artwork: true },
    variants: [
      { key: 'default', label: 'Across' },
      { key: 'with-art', label: 'With artwork', help: 'Two by two, with a picture beside them.' },
    ],
    fields: [
      text('eyebrow', 'Eyebrow', { maxLength: 60 }),
      text('heading', 'Heading', { maxLength: 160 }),
      textarea('body', 'Supporting copy', { rows: 2, maxLength: 400 }),
      cardList('Points'),
      image('image', 'Artwork', { help: 'Shown on the "with artwork" layout only.' }),
    ],
    defaults: {
      eyebrow: '',
      heading: 'Why Press Parrot',
      body: '',
      items: [],
      image: { src: '', alt: '' },
    },
  },

  {
    key: 'journey-steps',
    label: 'How It Works',
    group: 'niche',
    description: 'The shared four-step journey. The steps come from the site, not the page.',
    animatable: true,
    styling: { accent: true },
    variants: [{ key: 'default', label: 'Standard' }],
    fields: [
      text('heading', 'Heading', {
        maxLength: 160,
        help: 'The steps themselves are shared across the site, so this page cannot contradict it.',
      }),
    ],
    defaults: { heading: 'How it works' },
  },

  {
    key: 'article-body',
    label: 'Article Body',
    group: 'niche',
    description: 'The editorial body, with related links in a sticky sidebar.',
    animatable: false,
    variants: [
      { key: 'default', label: 'With sidebar' },
      { key: 'full-width', label: 'No sidebar' },
    ],
    fields: [
      list(
        'sections',
        'Content sections',
        [text('heading', 'Heading', { maxLength: 120 }), richtext('content', 'Content', { rows: 10 })],
        { itemLabelKey: 'heading', maxItems: 12 },
      ),
      text('relatedHeading', 'Sidebar heading', { maxLength: 40 }),
      list(
        'related',
        'Related links',
        [
          text('label', 'Label', { maxLength: 60 }),
          text('href', 'Path', { maxLength: 200 }),
          text('description', 'One line about it', { maxLength: 200 }),
        ],
        { itemLabelKey: 'label', maxItems: 8 },
      ),
    ],
    defaults: { sections: [], relatedHeading: 'Related', related: [] },
  },

  {
    key: 'content-upsell',
    label: 'Content Upsell',
    group: 'niche',
    description: 'A small band with the mascot, pointing at content ordering.',
    animatable: true,
    styling: { artwork: true },
    variants: [{ key: 'default', label: 'Standard' }],
    fields: [
      text('heading', 'Heading', { maxLength: 160 }),
      textarea('body', 'Supporting copy', { rows: 3, maxLength: 400 }),
      link('cta', 'Button'),
      image('mascot', 'Mascot artwork'),
    ],
    defaults: {
      heading: 'Need the article written too?',
      body: '',
      cta: { label: 'Order Content', href: '/content-writing' },
      mascot: { src: '', alt: '' },
    },
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
      image('image', 'Artwork', {
        help: 'Beside the headline. On desktop a hero banner replaces it, and this is what phones keep.',
      }),
      image('banner', 'Hero banner', {
        help:
          'Wide artwork behind the whole first screen on desktop, replacing the artwork there. ' +
          'About 2000x700 with the subject on the right, because the headline sits over the left half.',
      }),
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
      banner: { src: '', alt: '' },
    },
  },
];

const BY_KEY = new Map(COMPONENTS.map((component) => [component.key, component]));

/**
 * Which components have a repeating group for "Stagger the items" to stagger.
 *
 * A separate list rather than a field on every component, because it is about
 * the markup a renderer emits rather than about what the section means - and
 * the schema must not import the renderer, which is what keeps the admin's
 * bundle off a public page. verify:sections imports both and checks they
 * agree, the same arrangement `animatable` already has.
 *
 * It exists because the editor was offering the setting to everything that
 * could animate at all. Stagger works by delaying each child of a group the
 * component marks with `data-reveal-items`; a component that marks no group
 * has nothing to delay, so the entrance quietly collapsed into a plain fade.
 * Eighteen of the thirty-eight animatable components were in that position,
 * `marketplace-demo` among them - and nothing anywhere said so.
 */
const STAGGERS = new Set([
  'feature-cards', 'marketplace-stats', 'niche-categories', 'stats', 'checklist',
  'icon-grid', 'trust-bar', 'steps', 'parrot-checklist', 'parrot-flight-path',
  'related-pages', 'trust-stats', 'testimonials', 'service-cards', 'feature-list',
  'agency-panel', 'metric-cards', 'topic-pills', 'benefit-cards', 'journey-steps',
]);

/** Whether "Stagger the items" would do anything on this component. */
export function staggers(key: string): boolean {
  return STAGGERS.has(key);
}

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

/**
 * A section's look, rebuilt from what its component actually offers.
 *
 * Built rather than filtered, for the reason `cleanSectionValues` is: a
 * server action is a public endpoint and the form in front of it is a
 * courtesy. A background the component does not offer, a text colour that
 * fails contrast over it, an accent on a component with nothing to accent -
 * none survives the trip, whatever was posted.
 *
 * The conversion blueprints go through it too, so there is one rule about
 * what a component may look like and nothing is exempt from it.
 */
export function cleanSectionStyle(component: ComponentDef | null, raw: unknown): SectionStyle {
  const styling = stylingFor(component);
  const posted = readStyle(raw);

  const allowed = BACKGROUND_DEFS.filter((entry) =>
    styling.backgrounds === 'none'
      ? entry.key === 'default'
      : styling.backgrounds === 'full'
        ? true
        : !entry.strong,
  );

  const background = allowed.some((entry) => entry.key === posted.background)
    ? posted.background
    : 'default';

  const style: SectionStyle = {
    ...posted,
    background,
    decoration: styling.decoration ? posted.decoration : 'none',
    accent: styling.accent ? posted.accent : 'none',
  };

  // Contrast, checked against the background that survived rather than the
  // one that was posted.
  return { ...style, text: safeTextTone(style), accent: safeAccent(style) };
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
