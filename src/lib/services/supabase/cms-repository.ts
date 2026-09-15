import { getServerClient } from '@/lib/supabase/server';
import { mapPost, postToRow, type PostRow } from '@/lib/supabase/mappers';
import type { PageContentRecord, PageValues } from '@/lib/cms/types';
import type { BlogPost, BlogPostInput, PostCategorySlug } from '@/lib/types/blog';

/**
 * Page content and blog posts, backed by Supabase.
 *
 * Both tables carry their own row level security, so these queries are a
 * second layer rather than the only one. The blog read policy already hides
 * drafts and future-dated scheduled posts from anyone who is not an admin -
 * the explicit filters here match it, so a change to one is visible against
 * the other rather than silently diverging.
 */

// ------------------------------------------------------------- page content

export const supabasePageContentRepository = {
  async getOverrides(slug: string): Promise<PageContentRecord | null> {
    const supabase = await getServerClient();
    const { data } = await supabase
      .from('page_content')
      .select('slug, values, updated_at, updated_by')
      .eq('slug', slug)
      .maybeSingle();

    if (!data) return null;
    return {
      slug: data.slug as string,
      values: (data.values ?? {}) as PageValues,
      updatedAt: data.updated_at as string,
      updatedBy: (data.updated_by as string | null) ?? undefined,
    };
  },

  /** Every saved page, keyed by slug, for the admin list. */
  async getAllOverrides(): Promise<Record<string, PageContentRecord>> {
    const supabase = await getServerClient();
    const { data } = await supabase
      .from('page_content')
      .select('slug, values, updated_at, updated_by');

    const records: Record<string, PageContentRecord> = {};
    for (const row of (data ?? []) as {
      slug: string;
      values: PageValues | null;
      updated_at: string;
      updated_by: string | null;
    }[]) {
      records[row.slug] = {
        slug: row.slug,
        values: row.values ?? {},
        updatedAt: row.updated_at,
        updatedBy: row.updated_by ?? undefined,
      };
    }
    return records;
  },

  async save(slug: string, values: PageValues, updatedBy?: string): Promise<PageContentRecord> {
    const supabase = await getServerClient();
    const { data, error } = await supabase
      .from('page_content')
      .upsert(
        { slug, values, updated_by: updatedBy ?? null, updated_at: new Date().toISOString() },
        { onConflict: 'slug' },
      )
      .select('slug, values, updated_at, updated_by')
      .single();

    if (error) throw new Error(`Failed to save page content: ${error.message}`);
    return {
      slug: data.slug as string,
      values: (data.values ?? {}) as PageValues,
      updatedAt: data.updated_at as string,
      updatedBy: (data.updated_by as string | null) ?? undefined,
    };
  },

  async reset(slug: string): Promise<void> {
    const supabase = await getServerClient();
    // Deleting the row is what restores the shipped copy - the defaults live
    // in code, so absence is the reset.
    const { error } = await supabase.from('page_content').delete().eq('slug', slug);
    if (error) throw new Error(`Failed to reset page content: ${error.message}`);
  },
};

// --------------------------------------------------------------------- blog

const POST_SELECT =
  'id, slug, title, excerpt, body, category, status, author, cover_image_src, cover_image_alt, seo_title, seo_description, published_at, created_at, updated_at, updated_by';

export const supabaseBlogRepository = {
  async listPublished(options: { category?: PostCategorySlug; limit?: number } = {}) {
    const supabase = await getServerClient();
    let query = supabase
      .from('posts')
      .select(POST_SELECT)
      // Mirrors the read policy: published, or scheduled and due.
      .or(`status.eq.published,and(status.eq.scheduled,published_at.lte.${new Date().toISOString()})`)
      .order('published_at', { ascending: false });

    if (options.category) query = query.eq('category', options.category);
    if (options.limit) query = query.limit(options.limit);

    const { data } = await query;
    return ((data as unknown as PostRow[] | null) ?? []).map(mapPost);
  },

  async getPublishedBySlug(slug: string): Promise<BlogPost | null> {
    const posts = await supabaseBlogRepository.listPublished();
    return posts.find((post) => post.slug === slug) ?? null;
  },

  async getRelated(slug: string, limit = 3): Promise<BlogPost[]> {
    const posts = await supabaseBlogRepository.listPublished();
    const current = posts.find((post) => post.slug === slug);
    if (!current) return [];

    const sameCategory = posts.filter(
      (post) => post.slug !== slug && post.category === current.category,
    );
    if (sameCategory.length >= limit) return sameCategory.slice(0, limit);

    const others = posts.filter(
      (post) => post.slug !== slug && !sameCategory.some((entry) => entry.id === post.id),
    );
    return [...sameCategory, ...others].slice(0, limit);
  },

  /** Every post including drafts. RLS restricts this to admins. */
  async listAll(): Promise<BlogPost[]> {
    const supabase = await getServerClient();
    const { data } = await supabase
      .from('posts')
      .select(POST_SELECT)
      .order('published_at', { ascending: false });
    return ((data as unknown as PostRow[] | null) ?? []).map(mapPost);
  },

  async getById(id: string): Promise<BlogPost | null> {
    const supabase = await getServerClient();
    const { data } = await supabase.from('posts').select(POST_SELECT).eq('id', id).maybeSingle();
    return data ? mapPost(data as unknown as PostRow) : null;
  },

  async isSlugAvailable(slug: string, exceptId?: string): Promise<boolean> {
    const supabase = await getServerClient();
    let query = supabase.from('posts').select('id').eq('slug', slug);
    if (exceptId) query = query.neq('id', exceptId);
    const { data } = await query.limit(1);
    return (data ?? []).length === 0;
  },

  async create(input: BlogPostInput): Promise<BlogPost> {
    const supabase = await getServerClient();
    const { data, error } = await supabase
      .from('posts')
      .insert(postToRow(input))
      .select(POST_SELECT)
      .single();

    if (error) throw new Error(`Failed to create post: ${error.message}`);
    return mapPost(data as unknown as PostRow);
  },

  async update(id: string, input: BlogPostInput, updatedBy?: string): Promise<BlogPost | null> {
    const supabase = await getServerClient();
    const { data, error } = await supabase
      .from('posts')
      .update({ ...postToRow({ ...input, updatedBy }), updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(POST_SELECT)
      .maybeSingle();

    if (error) throw new Error(`Failed to update post: ${error.message}`);
    return data ? mapPost(data as unknown as PostRow) : null;
  },

  async delete(id: string): Promise<boolean> {
    const supabase = await getServerClient();
    const { error } = await supabase.from('posts').delete().eq('id', id);
    return !error;
  },

  async countByCategory(): Promise<Record<string, number>> {
    const posts = await supabaseBlogRepository.listPublished();
    const counts: Record<string, number> = {};
    for (const post of posts) counts[post.category] = (counts[post.category] ?? 0) + 1;
    return counts;
  },

  async getPublishedSlugs(): Promise<{ slug: string; updatedAt: string }[]> {
    const posts = await supabaseBlogRepository.listPublished();
    return posts.map((post) => ({ slug: post.slug, updatedAt: post.updatedAt }));
  },
};
