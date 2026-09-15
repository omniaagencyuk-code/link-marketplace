import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * A deliberately small markdown renderer.
 *
 * Supports exactly what page and blog copy needs: headings, paragraphs, lists,
 * blockquotes, links, bold, italic and inline code. Everything else is treated
 * as literal text.
 *
 * It renders to React elements rather than to an HTML string, which is the
 * whole safety argument: there is no `dangerouslySetInnerHTML` anywhere in the
 * path, so no amount of angle brackets in the source can become markup. That
 * removes the need for a sanitiser and the risk of misconfiguring one.
 *
 * Internal links render through `next/link` so they prefetch and behave like
 * the rest of the site; external links get `rel="noreferrer noopener"`.
 */

type Inline = { text: string; bold?: boolean; italic?: boolean; code?: boolean; href?: string };

/** Split one line into styled runs. Longest markers first so ** beats *. */
function parseInline(source: string): Inline[] {
  const tokens: Inline[] = [];
  let index = 0;
  let buffer = '';

  const flush = () => {
    if (buffer) {
      tokens.push({ text: buffer });
      buffer = '';
    }
  };

  while (index < source.length) {
    const rest = source.slice(index);

    // [label](href)
    const linkMatch = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(rest);
    if (linkMatch) {
      flush();
      tokens.push({ text: linkMatch[1] as string, href: linkMatch[2] as string });
      index += linkMatch[0].length;
      continue;
    }

    const boldMatch = /^\*\*([^*]+)\*\*/.exec(rest);
    if (boldMatch) {
      flush();
      tokens.push({ text: boldMatch[1] as string, bold: true });
      index += boldMatch[0].length;
      continue;
    }

    const italicMatch = /^\*([^*]+)\*/.exec(rest);
    if (italicMatch) {
      flush();
      tokens.push({ text: italicMatch[1] as string, italic: true });
      index += italicMatch[0].length;
      continue;
    }

    const codeMatch = /^`([^`]+)`/.exec(rest);
    if (codeMatch) {
      flush();
      tokens.push({ text: codeMatch[1] as string, code: true });
      index += codeMatch[0].length;
      continue;
    }

    buffer += source[index];
    index += 1;
  }

  flush();
  return tokens;
}

function renderInline(source: string, keyPrefix: string): ReactNode[] {
  return parseInline(source).map((token, tokenIndex) => {
    const key = `${keyPrefix}-${tokenIndex}`;

    if (token.href) {
      const isInternal = token.href.startsWith('/');
      if (isInternal) {
        return (
          <Link key={key} href={token.href} className="text-accent-700 hover:underline">
            {token.text}
          </Link>
        );
      }
      return (
        <a
          key={key}
          href={token.href}
          rel="noreferrer noopener"
          className="text-accent-700 hover:underline"
        >
          {token.text}
        </a>
      );
    }

    if (token.code) {
      return (
        <code key={key} className="rounded bg-surface-sunken px-1 py-0.5 font-mono text-[0.9em]">
          {token.text}
        </code>
      );
    }
    if (token.bold) {
      return (
        <strong key={key} className="font-semibold text-ink">
          {token.text}
        </strong>
      );
    }
    if (token.italic) return <em key={key}>{token.text}</em>;
    return <span key={key}>{token.text}</span>;
  });
}

interface Block {
  kind: 'heading' | 'paragraph' | 'list' | 'ordered' | 'quote';
  level?: 2 | 3 | 4;
  lines: string[];
}

/** Group lines into blocks. Blank lines separate them. */
function parseBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  let current: Block | null = null;

  const push = () => {
    if (current) blocks.push(current);
    current = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (line.trim() === '') {
      push();
      continue;
    }

    const heading = /^(#{2,4})\s+(.*)$/.exec(line);
    if (heading) {
      push();
      blocks.push({
        kind: 'heading',
        level: (heading[1] as string).length as 2 | 3 | 4,
        lines: [heading[2] as string],
      });
      continue;
    }

    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      if (current?.kind !== 'list') {
        push();
        current = { kind: 'list', lines: [] };
      }
      current.lines.push(bullet[1] as string);
      continue;
    }

    const ordered = /^\d+[.)]\s+(.*)$/.exec(line);
    if (ordered) {
      if (current?.kind !== 'ordered') {
        push();
        current = { kind: 'ordered', lines: [] };
      }
      current.lines.push(ordered[1] as string);
      continue;
    }

    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      if (current?.kind !== 'quote') {
        push();
        current = { kind: 'quote', lines: [] };
      }
      current.lines.push(quote[1] as string);
      continue;
    }

    if (current?.kind !== 'paragraph') {
      push();
      current = { kind: 'paragraph', lines: [] };
    }
    current.lines.push(line);
  }

  push();
  return blocks;
}

/**
 * Render markdown as React nodes.
 *
 * `variant` picks the type scale: "body" for page copy, "article" for the
 * longer measure used by blog posts.
 */
export function Markdown({
  source,
  variant = 'body',
}: {
  source: string;
  variant?: 'body' | 'article';
}) {
  if (!source?.trim()) return null;

  const blocks = parseBlocks(source);
  const paragraph =
    variant === 'article'
      ? 'text-[16px] leading-[1.75] text-ink-soft'
      : 'text-[15px] leading-relaxed text-muted';

  return (
    <>
      {blocks.map((block, blockIndex) => {
        const key = `block-${blockIndex}`;

        switch (block.kind) {
          case 'heading': {
            const content = renderInline(block.lines[0] as string, key);
            if (block.level === 2) {
              return (
                <h2
                  key={key}
                  className="mt-10 mb-4 text-[1.375rem] font-semibold tracking-tight text-ink first:mt-0 sm:text-2xl"
                >
                  {content}
                </h2>
              );
            }
            if (block.level === 3) {
              return (
                <h3
                  key={key}
                  className="mt-8 mb-3 text-[1.125rem] font-semibold tracking-tight text-ink first:mt-0"
                >
                  {content}
                </h3>
              );
            }
            return (
              <h4 key={key} className="mt-6 mb-2 text-[15px] font-semibold text-ink first:mt-0">
                {content}
              </h4>
            );
          }

          case 'list':
            return (
              <ul key={key} className="mt-4 mb-4 space-y-2 pl-5">
                {block.lines.map((line, lineIndex) => (
                  <li key={`${key}-${lineIndex}`} className={`list-disc ${paragraph}`}>
                    {renderInline(line, `${key}-${lineIndex}`)}
                  </li>
                ))}
              </ul>
            );

          case 'ordered':
            return (
              <ol key={key} className="mt-4 mb-4 space-y-2 pl-5">
                {block.lines.map((line, lineIndex) => (
                  <li key={`${key}-${lineIndex}`} className={`list-decimal ${paragraph}`}>
                    {renderInline(line, `${key}-${lineIndex}`)}
                  </li>
                ))}
              </ol>
            );

          case 'quote':
            return (
              <blockquote
                key={key}
                className="my-6 border-l-2 border-accent-500/60 pl-4 text-[15px] leading-relaxed text-ink-soft italic"
              >
                {renderInline(block.lines.join(' '), key)}
              </blockquote>
            );

          default:
            return (
              <p key={key} className={`mt-4 first:mt-0 ${paragraph}`}>
                {renderInline(block.lines.join(' '), key)}
              </p>
            );
        }
      })}
    </>
  );
}

/** Plain text of some markdown, for meta descriptions and excerpts. */
export function markdownToPlainText(source: string, maxLength = 200): string {
  const text = source
    .replace(/\r\n/g, '\n')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[-*>]\s+/gm, '')
    .replace(/^\d+[.)]\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).replace(/\s+\S*$/, '')}...`;
}

/** Rough reading time, for blog post headers. */
export function readingTime(source: string): string {
  const words = markdownToPlainText(source, Number.MAX_SAFE_INTEGER).split(/\s+/).filter(Boolean);
  return `${Math.max(1, Math.round(words.length / 225))} min read`;
}
