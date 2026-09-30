'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { AlertCircle, ExternalLink, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RichTextEditor } from '@/components/admin/cms/rich-text-editor';
import type { RichTextDoc } from '@/lib/cms/rich-text';
import {
  RELATED_MODES,
  blogSectionDefaults,
  type BlogFaq,
  type BlogSections,
  type RelatedMode,
} from '@/lib/config/blog-sections';
import { postCategories, postStatuses, slugifyTitle } from '@/lib/config/blog';
import {
  createPostAction,
  updatePostAction,
  type PostActionState,
} from '@/app/admin/(protected)/blog/actions';
import type { BlogPost } from '@/lib/types/blog';

/**
 * Write or edit a post.
 *
 * One editable article with a toolbar over it, and the blocks around it as
 * fields underneath. The article used to be a markdown textarea with a preview
 * tab, which is a fine way to write if you write markdown and a bad one if you
 * do not - and the people writing posts here do not.
 *
 * It is the same editor the page CMS uses, which matters more than it sounds:
 * everything on the toolbar maps to a node the renderer already knows how to
 * draw, so there is no font, no colour and no size to reach for, and what is
 * typed here is what publishes. The one difference is the heading dropdown,
 * which runs to H6 for an article where a landing page stops at H4.
 *
 * Markdown is not thrown away. A post written before this existed opens as a
 * document, converted on the way in, and its original markdown is submitted
 * untouched - so the conversion is recoverable if it ever turns out to be
 * lossy on some post nobody has looked at yet.
 *
 * Deliberately absent: the value-point row the service pages carry. Four short
 * benefit statements under a sales headline make sense; under the headline of
 * an article they do not.
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
  // The article as a document. A post written in markdown is converted by the
  // editor on the way in; `post.body` still travels with the form untouched.
  const [bodyDoc, setBodyDoc] = useState<RichTextDoc | null>(post?.bodyDoc ?? null);
  const [sections, setSections] = useState<BlogSections>(post?.sections ?? blogSectionDefaults);

  const setMarketplace = (patch: Partial<BlogSections['marketplace']>) =>
    setSections((current) => ({ ...current, marketplace: { ...current.marketplace, ...patch } }));
  const setCta = (patch: Partial<BlogSections['cta']>) =>
    setSections((current) => ({ ...current, cta: { ...current.cta, ...patch } }));
  const setFaqs = (faqs: BlogFaq[]) => setSections((current) => ({ ...current, faqs }));

  const effectiveSlug = slugTouched ? slug : slugifyTitle(title);

  return (
    <form action={formAction} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
      {post ? <input type="hidden" name="id" value={post.id} /> : null}
      {/* Every section as one field: a form holds strings, and splitting this
          into thirty named inputs would put the shape in two places. */}
      <input type="hidden" name="sections" value={JSON.stringify(sections)} />

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
          <CardHeader>
            <CardTitle>Content</CardTitle>
          </CardHeader>
          <CardContent>
            <Label htmlFor="body" className="sr-only">
              Post content
            </Label>
            {/*
              The markdown travels with the form exactly as it was stored. The
              page renders the document in preference to it, so this is a
              record rather than a second source of truth - and the one way
              back if a conversion ever turns out to have lost something.
            */}
            <input type="hidden" name="body" value={post?.body ?? ''} />
            <input
              type="hidden"
              name="bodyDoc"
              value={bodyDoc ? JSON.stringify(bodyDoc) : ''}
            />
            <RichTextEditor
              id="body"
              value={bodyDoc ?? post?.body ?? ''}
              onChange={setBodyDoc}
              headings="article"
              rows={24}
            />
            <p className="mt-2 text-[12px] text-muted">
              Headings run from H2 to H6 - the page owns the H1, which is the post
              title. Paste from anywhere: styling is dropped on the way in.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between gap-3">
            <CardTitle>Marketplace block</CardTitle>
            <ShowToggle
              label="Marketplace block"
              checked={sections.marketplace.show}
              onChange={(show) => setMarketplace({ show })}
            />
          </CardHeader>
          {sections.marketplace.show ? (
            <CardContent className="space-y-4">
              <Field label="Heading" id="mkHeading">
                <Input
                  id="mkHeading"
                  value={sections.marketplace.heading}
                  onChange={(event) => setMarketplace({ heading: event.target.value })}
                  maxLength={160}
                  className="mt-1.5"
                />
              </Field>
              <Field label="Supporting copy" id="mkBody">
                <TextArea
                  id="mkBody"
                  rows={3}
                  maxLength={600}
                  value={sections.marketplace.body}
                  onChange={(value) => setMarketplace({ body: value })}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Button label" id="mkLabel">
                  <Input
                    id="mkLabel"
                    value={sections.marketplace.ctaLabel}
                    onChange={(event) => setMarketplace({ ctaLabel: event.target.value })}
                    maxLength={60}
                    className="mt-1.5"
                  />
                </Field>
                <Field label="Button link" id="mkHref">
                  <Input
                    id="mkHref"
                    value={sections.marketplace.ctaHref}
                    onChange={(event) => setMarketplace({ ctaHref: event.target.value })}
                    className="mt-1.5 font-mono text-[13px]"
                  />
                </Field>
              </div>
              <Field label="Line under the button" id="mkNote">
                <Input
                  id="mkNote"
                  value={sections.marketplace.note}
                  onChange={(event) => setMarketplace({ note: event.target.value })}
                  maxLength={200}
                  className="mt-1.5"
                />
              </Field>
              <p className="text-[12px] text-muted">
                The redacted table beside this is generated from live listings. It never
                shows real domains to a signed-out visitor.
              </p>
            </CardContent>
          ) : null}
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between gap-3">
            <CardTitle>FAQs</CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setFaqs([...sections.faqs, { question: '', answer: '' }])}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Add question
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {sections.faqs.length === 0 ? (
              <p className="text-[13px] text-muted">
                No questions, so the section does not appear. Add some and they publish
                as a FAQ block with the structured data Google reads for rich results.
              </p>
            ) : null}

            {sections.faqs.map((faq, index) => (
              <div key={index} className="rounded-md border border-line p-3.5">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1 space-y-3">
                    <Input
                      aria-label={`Question ${index + 1}`}
                      placeholder="Does a guest post have to be dofollow?"
                      value={faq.question}
                      maxLength={300}
                      onChange={(event) =>
                        setFaqs(
                          sections.faqs.map((entry, at) =>
                            at === index ? { ...entry, question: event.target.value } : entry,
                          ),
                        )
                      }
                    />
                    <TextArea
                      id={`faq-answer-${index}`}
                      label={`Answer ${index + 1}`}
                      rows={3}
                      maxLength={1500}
                      placeholder="Answer it in full here. Half an answer is worse than none - this is the text Google shows."
                      value={faq.answer}
                      onChange={(value) =>
                        setFaqs(
                          sections.faqs.map((entry, at) =>
                            at === index ? { ...entry, answer: value } : entry,
                          ),
                        )
                      }
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove question ${index + 1}`}
                    onClick={() => setFaqs(sections.faqs.filter((_, at) => at !== index))}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            ))}

            {sections.faqs.length ? (
              <p className="text-[12px] text-muted">
                A question with an empty answer is dropped on save. Structured data that
                claims an answer and has none costs rich results across the whole site,
                not just this page.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>After the article</CardTitle>
          </CardHeader>
          <CardContent>
            <Label htmlFor="relatedMode">Show</Label>
            <Select
              id="relatedMode"
              value={sections.relatedMode}
              onChange={(event) =>
                setSections((current) => ({
                  ...current,
                  relatedMode: event.target.value as RelatedMode,
                }))
              }
              className="mt-1.5"
            >
              {RELATED_MODES.map((mode) => (
                <option key={mode.value} value={mode.value}>
                  {mode.label}
                </option>
              ))}
            </Select>
            <p className="mt-2 text-[12px] text-muted">
              {RELATED_MODES.find((mode) => mode.value === sections.relatedMode)?.help}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between gap-3">
            <CardTitle>Closing call to action</CardTitle>
            <ShowToggle
              label="Closing call to action"
              checked={sections.cta.show}
              onChange={(show) => setCta({ show })}
            />
          </CardHeader>
          {sections.cta.show ? (
            <CardContent className="space-y-4">
              <Field label="Heading" id="ctaHeading">
                <Input
                  id="ctaHeading"
                  value={sections.cta.heading}
                  onChange={(event) => setCta({ heading: event.target.value })}
                  maxLength={160}
                  className="mt-1.5"
                />
              </Field>
              <Field label="Supporting copy" id="ctaBody">
                <TextArea
                  id="ctaBody"
                  rows={2}
                  maxLength={600}
                  value={sections.cta.body}
                  onChange={(value) => setCta({ body: value })}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Primary button" id="ctaPrimaryLabel">
                  <Input
                    id="ctaPrimaryLabel"
                    value={sections.cta.primaryLabel}
                    onChange={(event) => setCta({ primaryLabel: event.target.value })}
                    maxLength={60}
                    className="mt-1.5"
                  />
                </Field>
                <Field label="Primary link" id="ctaPrimaryHref">
                  <Input
                    id="ctaPrimaryHref"
                    value={sections.cta.primaryHref}
                    onChange={(event) => setCta({ primaryHref: event.target.value })}
                    className="mt-1.5 font-mono text-[13px]"
                  />
                </Field>
                <Field label="Second button" id="ctaSecondaryLabel">
                  <Input
                    id="ctaSecondaryLabel"
                    value={sections.cta.secondaryLabel}
                    onChange={(event) => setCta({ secondaryLabel: event.target.value })}
                    maxLength={60}
                    placeholder="Leave blank for one button"
                    className="mt-1.5"
                  />
                </Field>
                <Field label="Second link" id="ctaSecondaryHref">
                  <Input
                    id="ctaSecondaryHref"
                    value={sections.cta.secondaryHref}
                    onChange={(event) => setCta({ secondaryHref: event.target.value })}
                    className="mt-1.5 font-mono text-[13px]"
                  />
                </Field>
              </div>
            </CardContent>
          ) : null}
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

/** A label above a control, which is most of this form. */
function Field({
  label,
  id,
  children,
}: {
  label: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

/** The one textarea style this form uses, rather than that string six times. */
function TextArea({
  id,
  label,
  rows,
  maxLength,
  value,
  placeholder,
  onChange,
}: {
  id: string;
  /** Only where the control has no visible <Label> of its own. */
  label?: string;
  rows: number;
  maxLength: number;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <>
      {label ? (
        <Label htmlFor={id} className="sr-only">
          {label}
        </Label>
      ) : null}
      <textarea
        id={id}
        rows={rows}
        maxLength={maxLength}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 w-full rounded-md border border-line-strong bg-white px-3 py-2 text-sm text-ink focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 focus:outline-none"
      />
    </>
  );
}

/**
 * Whether a section appears on the page at all.
 *
 * Hiding the fields when it is off, rather than only greying them: a section
 * that will not publish should not look like something being filled in. What
 * was typed survives the toggle, because it is held in state rather than in
 * the inputs.
 */
function ShowToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[12px] text-muted">
      <input
        type="checkbox"
        checked={checked}
        aria-label={`Show the ${label.toLowerCase()} on this post`}
        onChange={(event) => onChange(event.target.checked)}
        className="h-3.5 w-3.5 rounded border-line-strong text-accent-600 focus:ring-accent-500/30"
      />
      Show on this post
    </label>
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
