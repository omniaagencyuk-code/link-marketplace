'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdminSession } from '@/lib/auth/admin-access';
import { blogService } from '@/lib/services/blog-service';
import { postCategories, postStatuses, slugifyTitle } from '@/lib/config/blog';
import { sanitiseText } from '@/lib/import/normalise';
import type { BlogPostInput, PostCategorySlug, PostStatus } from '@/lib/types/blog';

/**
 * Blog administration.
 *
 * Every action re-checks the admin session, because server actions have their
 * own endpoints and are reachable without rendering a page.
 *
 * The body is markdown and is cleaned line by line rather than through the
 * single-line sanitiser, so structure survives. It is rendered through the
 * restricted renderer, which produces React nodes rather than HTML, so even
 * unsanitised input could not become markup - the cleaning here just keeps the
 * stored data tidy.
 */

const categorySlugs = new Set(postCategories.map((category) => category.slug));
const statusValues = new Set(postStatuses.map((status) => status.value));

const MAX_BODY = 120_000;

function cleanMarkdown(source: string): string {
  return source
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => sanitiseText(line, 4000))
    .join('\n')
    .slice(0, MAX_BODY);
}

export interface PostActionState {
  error?: string;
  /** Echoed back so a rejected form does not lose what was typed. */
  values?: Partial<BlogPostInput>;
}

/** Build a validated post from the form. Returns an error string when invalid. */
async function readPost(
  formData: FormData,
  exceptId?: string,
): Promise<{ post: BlogPostInput } | { error: string }> {
  const title = sanitiseText(String(formData.get('title') ?? ''), 200);
  if (!title) return { error: 'Give the post a title.' };

  const requestedSlug = String(formData.get('slug') ?? '').trim();
  const slug = slugifyTitle(requestedSlug || title);
  if (!slug) return { error: 'That title does not produce a usable URL. Add a manual slug.' };
  if (!(await blogService.isSlugAvailable(slug, exceptId))) {
    return { error: `The URL "/resources/${slug}" is already used by another post.` };
  }

  const body = cleanMarkdown(String(formData.get('body') ?? ''));
  if (!body.trim()) return { error: 'The post has no content.' };

  const category = String(formData.get('category') ?? '');
  if (!categorySlugs.has(category as PostCategorySlug)) {
    return { error: 'Choose a category.' };
  }

  const status = String(formData.get('status') ?? 'draft');
  if (!statusValues.has(status as PostStatus)) return { error: 'Choose a status.' };

  const publishedRaw = String(formData.get('publishedAt') ?? '').trim();
  const publishedAt = publishedRaw ? new Date(publishedRaw) : new Date();
  if (Number.isNaN(publishedAt.getTime())) return { error: 'That publish date is not valid.' };

  const coverSrc = String(formData.get('coverSrc') ?? '').trim();
  const safeCover =
    coverSrc.startsWith('/') || /^https?:\/\//i.test(coverSrc) ? sanitiseText(coverSrc, 500) : '';

  return {
    post: {
      slug,
      title,
      excerpt: sanitiseText(String(formData.get('excerpt') ?? ''), 400),
      body,
      category: category as PostCategorySlug,
      status: status as PostStatus,
      author: sanitiseText(String(formData.get('author') ?? ''), 120) || 'Press Parrot',
      coverImage: safeCover
        ? { src: safeCover, alt: sanitiseText(String(formData.get('coverAlt') ?? ''), 200) }
        : undefined,
      seoTitle: sanitiseText(String(formData.get('seoTitle') ?? ''), 200) || undefined,
      seoDescription: sanitiseText(String(formData.get('seoDescription') ?? ''), 400) || undefined,
      publishedAt: publishedAt.toISOString(),
    },
  };
}

function revalidateBlog(slug?: string) {
  revalidatePath('/resources');
  revalidatePath('/admin/blog');
  revalidatePath('/sitemap.xml');
  if (slug) revalidatePath(`/resources/${slug}`);
}

export async function createPostAction(
  _state: PostActionState,
  formData: FormData,
): Promise<PostActionState> {
  await requireAdminSession();

  const result = await readPost(formData);
  if ('error' in result) return { error: result.error };

  const created = await blogService.create(result.post);
  revalidateBlog(created.slug);
  redirect(`/admin/blog/${created.id}?saved=1`);
}

export async function updatePostAction(
  _state: PostActionState,
  formData: FormData,
): Promise<PostActionState> {
  const session = await requireAdminSession();

  const id = String(formData.get('id') ?? '');
  const existing = await blogService.getById(id);
  if (!existing) return { error: 'That post no longer exists.' };

  const result = await readPost(formData, id);
  if ('error' in result) return { error: result.error };

  const updated = await blogService.update(id, result.post, session.email);
  revalidateBlog(updated?.slug);
  // The slug may have changed, so refresh the old URL too.
  if (existing.slug !== updated?.slug) revalidatePath(`/resources/${existing.slug}`);
  redirect(`/admin/blog/${id}?saved=1`);
}

export async function deletePostAction(id: string) {
  await requireAdminSession();

  const existing = await blogService.getById(id);
  await blogService.delete(id);
  revalidateBlog(existing?.slug);
  redirect('/admin/blog');
}

/** Quick status change from the list, without opening the editor. */
export async function setPostStatusAction(id: string, status: string) {
  await requireAdminSession();

  if (!statusValues.has(status as PostStatus)) return;
  const existing = await blogService.getById(id);
  if (!existing) return;

  await blogService.update(id, { ...existing, status: status as PostStatus });
  revalidateBlog(existing.slug);
}
