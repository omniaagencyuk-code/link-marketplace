import { isRichTextDoc, isRichTextEmpty, type RichTextDoc, type RichTextNode } from './rich-text';
import type {
  FieldDef,
  FieldValue,
  ImageValue,
  LinkValue,
  PageDef,
  PageValues,
  ResolvedContent,
} from './types';

/**
 * Merging saved overrides onto shipped defaults.
 *
 * Two rules make this safe:
 *
 * 1. An override only wins when it has the right *shape*. A saved string never
 *    replaces a list, so a schema change cannot break a live page.
 * 2. An empty value falls back to the default rather than rendering a blank.
 *    Clearing a field in the editor therefore means "restore the original",
 *    which is what an editor expects and what stops a page losing its heading
 *    because someone selected-all and deleted.
 */

/** The default value declared for one field. */
function defaultFor(field: FieldDef, defaults: Record<string, FieldValue>): FieldValue {
  const value = defaults[field.key];
  if (value !== undefined) return value;

  // A field with no declared default still has to render something.
  switch (field.type) {
    case 'link':
      return { label: '', href: '/' };
    case 'image':
      return { src: '', alt: '' };
    case 'list':
      return [];
    default:
      return '';
  }
}

function isLinkValue(value: unknown): value is LinkValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as LinkValue).href === 'string' &&
    typeof (value as LinkValue).label === 'string'
  );
}

function isImageValue(value: unknown): value is ImageValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ImageValue).src === 'string'
  );
}

/** Does a saved value match the shape the field expects? */
function shapeMatches(field: FieldDef, value: unknown): boolean {
  switch (field.type) {
    case 'text':
    case 'textarea':
      return typeof value === 'string';
    // Either format is valid: markdown from code, a document from the editor.
    case 'richtext':
      return typeof value === 'string' || isRichTextDoc(value);
    case 'link':
      return isLinkValue(value);
    case 'image':
      return isImageValue(value);
    case 'list':
      return Array.isArray(value);
    default:
      return false;
  }
}

/** Is a saved value empty enough that the default should win? */
function isEmpty(field: FieldDef, value: unknown): boolean {
  switch (field.type) {
    case 'text':
    case 'textarea':
      return typeof value !== 'string' || value.trim() === '';
    case 'richtext':
      if (isRichTextDoc(value)) return isRichTextEmpty(value);
      return typeof value !== 'string' || value.trim() === '';
    case 'link':
      return !isLinkValue(value) || value.label.trim() === '';
    case 'image':
      return !isImageValue(value) || value.src.trim() === '';
    case 'list':
      return !Array.isArray(value) || value.length === 0;
    default:
      return true;
  }
}

function resolveField(
  field: FieldDef,
  defaults: Record<string, FieldValue>,
  overrides: Record<string, FieldValue> | undefined,
): FieldValue {
  const fallback = defaultFor(field, defaults);
  const override = overrides?.[field.key];

  if (override === undefined) return fallback;
  if (!shapeMatches(field, override)) return fallback;
  if (isEmpty(field, override)) return fallback;

  // A list's entries are plain records; trust the saved rows but drop any that
  // are not objects, so one malformed row cannot break the whole section.
  if (field.type === 'list' && Array.isArray(override)) {
    const rows = override.filter(
      (row): row is Record<string, string | LinkValue | ImageValue> =>
        typeof row === 'object' && row !== null && !Array.isArray(row),
    );
    return rows.length > 0 ? rows : fallback;
  }

  return override;
}

/**
 * Resolve a page's content for rendering.
 *
 * `defaults` is the shipped copy, keyed the same way as the definition.
 */
export function resolvePage(
  definition: PageDef,
  defaults: PageValues,
  overrides: PageValues | undefined,
): ResolvedContent {
  const values: PageValues = {};

  for (const sectionDef of definition.sections) {
    const sectionDefaults = defaults[sectionDef.key] ?? {};
    const sectionOverrides = overrides?.[sectionDef.key];
    const resolved: Record<string, FieldValue> = {};

    for (const field of sectionDef.fields) {
      resolved[field.key] = resolveField(field, sectionDefaults, sectionOverrides);
    }

    values[sectionDef.key] = resolved;
  }

  return {
    slug: definition.slug,
    values,
    edited: Boolean(overrides && Object.keys(overrides).length > 0),
  };
}

