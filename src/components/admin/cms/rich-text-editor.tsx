'use client';

import { useEffect, useMemo, useState } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';
import {
  Bold,
  Code,
  Image as ImageIcon,
  Italic,
  Link2,
  Link2Off,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Table as TableIcon,
  Undo2,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { cleanRichTextDoc, isRichTextDoc, type RichTextDoc } from '@/lib/cms/rich-text';

/**
 * The editorial editor.
 *
 * Deliberately a short toolbar. Everything on it maps to a node the page
 * renderer already knows how to draw, and nothing on it sets a colour, a
 * size, an alignment or a font - those belong to the design system, and an
 * editor reaching for them is the failure this whole arrangement exists to
 * prevent. There is no "clear formatting" button because there is no
 * formatting to clear.
 *
 * Headings start at H2. The page owns its H1, and a second one would be a
 * genuine SEO fault rather than a matter of taste.
 *
 * What comes out is a document, cleaned through the same whitelist the server
 * applies on save, so what the editor sees is what the page will get.
 */

const HEADINGS = [
  { level: 0, label: 'Paragraph' },
  { level: 2, label: 'Heading 2' },
  { level: 3, label: 'Heading 3' },
  { level: 4, label: 'Heading 4' },
];

export function RichTextEditor({
  value,
  onChange,
  rows = 10,
  id,
}: {
  /** Markdown from the shipped copy, or a document from a previous edit. */
  value: string | RichTextDoc;
  onChange: (value: RichTextDoc) => void;
  rows?: number;
  id?: string;
}) {
  const [linkOpen, setLinkOpen] = useState(false);

  // Markdown that has never been edited is converted once, on the way in.
  const initial = useMemo(() => (isRichTextDoc(value) ? value : markdownToDoc(value)), [value]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        // The page's own rules: no H1, no horizontal rules, no code blocks.
        horizontalRule: false,
        codeBlock: false,
        link: false,
      }),
      Link.configure({ openOnClick: false, autolink: false, protocols: ['http', 'https', 'mailto', 'tel'] }),
      Image.configure({ inline: false, allowBase64: false }),
      TableKit.configure({ table: { resizable: false } }),
    ],
    content: initial,
    editorProps: {
      attributes: {
        // The prose styles here are the *editor's* approximation, not the
        // page's. The page renders through `RichText`, which owns the real
        // type scale - this only has to be legible while typing.
        class: 'cms-prose focus:outline-none',
        ...(id ? { id } : {}),
      },
    },
    onUpdate({ editor: instance }) {
      onChange(cleanRichTextDoc(instance.getJSON()));
    },
  });

  // A reset (or a switch to another page) replaces the value from outside.
  useEffect(() => {
    if (!editor) return;
    const current = cleanRichTextDoc(editor.getJSON());
    if (JSON.stringify(current) === JSON.stringify(cleanRichTextDoc(initial))) return;
    editor.commands.setContent(initial, { emitUpdate: false });
  }, [editor, initial]);

  if (!editor) {
    return (
      <div
        className="rounded-md border border-line-strong bg-white px-3 py-2 text-sm text-muted"
        style={{ minHeight: rows * 24 }}
      >
        Loading editor...
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-line-strong bg-white focus-within:border-accent-500 focus-within:ring-2 focus-within:ring-accent-500/20">
      <div className="flex flex-wrap items-center gap-1 border-b border-line bg-surface/70 px-2 py-1.5">
        <select
          aria-label="Text style"
          value={currentHeading(editor)}
          onChange={(event) => {
            const level = Number(event.target.value);
            if (level === 0) editor.chain().focus().setParagraph().run();
            else editor.chain().focus().toggleHeading({ level: level as 2 | 3 | 4 }).run();
          }}
          className="h-7 rounded border border-line-strong bg-white px-1.5 text-[12px] text-ink"
        >
          {HEADINGS.map((heading) => (
            <option key={heading.level} value={heading.level}>
              {heading.label}
            </option>
          ))}
        </select>

        <Divider />

        <ToolButton
          label="Bold"
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="h-3.5 w-3.5" aria-hidden="true" />
        </ToolButton>
        <ToolButton
          label="Italic"
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="h-3.5 w-3.5" aria-hidden="true" />
        </ToolButton>
        <ToolButton
          label="Inline code"
          active={editor.isActive('code')}
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          <Code className="h-3.5 w-3.5" aria-hidden="true" />
        </ToolButton>

        <Divider />

        <ToolButton
          label="Bulleted list"
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="h-3.5 w-3.5" aria-hidden="true" />
        </ToolButton>
        <ToolButton
          label="Numbered list"
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="h-3.5 w-3.5" aria-hidden="true" />
        </ToolButton>
        <ToolButton
          label="Quote"
          active={editor.isActive('blockquote')}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote className="h-3.5 w-3.5" aria-hidden="true" />
        </ToolButton>

        <Divider />

        <ToolButton
          label="Link"
          active={editor.isActive('link')}
          onClick={() => setLinkOpen((open) => !open)}
        >
          <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
        </ToolButton>
        {editor.isActive('link') ? (
          <ToolButton
            label="Remove link"
            onClick={() => editor.chain().focus().unsetLink().run()}
          >
            <Link2Off className="h-3.5 w-3.5" aria-hidden="true" />
          </ToolButton>
        ) : null}
        <ToolButton label="Image" onClick={() => insertImage(editor)}>
          <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
        </ToolButton>
        <ToolButton
          label="Table"
          onClick={() =>
            editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
          }
        >
          <TableIcon className="h-3.5 w-3.5" aria-hidden="true" />
        </ToolButton>

        <div className="ml-auto flex items-center gap-1">
          <ToolButton
            label="Undo"
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
          >
            <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
          </ToolButton>
          <ToolButton
            label="Redo"
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
          >
            <Redo2 className="h-3.5 w-3.5" aria-hidden="true" />
          </ToolButton>
        </div>
      </div>

      {linkOpen ? (
        <LinkBar
          initial={editor.getAttributes('link').href ?? ''}
          onCancel={() => setLinkOpen(false)}
          onApply={(href) => {
            setLinkOpen(false);
            if (!href) {
              editor.chain().focus().unsetLink().run();
              return;
            }
            editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
          }}
        />
      ) : null}

      {editor.isActive('table') ? <TableBar editor={editor} /> : null}

      <EditorContent editor={editor} style={{ minHeight: rows * 24 }} className="px-3 py-2" />
    </div>
  );
}

