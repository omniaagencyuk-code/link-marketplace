import { seedPosts } from '@/lib/data/blog-posts';
import type { BlogPost, BlogPostInput, PostCategorySlug } from '@/lib/types/blog';

/**
 * Blog repository.
 *
 * Same contract as every other service: an in-memory store today, one `posts`
 * table tomorrow.
 *
 * The public/admin split matters here. `listPublished` is the only read the
 * public site uses, and it filters drafts *and* future-dated scheduled posts
 * at the service boundary rather than in a page - so a draft cannot leak
 * because someone forgot a filter in a component.
 */

let store: BlogPost[] = seedPosts.map((post) => ({ ...post }));
let idSequence = 0;

function newId() {
  return `post_${Date.now().toString(36)}${(idSequence++).toString(36)}`;
}

/** Is this post live right now? */
function isLive(post: BlogPost, now = Date.now()): boolean {
  if (post.status === 'draft') return false;
  if (post.status === 'scheduled') return Date.parse(post.publishedAt) <= now;
  return true;
}

function byNewest(a: BlogPost, b: BlogPost) {
  return Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
}

export interface BlogListOptions {
  category?: PostCategorySlug;
  limit?: number;
}

export const blogService = {
  /** Live posts only. The public site never calls anything else. */
  async listPublished(options: BlogListOptions = {}): Promise<BlogPost[]> {
    const now = Date.now();
    let posts = store.filter((post) => isLive(post, now)).sort(byNewest);
    if (options.category) posts = posts.filter((post) => post.category === options.category);
    if (options.limit) posts = posts.slice(0, options.limit);
    return posts;
  },

  /** One live post by slug, or null. Drafts return null to the public site. */
  async getPublishedBySlug(slug: string): Promise<BlogPost | null> {
    const post = store.find((entry) => entry.slug === slug);
    if (!post || !isLive(post)) return null;
    return post;
  },

  /** Related posts in the same category, excluding the current one. */
  async getRelated(slug: string, limit = 3): Promise<BlogPost[]> {
    const current = store.find((post) => post.slug === slug);
    if (!current) return [];
    const now = Date.now();
    const sameCategory = store
      .filter((post) => post.slug !== slug && isLive(post, now) && post.category === current.category)
      .sort(byNewest);
    if (sameCategory.length >= limit) return sameCategory.slice(0, limit);

    // Top up from anything else recent rather than showing a short row.
    const others = store
      .filter(
        (post) =>
          post.slug !== slug && isLive(post, now) && !sameCategory.some((s) => s.id === post.id),
      )
      .sort(byNewest);
    return [...sameCategory, ...others].slice(0, limit);
  },

  /** Every post including drafts. Admin only. */
  async listAll(): Promise<BlogPost[]> {
    return [...store].sort(byNewest);
  },

  async getById(id: string): Promise<BlogPost | null> {
    return store.find((post) => post.id === id) ?? null;
  },

  /** Is a slug free? `exceptId` lets a post keep its own slug while editing. */
  async isSlugAvailable(slug: string, exceptId?: string): Promise<boolean> {
    return !store.some((post) => post.slug === slug && post.id !== exceptId);
  },

  async create(input: BlogPostInput): Promise<BlogPost> {
    const now = new Date().toISOString();
    const post: BlogPost = {
      ...input,
      id: newId(),
      createdAt: now,
      updatedAt: now,
    };
    store = [post, ...store];
    return post;
  },

  async update(id: string, input: BlogPostInput, updatedBy?: string): Promise<BlogPost | null> {
    const index = store.findIndex((post) => post.id === id);
    if (index === -1) return null;
    const updated: BlogPost = {
      ...(store[index] as BlogPost),
      ...input,
      id,
      updatedAt: new Date().toISOString(),
      updatedBy,
    };
    store[index] = updated;
    return updated;
  },

  async delete(id: string): Promise<boolean> {
    const before = store.length;
    store = store.filter((post) => post.id !== id);
    return store.length < before;
  },

  /** Counts per category, for the public index filters. */
  async countByCategory(): Promise<Record<string, number>> {
    const now = Date.now();
    const counts: Record<string, number> = {};
    for (const post of store) {
      if (!isLive(post, now)) continue;
      counts[post.category] = (counts[post.category] ?? 0) + 1;
    }
    return counts;
  },

  /** Slugs of live posts, for the sitemap. */
  async getPublishedSlugs(): Promise<{ slug: string; updatedAt: string }[]> {
    const now = Date.now();
    return store
      .filter((post) => isLive(post, now))
      .map((post) => ({ slug: post.slug, updatedAt: post.updatedAt }));
  },
};
