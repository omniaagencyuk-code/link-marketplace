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

import { link, list, richtext, text, textarea } from '../fields';
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
  The starter set.

  Four components, chosen to exercise every part of the mechanism rather than
  to be a library: a rich text block with variants, a call to action with
  links, a card list with a repeatable group, and an accordion whose entries
  become structured data. The rest of the library is phase 5 - adding one is
  an entry here and a component in `render.tsx`, with no change to the CMS.
*/
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
