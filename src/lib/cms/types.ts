/**
 * Editable page content.
 *
 * The model is deliberately "content, not layout": a page declares the fields
 * an editor may change, and the design around them stays as built. That keeps
 * every page looking like the thing it was designed to be, however the copy
 * changes.
 *
 * Defaults live in code beside the declaration, so a page always renders
 * correctly with an empty database. Saved values are overrides layered on top
 * - never a replacement - which means an editor can always reset back to the
 * shipped copy, and a newly added field appears with sensible text rather than
 * as a blank hole in the page.
 */

export type FieldType = 'text' | 'textarea' | 'richtext' | 'link' | 'image' | 'list';

interface BaseField {
  /** Unique within its section. Used as the storage key. */
  key: string;
  label: string;
  /** Shown under the input in the admin editor. */
  help?: string;
}

export interface TextField extends BaseField {
  type: 'text';
  /** Soft cap, enforced in the editor and on save. */
  maxLength?: number;
}

export interface TextareaField extends BaseField {
  type: 'textarea';
  rows?: number;
  maxLength?: number;
}

/** Markdown. Rendered through a restricted renderer - see `render-markdown`. */
export interface RichTextField extends BaseField {
  type: 'richtext';
  rows?: number;
  maxLength?: number;
}

export interface LinkField extends BaseField {
  type: 'link';
  /** Internal paths only, so editors cannot point a CTA off-site by accident. */
  internalOnly?: boolean;
}

export interface ImageField extends BaseField {
  type: 'image';
}

/** A repeatable group, e.g. the four service cards or the FAQ list. */
export interface ListField extends BaseField {
  type: 'list';
  /** Shape of one entry. */
  fields: Exclude<FieldDef, ListField>[];
  /** Label template for a collapsed row, e.g. "title". */
  itemLabelKey?: string;
  minItems?: number;
  maxItems?: number;
}

export type FieldDef =
  | TextField
  | TextareaField
  | RichTextField
  | LinkField
  | ImageField
  | ListField;

export interface LinkValue {
  label: string;
  href: string;
}

export interface ImageValue {
  src: string;
  /** Required for anything meaningful; empty means decorative. */
  alt: string;
}

export type FieldValue =
  | string
  | LinkValue
  | ImageValue
  | Record<string, string | LinkValue | ImageValue>[];

/** One group of fields in the editor, matching a visual section of the page. */
export interface SectionDef {
  key: string;
  label: string;
  description?: string;
  fields: FieldDef[];
}

export interface PageDef {
  /** Storage key and admin URL segment, e.g. "link-building". */
  slug: string;
  /** Shown in the admin page list. */
  label: string;
  /** The live URL, so the editor can link straight to it. */
  path: string;
  /** One line describing what the page is for. */
  description: string;
  sections: SectionDef[];
  /** Page metadata is editable too - it is the highest-leverage copy on site. */
  seo?: { title: string; description: string };
}

/** Values for one page: `{ [sectionKey]: { [fieldKey]: value } }`. */
export type PageValues = Record<string, Record<string, FieldValue>>;

/** A page's saved overrides, as stored. */
export interface PageContentRecord {
  slug: string;
  values: PageValues;
  seo?: { title?: string; description?: string };
  updatedAt: string;
  updatedBy?: string;
}

/**
 * Defaults plus overrides, ready to render.
 *
 * `get` is the accessor components use. It always returns something, because
 * the default is guaranteed to exist.
 */
export interface ResolvedContent {
  slug: string;
  values: PageValues;
  /** True when an editor has saved something for this page. */
  edited: boolean;
}