function currentHeading(editor: Editor): number {
  for (const level of [2, 3, 4]) {
    if (editor.isActive('heading', { level })) return level;
  }
  return 0;
}

function insertImage(editor: Editor) {
  const src = window.prompt('Image path or URL', '/images/');
  if (!src) return;
  const alt = window.prompt('Describe the image for screen readers', '') ?? '';
  editor.chain().focus().setImage({ src, alt }).run();
}

/** Row and column controls, only while the caret is in a table. */
function TableBar({ editor }: { editor: Editor }) {
  const actions: { label: string; run: () => void }[] = [
    { label: 'Row above', run: () => editor.chain().focus().addRowBefore().run() },
    { label: 'Row below', run: () => editor.chain().focus().addRowAfter().run() },
    { label: 'Delete row', run: () => editor.chain().focus().deleteRow().run() },
    { label: 'Column left', run: () => editor.chain().focus().addColumnBefore().run() },
    { label: 'Column right', run: () => editor.chain().focus().addColumnAfter().run() },
    { label: 'Delete column', run: () => editor.chain().focus().deleteColumn().run() },
    { label: 'Delete table', run: () => editor.chain().focus().deleteTable().run() },
  ];

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-line bg-white px-2 py-1.5">
      <span className="mr-1 text-[11px] font-medium text-muted">Table</span>
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          onClick={action.run}
          className="rounded border border-line-strong px-1.5 py-0.5 text-[11px] text-ink-soft hover:border-accent-500 hover:text-accent-700"
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}

function LinkBar({
  initial,
  onApply,
  onCancel,
}: {
  initial: string;
  onApply: (href: string) => void;
  onCancel: () => void;
}) {
  const [href, setHref] = useState(initial);

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line bg-white px-2 py-1.5">
      <input
        autoFocus
        value={href}
        onChange={(event) => setHref(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            onApply(href.trim());
          }
          if (event.key === 'Escape') onCancel();
        }}
        placeholder="/guest-posts or https://example.com"
        className="h-7 min-w-0 flex-1 rounded border border-line-strong px-2 text-[12px] text-ink"
      />
      <button
        type="button"
        onClick={() => onApply(href.trim())}
        className="rounded bg-navy-900 px-2 py-1 text-[11px] font-medium text-white"
      >
        Apply
      </button>
      <button
        type="button"
        onClick={() => onApply('')}
        className="rounded border border-line-strong px-2 py-1 text-[11px] text-ink-soft"
      >
        Remove
      </button>
    </div>
  );
}

