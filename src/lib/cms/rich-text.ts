/**
 * Rich text, stored as a document rather than as markup.
 *
 * Three formats were possible and the choice matters more than it looks:
 *
 * - HTML would let an editor paste a `<div style>` and take the page's design
 *   away from the code that owns it, and would need sanitising on the way in
 *   and the way out.
 * - Markdown is what the shipped copy is written in and stays supported, but
 *   it cannot express a table or an image caption without extending a parser
 *   towards being an HTML parser again.
 * - A node document - what the editor already works in - is a fixed set of
 *   node types with no styling attached. The renderer decides what a heading
 *   looks like, which is the whole point of this exercise.
 *
 * So a rich text field holds either a markdown string (everything shipped in
 * code, and anything saved before the editor existed) or one of these
 * documents. Both render through `RichText`, which is why no migration was
 * needed and why a default in code is still just a string.
 *
 * Nothing here trusts its input. `cleanRichTextDoc` rebuilds a document from
 * a whitelist - unknown node types, unknown marks and unknown attributes are
 * dropped rather than stored - so a crafted save cannot put anything into a
 * page that the renderer does not already know how to draw.
 */

export type RichTextMarkType = 'bold' | 'italic' | 'code' | 'link';

export interface RichTextMark {
  type: RichTextMarkType;
  attrs?: { href?: string; target?: string | null };
}

export type RichTextNodeType =
  | 'doc'
  | 'paragraph'
  | 'heading'
  | 'bulletList'
  | 'orderedList'
  | 'listItem'
  | 'blockquote'
  | 'image'
  | 'table'
  | 'tableRow'
  | 'tableHeader'
  | 'tableCell'
  | 'hardBreak'
  | 'text';

export interface RichTextNode {
  type: RichTextNodeType;
  text?: string;
  marks?: RichTextMark[];
  attrs?: Record<string, unknown>;
  content?: RichTextNode[];
}

export interface RichTextDoc {
  type: 'doc';
  content: RichTextNode[];
}

/** Editors may only reach for these. The toolbar offers exactly this set. */
const ALLOWED_NODES: ReadonlySet<string> = new Set<RichTextNodeType>([
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'listItem',
  'blockquote',
  'image',
  'table',
  'tableRow',
  'tableHeader',
  'tableCell',
  'hardBreak',
  'text',
]);

const ALLOWED_MARKS: ReadonlySet<string> = new Set<RichTextMarkType>([
  'bold',
  'italic',
  'code',
  'link',
]);

/** Matches the page copy scale: h2 down to h4, never h1 - the page owns that. */
const HEADING_LEVELS = [2, 3, 4];

export function isRichTextDoc(value: unknown): value is RichTextDoc {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as RichTextDoc).type === 'doc' &&
    Array.isArray((value as RichTextDoc).content)
  );
}

/** Internal paths and safe schemes only - never `javascript:` or `data:`. */
function safeHref(raw: unknown): string | null {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return null;
  if (value.startsWith('/') && !value.startsWith('//')) return value.slice(0, 300);
  if (value.startsWith('#')) return value.slice(0, 120);
  if (/^https?:\/\//i.test(value) || /^mailto:/i.test(value) || /^tel:/i.test(value)) {
    return value.slice(0, 500);
  }
  return null;
}

function safeSrc(raw: unknown): string | null {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return null;
  if (value.startsWith('/') && !value.startsWith('//')) return value.slice(0, 500);
  if (/^https?:\/\//i.test(value)) return value.slice(0, 500);
  return null;
}

function cleanMarks(raw: unknown): RichTextMark[] | undefined {
  if (!Array.isArray(raw)) return undefined;

  const marks: RichTextMark[] = [];
  for (const entry of raw.slice(0, 6)) {
    const type = (entry as RichTextMark)?.type;
    if (typeof type !== 'string' || !ALLOWED_MARKS.has(type)) continue;

    if (type === 'link') {
      const href = safeHref((entry as RichTextMark).attrs?.href);
      // A link with nowhere safe to go becomes plain text rather than a
      // dangling anchor.
      if (!href) continue;
      marks.push({ type: 'link', attrs: { href } });
      continue;
    }
    marks.push({ type: type as RichTextMarkType });
  }
  return marks.length ? marks : undefined;
}

/** Strips control characters without touching the newlines copy depends on. */
function cleanText(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, 10_000);
}

function cleanNode(raw: unknown, depth: number): RichTextNode | null {
  if (depth > 8 || typeof raw !== 'object' || raw === null) return null;

  const node = raw as RichTextNode;
  const type = node.type;
  if (typeof type !== 'string' || !ALLOWED_NODES.has(type)) return null;

  if (type === 'text') {
    const text = cleanText(node.text);
    if (!text) return null;
    return { type: 'text', text, ...(cleanMarks(node.marks) ? { marks: cleanMarks(node.marks) } : {}) };
  }

  if (type === 'hardBreak') return { type: 'hardBreak' };

  if (type === 'image') {
    const src = safeSrc(node.attrs?.src);
    if (!src) return null;
    return {
      type: 'image',
      attrs: {
        src,
        alt: cleanText(node.attrs?.alt).slice(0, 300),
        title: cleanText(node.attrs?.title).slice(0, 300),
      },
    };
  }

  const content = Array.isArray(node.content)
    ? (node.content
        .slice(0, 200)
        .map((child) => cleanNode(child, depth + 1))
        .filter(Boolean) as RichTextNode[])
    : [];

  if (type === 'heading') {
    const level = Number(node.attrs?.level);
    return {
      type: 'heading',
      attrs: { level: HEADING_LEVELS.includes(level) ? level : 2 },
      content,
    };
  }

  if (type === 'tableHeader' || type === 'tableCell') {
    const colspan = Number(node.attrs?.colspan);
    const rowspan = Number(node.attrs?.rowspan);
    return {
      type,
      attrs: {
        colspan: Number.isFinite(colspan) && colspan > 1 ? Math.min(colspan, 20) : 1,
        rowspan: Number.isFinite(rowspan) && rowspan > 1 ? Math.min(rowspan, 20) : 1,
      },
      content,
    };
  }

  // An empty container carries nothing and renders as a gap, so it goes -
  // except a paragraph, which is how an editor leaves deliberate space.
  if (content.length === 0 && type !== 'paragraph') return null;

  return { type, content };
}

/** Rebuild a document from the whitelist. Anything unrecognised is dropped. */
export function cleanRichTextDoc(raw: unknown): RichTextDoc {
  if (!isRichTextDoc(raw)) return { type: 'doc', content: [] };

  const content = raw.content
    .slice(0, 400)
    .map((node) => cleanNode(node, 0))
    .filter(Boolean) as RichTextNode[];

  return { type: 'doc', content };
}

/** True when a document has nothing an editor would call content. */
export function isRichTextEmpty(doc: RichTextDoc): boolean {
  return richTextToPlainText(doc, 1).length === 0;
}

/** Plain text, for meta descriptions, excerpts and the "is this empty" test. */
export function richTextToPlainText(doc: RichTextDoc, maxLength = 200): string {
  const parts: string[] = [];

  const walk = (nodes: RichTextNode[] | undefined) => {
    for (const node of nodes ?? []) {
      if (node.type === 'text' && node.text) parts.push(node.text);
      if (node.type === 'image' && typeof node.attrs?.alt === 'string') continue;
      walk(node.content);
      // Block boundaries become spaces so words do not run together.
      if (node.type !== 'text') parts.push(' ');
    }
  };

  walk(doc.content);
  const text = parts.join('').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).replace(/\s+\S*$/, '')}...`;
}
