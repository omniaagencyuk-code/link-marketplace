'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { AlertCircle, Eye, ExternalLink, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Markdown } from '@/lib/cms/markdown';
import { postCategories, postStatuses, slugifyTitle } from '@/lib/config/blog';
import {
  createPostAction,
  updatePostAction,
  type PostActionState,
} from '@/app/admin/(protected)/blog/actions';
import { cn } from '@/lib/utils/cn';
import type { BlogPost } from '@/lib/types/blog';

/**
 * Write or edit a post.
 *
 * Markdown with a live preview rather than a rich-text editor. That is a
 * deliberate trade: markdown is stored as plain text, it diffs cleanly, it
 * cannot carry pasted styling from Word, and it cannot smuggle markup into the
 * page. The preview uses the exact renderer the public page uses, so what is
 * shown here is what publishes.
 */
export function PostEditor({ post }: { post?: BlogPost }) {
  const isEdit = Boolean(post);
  const [state, formAction] = useActionState<PostActionState, FormData>(
    isEdit ? updatePostAction : createPostAction,
    {},
  );

  const [title, setTitle] = useState(post?.title ?? '');
  const [slug, setSlug] = useState(post?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(Boolean(post));
  const [body, setBody] = useState(post?.body ?? '');
  const [tab, setTab] = useState<'write' | 'preview'>('write');

  const effectiveSlug = slugTouched ? slug : slugifyTitle(title);

  return (
    <form action={formAction} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
      {post ? <input type="hidden" name="id" value={post.id} /> : null}

      <div className="min-w-0 space-y-5">
        <Card>
          <CardContent className="space-y-4 py-5">
            <div>
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                name="title"
                required
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="How to build a link plan that survives a core update"
                className="mt-1.5 text-[15px]"
              />
            </div>

            <div>
              <Label htmlFor="slug">URL</Label>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="shrink-0 font-mono text-[12px] text-muted">/resources/</span>
                <Input
                  id="slug"
                  name="slug"
                  value={effectiveSlug}
                  onChange={(event) => {
                    setSlugTouched(true);
                    setSlug(event.target.value);
                  }}
                  className="font-mono text-[13px]"
                />
              </div>
              <p className="mt-1.5 text-[12px] text-muted">
                {slugTouched
                  ? 'Changing this on a published post breaks existing links to it.'
                  : 'Generated from the title. Edit to override.'}
              </p>
            </div>

            <div>
              <Label htmlFor="excerpt">Excerpt</Label>
              <textarea
                id="excerpt"
                name="excerpt"
                rows={2}
                defaultValue={post?.excerpt ?? ''}
                maxLength={400}
                placeholder="One or two sentences. Shown on cards and used as the meta description if you leave that blank."
                className="mt-1.5 w-full rounded-md border border-line-strong bg-white px-3 py-2 text-sm text-ink focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 focus:outline-none"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between gap-3">
            <CardTitle>Content</CardTitle>
            <div className="flex rounded-md border border-line-strong p-0.5">
              <TabButton active={tab === 'write'} onClick={() => setTab('write')} icon={Pencil}>
                Write
              </TabButton>
              <TabButton active={tab === 'preview'} onClick={() => setTab('preview')} icon={Eye}>
                Preview
              </TabButton>
            </div>
          </CardHeader>
          <CardContent>
            {/* The textarea stays mounted while previewing so the form still
                submits its value and the caret position is not lost. */}
            <div className={tab === 'write' ? '' : 'hidden'}>
              <Label htmlFor="body" className="sr-only">
                Post content
              </Label>
              <textarea
                id="body"
                name="body"
                rows={24}
                required
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder={'## A subheading\n\nA paragraph. **Bold**, *italic*, and [an internal link](/link-building).\n\n- A bullet\n- Another bullet\n\n> A pull quote.'}
                className="w-full rounded-md border border-line-strong bg-white px-3 py-2 font-mono text-[13px] leading-relaxed text-ink focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 focus:outline-none"
              />
              <p className="mt-2 text-[12px] text-muted">
                Markdown. <code className="font-mono">##</code> subheading,{' '}
                <code className="font-mono">-</code> bullet, <code className="font-mono">&gt;</code>{' '}
                quote, <code className="font-mono">**bold**</code>,{' '}
                <code className="font-mono">[text](/page)</code> for an internal link.
              </p>
            </div>

            {tab === 'preview' ? (
              <div className="rounded-md border border-line bg-surface/50 p-5">
                {body.trim() ? (
                  <Markdown source={body} variant="article" />
                ) : (
                  <p className="text-[13px] text-muted">Nothing to preview yet.</p>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Search engine listing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="seoTitle">Meta title</Label>
              <Input
                id="seoTitle"
                name="seoTitle"
                defaultValue={post?.seoTitle ?? ''}
                maxLength={200}
                placeholder="Leave blank to use the post title"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="seoDescription">Meta description</Label>
              <textarea
                id="seoDescription"
                name="seoDescription"
                rows={2}
                maxLength={400}
                defaultValue={post?.seoDescription ?? ''}
                placeholder="Leave blank to use the excerpt"
                className="mt-1.5 w-full rounded-md border border-line-strong bg-white px-3 py-2 text-sm text-ink focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 focus:outline-none"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <aside className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>Publish</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="status">Status</Label>
              <Select
                id="status"
                name="status"
                defaultValue={post?.status ?? 'draft'}
                className="mt-1.5"
              >
                {postStatuses.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </Select>
              <ul className="mt-2 space-y-1">
                {postStatuses.map((status) => (
                  <li key={status.value} className="text-[12px] text-muted">
                    <span className="font-medium text-ink-soft">{status.label}:</span>{' '}
                    {status.description}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <Label htmlFor="publishedAt">Publish date</Label>
              <Input
                id="publishedAt"
                name="publishedAt"
                type="datetime-local"
                defaultValue={toLocalInput(post?.publishedAt)}
                className="mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="category">Category</Label>
              <Select
                id="category"
                name="category"
                defaultValue={post?.category ?? 'link-building'}
                className="mt-1.5"
              >
                {postCategories.map((category) => (
                  <option key={category.slug} value={category.slug}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label htmlFor="author">Author</Label>
              <Input
                id="author"
                name="author"
                defaultValue={post?.author ?? 'The Press Parrot team'}
                className="mt-1.5"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cover image</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="coverSrc">Image path or URL</Label>
              <Input
                id="coverSrc"
                name="coverSrc"
                defaultValue={post?.coverImage?.src ?? ''}
                placeholder="/images/posts/example.webp"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="coverAlt">Alt text</Label>
              <Input
                id="coverAlt"
                name="coverAlt"
                defaultValue={post?.coverImage?.alt ?? ''}
                placeholder="Describe the image"
                className="mt-1.5"
              />
            </div>
            <p className="text-[12px] text-muted">
              Upload files to <code className="font-mono">/public/images/posts/</code> and reference
              them by path. Direct uploads arrive with Supabase storage.
            </p>
          </CardContent>
        </Card>

        {state.error ? (
          <p
            role="alert"
            className="flex gap-2 rounded-lg border border-negative/30 bg-negative/5 px-3.5 py-2.5 text-[13px] text-negative"
          >
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {state.error}
          </p>
        ) : null}

        <div className="space-y-2">
          <SubmitButton label={isEdit ? 'Save post' : 'Create post'} />
          {post && post.status === 'published' ? (
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link href={`/resources/${post.slug}`} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3.5 w-3.5" />
                View live post
              </Link>
            </Button>
          ) : null}
        </div>
      </aside>
    </form>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Pencil;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[12px] font-medium transition-colors',
        active ? 'bg-navy-900 text-white' : 'text-ink-soft hover:text-ink',
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {children}
    </button>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="accent" className="w-full" disabled={pending}>
      {pending ? 'Saving...' : label}
    </Button>
  );
}

/** ISO to the value a datetime-local input expects, in local time. */
function toLocalInput(iso?: string): string {
  const date = iso ? new Date(iso) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
