import type {
  FieldDef,
  ImageField,
  ImageValue,
  LinkField,
  LinkValue,
  ListField,
  RichTextField,
  SectionDef,
  TextField,
  TextareaField,
} from './types';

/**
 * Declaration helpers.
 *
 * A page definition reads as a description of what an editor can change, so
 * these keep the noise down. Each returns a plain object - there is no magic
 * and no runtime behaviour beyond shaping the literal.
 */

export function text(key: string, label: string, options: Omit<TextField, 'key' | 'label' | 'type'> = {}): TextField {
  return { type: 'text', key, label, ...options };
}

export function textarea(
  key: string,
  label: string,
  options: Omit<TextareaField, 'key' | 'label' | 'type'> = {},
): TextareaField {
  return { type: 'textarea', key, label, rows: 3, ...options };
}

export function richtext(
  key: string,
  label: string,
  options: Omit<RichTextField, 'key' | 'label' | 'type'> = {},
): RichTextField {
  return { type: 'richtext', key, label, rows: 8, ...options };
}

export function link(key: string, label: string, options: Omit<LinkField, 'key' | 'label' | 'type'> = {}): LinkField {
  return { type: 'link', key, label, internalOnly: true, ...options };
}

export function image(key: string, label: string, options: Omit<ImageField, 'key' | 'label' | 'type'> = {}): ImageField {
  return { type: 'image', key, label, ...options };
}

export function list(
  key: string,
  label: string,
  fields: Exclude<FieldDef, ListField>[],
  options: Omit<ListField, 'key' | 'label' | 'type' | 'fields'> = {},
): ListField {
  return { type: 'list', key, label, fields, ...options };
}

export function section(
  key: string,
  label: string,
  fields: FieldDef[],
  description?: string,
): SectionDef {
  return { key, label, fields, description };
}

/** Shorthand for building a link default. */
export function linkValue(label: string, href: string): LinkValue {
  return { label, href };
}

/** Shorthand for building an image default. */
export function imageValue(src: string, alt: string): ImageValue {
  return { src, alt };
}