/**
 * Live figures an editor may quote inside copy.
 *
 * The alternative is an editor typing "247 gambling websites" into a sentence
 * and it being wrong by the following week. A token is resolved at render
 * time from the same data the page already has, so the number cannot drift
 * from the marketplace, and the editor still controls the sentence around it.
 *
 * Substitution happens in the accessors, which means every component that
 * reads content gets it without knowing about it.
 */
export type ContentTokens = Record<string, string | number>;

const TOKEN_PATTERN = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;

/**
 * Unknown tokens are removed rather than printed.
 *
 * A visitor should never see `{{gambling_site_count}}` on a live page. The
 * editor lists the tokens a page actually supports, so a typo is visible
 * where it can be fixed rather than where it embarrasses.
 */
function substitute(text: string, tokens: ContentTokens): string {
  if (!text.includes('{{')) return text;
  return text
    .replace(TOKEN_PATTERN, (_match, name: string) => {
      const value = tokens[name.toLowerCase()];
      return value === undefined ? '' : String(value);
    })
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** Walks any field value, substituting inside every string it holds. */
function applyTokens(value: FieldValue | undefined, tokens: ContentTokens): FieldValue | undefined {
  if (value === undefined || Object.keys(tokens).length === 0) return value;

  if (typeof value === 'string') return substitute(value, tokens);

  if (isRichTextDoc(value)) {
    const walk = (nodes: RichTextNode[]): RichTextNode[] =>
      nodes.map((node) => ({
        ...node,
        ...(node.text ? { text: substitute(node.text, tokens) } : {}),
        ...(node.content ? { content: walk(node.content) } : {}),
      }));
    return { type: 'doc', content: walk(value.content) };
  }

  if (Array.isArray(value)) {
    return value.map((row) => {
      const next: Record<string, string | LinkValue | ImageValue | RichTextDoc> = {};
      for (const [key, entry] of Object.entries(row)) {
        next[key] = applyTokens(entry, tokens) as string | LinkValue | ImageValue | RichTextDoc;
      }
      return next;
    });
  }

  if (isLinkValue(value)) return { ...value, label: substitute(value.label, tokens) };
  if (isImageValue(value)) return value;
  return value;
}

/**
 * Typed accessors over resolved content.
 *
 * Components call `content.text('hero', 'title')` rather than indexing into a
 * nested record, so a typo surfaces as an empty string in one place instead of
 * a runtime crash halfway down the page.
 */
export function contentAccessors(resolved: ResolvedContent, tokens: ContentTokens = {}) {
  const read = (sectionKey: string, fieldKey: string): FieldValue | undefined =>
    applyTokens(resolved.values[sectionKey]?.[fieldKey], tokens);

  return {
    text(sectionKey: string, fieldKey: string): string {
      const value = read(sectionKey, fieldKey);
      return typeof value === 'string' ? value : '';
    },
    /** Editorial copy: markdown from code, or a document from the editor. */
    richText(sectionKey: string, fieldKey: string): string | RichTextDoc {
      const value = read(sectionKey, fieldKey);
      if (isRichTextDoc(value)) return value;
      return typeof value === 'string' ? value : '';
    },
    link(sectionKey: string, fieldKey: string): LinkValue {
      const value = read(sectionKey, fieldKey);
      return isLinkValue(value) ? value : { label: '', href: '/' };
    },
    image(sectionKey: string, fieldKey: string): ImageValue {
      const value = read(sectionKey, fieldKey);
      return isImageValue(value) ? value : { src: '', alt: '' };
    },
    list<T extends Record<string, unknown>>(sectionKey: string, fieldKey: string): T[] {
      const value = read(sectionKey, fieldKey);
      return Array.isArray(value) ? (value as unknown as T[]) : [];
    },
  };
}

export type ContentAccessors = ReturnType<typeof contentAccessors>;