function Divider() {
  return <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-line-strong" />;
}

function ToolButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded transition-colors disabled:opacity-40',
        active ? 'bg-navy-900 text-white' : 'text-ink-soft hover:bg-surface-sunken hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

/**
 * Shipped markdown, converted once when an editor first opens it.
 *
 * Only the subset the shipped copy actually uses: headings, paragraphs,
 * bullets, numbered lists, quotes, bold, italic, code and links. Anything
 * else survives as the text it was, which is the right failure: copy is never
 * lost, it just arrives unformatted and can be fixed in the editor.
 */
function markdownToDoc(source: unknown): RichTextDoc {
  const text = typeof source === 'string' ? source : '';
  if (!text.trim()) return { type: 'doc', content: [{ type: 'paragraph' }] };

  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const content: RichTextDoc['content'] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let quote: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    content.push({ type: 'paragraph', content: inlineToNodes(paragraph.join(' ')) });
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    content.push({
      type: list.ordered ? 'orderedList' : 'bulletList',
      content: list.items.map((item) => ({
        type: 'listItem',
        content: [{ type: 'paragraph', content: inlineToNodes(item) }],
      })),
    });
    list = null;
  };
  const flushQuote = () => {
    if (!quote.length) return;
    content.push({
      type: 'blockquote',
      content: [{ type: 'paragraph', content: inlineToNodes(quote.join(' ')) }],
    });
    quote = [];
  };
  const flushAll = () => {
    flushParagraph();
    flushList();
    flushQuote();
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      flushAll();
      continue;
    }

    const heading = /^(#{2,4})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushAll();
      content.push({
        type: 'heading',
        attrs: { level: (heading[1] as string).length },
        content: inlineToNodes(heading[2] as string),
      });
      continue;
    }

    const bullet = /^[-*]\s+(.*)$/.exec(trimmed);
    if (bullet) {
      flushParagraph();
      flushQuote();
      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, items: [] };
      }
      list.items.push(bullet[1] as string);
      continue;
    }

    const ordered = /^\d+[.)]\s+(.*)$/.exec(trimmed);
    if (ordered) {
      flushParagraph();
      flushQuote();
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, items: [] };
      }
      list.items.push(ordered[1] as string);
      continue;
    }

    const quoted = /^>\s?(.*)$/.exec(trimmed);
    if (quoted) {
      flushParagraph();
      flushList();
      quote.push(quoted[1] as string);
      continue;
    }

    flushList();
    flushQuote();
    paragraph.push(trimmed);
  }

  flushAll();
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}

/** `**bold**`, `*italic*`, `` `code` `` and `[text](/path)` into text nodes. */
function inlineToNodes(source: string): RichTextDoc['content'] {
  const pattern = /(\[[^\]]+\]\([^)]+\))|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(`[^`]+`)/g;
  const nodes: RichTextDoc['content'] = [];
  let index = 0;

  const push = (text: string, marks?: { type: 'bold' | 'italic' | 'code' | 'link'; attrs?: { href: string } }[]) => {
    if (!text) return;
    nodes.push({ type: 'text', text, ...(marks?.length ? { marks } : {}) });
  };

  for (const match of source.matchAll(pattern)) {
    const start = match.index ?? 0;
    push(source.slice(index, start));
    const token = match[0];

    if (token.startsWith('[')) {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (link) push(link[1] as string, [{ type: 'link', attrs: { href: link[2] as string } }]);
    } else if (token.startsWith('**')) {
      push(token.slice(2, -2), [{ type: 'bold' }]);
    } else if (token.startsWith('*')) {
      push(token.slice(1, -1), [{ type: 'italic' }]);
    } else if (token.startsWith('`')) {
      push(token.slice(1, -1), [{ type: 'code' }]);
    }

    index = start + token.length;
  }

  push(source.slice(index));
  return nodes;
}
