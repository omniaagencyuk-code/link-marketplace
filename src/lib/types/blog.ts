/**
 * Blog posts.
 *
 * Deliberately a small model. A post is a slug, some markdown, and enough
 * metadata to publish it well - there are no taxonomies beyond a category and
 * no custom fields, because every one of those is a decision an editor then
 * has to make on every post.
 */

export type PostStatus = 'draft' | 'scheduled' | 'published';

/** Categories mirror what the business actually writes about. */
export type PostCategorySlug =
  | 'link-building'
  | 'seo'
  | 'content'
  | 'digital-pr'
  | 'agency-growth';

export interface PostCategory {
  slug: PostCategorySlug;
  name: string;
  description: string;
}

export interface BlogPost {
  id: string;
  /** URL segment. Unique, lowercase, hyphenated. */
  slug: string;
  title: string;
  /** Shown on cards and used as the meta description when none is set. */
  excerpt: string;
  /** Markdown, rendered through the restricted renderer. */
  body: string;
  category: PostCategorySlug;
  status: PostStatus;
  /** Author's display name. Free text until writer accounts exist. */
  author: string;
  /** Cover image path and alt text. Optional. */
  coverImage?: { src: string; alt: string };
  /** Overrides the title and excerpt in search results when set. */
  seoTitle?: string;
  seoDescription?: string;
  /**
   * When the post goes live. A future date with status "scheduled" keeps it
   * off the public site until then, checked at read time.
   */
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
  updatedBy?: string;
}

/** What the editor submits. The service fills in ids and timestamps. */
export interface BlogPostInput {
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  category: PostCategorySlug;
  status: PostStatus;
  author: string;
  coverImage?: { src: string; alt: string };
  seoTitle?: string;
  seoDescription?: string;
  publishedAt: string;
}
