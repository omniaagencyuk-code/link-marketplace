import Link from 'next/link';
import type { ReactNode } from 'react';
import { Markdown } from './markdown';
import { isRichTextDoc, type RichTextDoc, type RichTextNode } from './rich-text';

/**
 * Rich text on the page.
 *
 * Deliberately emits the same elements and the same classes as the markdown
 * renderer beside it. That is what makes the editor safe to introduce: a
 * section that switches from a markdown string to an edited document renders
 * identically, because both paths end at the same type scale, and neither
 * path can produce a style attribute, a class name or an element the design
 * system does not already define.
 *
 * Everything the editor can produce is listed in `rich-text.ts`. Anything
 * else has already been dropped before it reaches here, so an unrecognised
 * node renders as nothing rather than as an escape hatch.
 */

export type RichTextValue = string | RichTextDoc;

/**
 * Either format, rendered the same way.
 *
 * Copy shipped in code is markdown. Copy saved by an editor is a document.
 * Components should not have to care which they were handed.
 */
export function RichText({
  source,
  variant = 'body',
}: {
  source: RichTextValue | undefined | null;
  variant?: 'body' | 'article';
}) {
  if (!source) return null;
  if (typeof source === 'string') return <Markdown source={source} variant={variant} />;
  if (!isRichTextDoc(source)) return null;
  return <RichTextDocument doc={source} variant={variant} />;
}

export function RichTextDocument({
  doc,
  variant = 'body',
}: {
  doc: RichTextDoc;
  variant?: 'body' | 'article';
}) {
  const paragraph =
    variant === 'article'
      ? 'text-[16px] leading-[1.75] text-ink-soft'
      : 'text-[15px] leading-relaxed text-muted';

  return <>{doc.content.map((node, index) => renderNode(node, `n-${index}`, paragraph))}</>;
}

function renderChildren(nodes: RichTextNode[] | undefined, key: string, paragraph: string) {
  return (nodes ?? []).map((child, index) => renderNode(child, `${key}-${index}`, paragraph));
}

function renderNode(node: RichTextNode, key: string, paragraph: string): ReactNode {
  switch (node.type) {
    case 'text':
      return renderText(node, key);

    case 'hardBreak':
      return <br key={key} />;

    case 'heading': {
      const level = Number(node.attrs?.level) || 2;
      const children = renderChildren(node.content, key, paragraph);
      if (level === 2) {
        return (
          <h2
            key={key}
            className="mt-10 mb-4 text-[1.375rem] font-semibold tracking-tight text-ink first:mt-0 sm:text-2xl"
          >
            {children}
          </h2>
        );
      }
      if (level === 3) {
        return (
          <h3
            key={key}
            className="mt-8 mb-3 text-[1.125rem] font-semibold tracking-tight text-ink first:mt-0"
          >
            {children}
          </h3>
        );
      }
      return (
        <h4 key={key} className="mt-6 mb-2 text-[15px] font-semibold text-ink first:mt-0">
          {children}
        </h4>
      );
    }

    case 'bulletList':
      return (
        <ul key={key} className="mt-4 mb-4 space-y-2 pl-5">
          {(node.content ?? []).map((item, index) => (
            <li key={`${key}-${index}`} className={`list-disc ${paragraph}`}>
              {renderListItem(item, `${key}-${index}`, paragraph)}
            </li>
          ))}
        </ul>
      );

    case 'orderedList':
      return (
        <ol key={key} className="mt-4 mb-4 space-y-2 pl-5">
          {(node.content ?? []).map((item, index) => (
            <li key={`${key}-${index}`} className={`list-decimal ${paragraph}`}>
              {renderListItem(item, `${key}-${index}`, paragraph)}
            </li>
          ))}
        </ol>
      );

    case 'blockquote':
      return (
        <blockquote
          key={key}
          className="my-6 border-l-2 border-accent-500/60 pl-4 text-[15px] leading-relaxed text-ink-soft italic"
        >
          {renderChildren(node.content, key, paragraph)}
        </blockquote>
      );

    case 'image': {
      const src = typeof node.attrs?.src === 'string' ? node.attrs.src : '';
      const alt = typeof node.attrs?.alt === 'string' ? node.attrs.alt : '';
      const title = typeof node.attrs?.title === 'string' ? node.attrs.title : '';
      if (!src) return null;
      return (
        <figure key={key} className="my-6">
          {/* eslint-disable-next-line @next/next/no-img-element --
              editor-supplied, including external hosts the optimiser refuses.
              Sized by the container, so it cannot break the content column. */}
          <img
            src={src}
            alt={alt}
            loading="lazy"
            className="h-auto w-full rounded-[var(--radius-card)] border border-line"
          />
          {title ? (
            <figcaption className="mt-2 text-[13px] text-muted">{title}</figcaption>
          ) : null}
        </figure>
      );
    }

    case 'table':
      return (
        <div key={key} className="my-6 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <tbody className="divide-y divide-line">
              {renderChildren(node.content, key, paragraph)}
            </tbody>
          </table>
        </div>
      );

    case 'tableRow':
      return <tr key={key}>{renderChildren(node.content, key, paragraph)}</tr>;

    case 'tableHeader':
      return (
        <th
          key={key}
          colSpan={numeric(node.attrs?.colspan)}
          rowSpan={numeric(node.attrs?.rowspan)}
          className="border-b border-line bg-surface/70 px-3 py-2 text-left text-[13px] font-semibold text-ink"
        >
          {renderChildren(node.content, key, paragraph)}
        </th>
      );

    case 'tableCell':
      return (
        <td
          key={key}
          colSpan={numeric(node.attrs?.colspan)}
          rowSpan={numeric(node.attrs?.rowspan)}
          className="px-3 py-2 align-top text-[14px] leading-relaxed text-ink-soft"
        >
          {renderChildren(node.content, key, paragraph)}
        </td>
      );

    case 'paragraph':
    default: {
      const children = renderChildren(node.content, key, paragraph);
      if (children.length === 0) return null;
      return (
        <p key={key} className={`mt-4 first:mt-0 ${paragraph}`}>
          {children}
        </p>
      );
    }
  }
}

/**
 * A list item's paragraphs are unwrapped.
 *
 * The editor wraps every list item's text in a paragraph; rendering that
 * paragraph inside the `<li>` would add its top margin and space the list out
 * differently from the markdown one. Unwrapping keeps the two identical.
 */
function renderListItem(item: RichTextNode, key: string, paragraph: string): ReactNode {
  if (item.type !== 'listItem') return renderNode(item, key, paragraph);

  return (item.content ?? []).map((child, index) => {
    if (child.type === 'paragraph') {
      return <span key={`${key}-${index}`}>{renderChildren(child.content, `${key}-${index}`, paragraph)}</span>;
    }
    return renderNode(child, `${key}-${index}`, paragraph);
  });
}

function renderText(node: RichTextNode, key: string): ReactNode {
  const text = node.text ?? '';
  if (!text) return null;

  const link = node.marks?.find((mark) => mark.type === 'link');
  const bold = node.marks?.some((mark) => mark.type === 'bold');
  const italic = node.marks?.some((mark) => mark.type === 'italic');
  const code = node.marks?.some((mark) => mark.type === 'code');

  let content: ReactNode = text;
  if (code) {
    content = (
      <code className="rounded bg-surface-sunken px-1 py-0.5 font-mono text-[0.9em]">{content}</code>
    );
  }
  if (bold) content = <strong className="font-semibold text-ink">{content}</strong>;
  if (italic) content = <em>{content}</em>;

  if (link?.attrs?.href) {
    const href = link.attrs.href;
    const internal = href.startsWith('/') || href.startsWith('#');
    return internal ? (
      <Link key={key} href={href} className="text-accent-700 hover:underline">
        {content}
      </Link>
    ) : (
      <a key={key} href={href} rel="noreferrer noopener" className="text-accent-700 hover:underline">
        {content}
      </a>
    );
  }

  return <span key={key}>{content}</span>;
}

function numeric(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 1 ? parsed : undefined;
}
