import { getServerClient, getAdminScopedClient } from '@/lib/supabase/server';
import { mapPost, postToRow, type PostRow } from '@/lib/supabase/mappers';
import type { PageContentRecord, PageValues } from '@/lib/cms/types';
import { postCategories } from '@/lib/config/blog';
import {
  PER_PAGE,
  pageCountFor,
  readSearch,
  type ListingQuery,
  type ListingResult,
} from '@/lib/blog/listing';
import type { BlogPost, BlogPostInput, PostCategorySlug } from '@/lib/types/blog';

/**
 * Page content and blog posts, backed by Supabase.
 *
 * Both tables carry their own row level security, so the public reads here are
 * a second layer rather than the only one. The blog read policy already hides
 * drafts and future-dated scheduled posts from anyone who is not an admin -
 * the explicit filters here match it, so a change to one is visible against
 * the other rather than silently diverging.
 *
 * Anything the admin calls uses `getAdminScopedClient()`, because the admin
 * holds no Supabase identity and RLS would otherwise refuse the write and
 * hide every draft. See that function's comment for why that is safe.
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
    const supabase = getAdminScopedClient();
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
    const supabase = getAdminScopedClient();
    // Deleting the row is what restores the shipped copy - the defaults live
    // in code, so absence is the reset.
    const { error } = await supabase.from('page_content').delete().eq('slug', slug);
    if (error) throw new Error(`Failed to reset page content: ${error.message}`);
  },
};

// --------------------------------------------------------------------- blog

const POST_SELECT =
  'id, slug, title, excerpt, body, body_doc, sections, category, status, author, cover_image_src, cover_image_alt, seo_title, seo_description, published_at, created_at, updated_at, updated_by';

/**
 * The columns a listing actually draws.
 *
 * `body_doc` and `sections` are the two largest fields on a post - the whole
 * article again as a document, and its per-post marketplace block, FAQs and
 * closing call to action - and a card shows neither. `body` stays because
 * `readingTime` counts its words, which is the one thing on a card that is
 * derived rather than stored.
 */
const POST_CARD_SELECT =
  'id, slug, title, excerpt, body, category, status, author, cover_image_src, cover_image_alt, seo_title, seo_description, published_at, created_at, updated_at, updated_by';

/** Published, or scheduled and already due. Mirrors the read policy. */
function liveFilter() {
  return `status.eq.published,and(status.eq.scheduled,published_at.lte.${new Date().toISOString()})`;
}

export const supabaseBlogRepository = {
  async listPublished(options: { category?: PostCategorySlug; limit?: number } = {}) {
    const supabase = await getServerClient();
    let query = supabase
      .from('posts')
      .select(POST_SELECT)
      .or(liveFilter())
      .order('published_at', { ascending: false });

    if (options.category) query = query.eq('category', options.category);
    if (options.limit) query = query.limit(options.limit);

    const { data } = await query;
    return ((data as unknown as PostRow[] | null) ?? []).map(mapPost);
  },

  /**
   * One page of the index, counted and sliced in the database.
   *
   * The PostgREST translation of `applyListing`. Every predicate there is
   * the simplest shape that comes across one-to-one, which is what lets the
   * two be compared: the category is an equality, the search is a
   * case-insensitive substring over the same three things
   * (`searchableText`), and the page is a `range`.
   *
   * The category name is searched by resolving the term to the slugs whose
   * display name contains it, rather than by sending the label to a column
   * that holds slugs. "digital pr" therefore finds the category, and so does
   * "Digital PR", without a second copy of the names living in SQL.
   */
  async page(query: ListingQuery = {}): Promise<ListingResult> {
    const supabase = await getServerClient();
    const term = readSearch(query.search);

    const build = () => {
      let request = supabase
        .from('posts')
        .select(POST_CARD_SELECT, { count: 'exact' })
        .or(liveFilter());

      if (query.category) request = request.eq('category', query.category);

      if (term) {
        const escaped = term.replace(/[%,()]/g, ' ').trim();
        const slugs = postCategories
          .filter((entry) => entry.name.toLowerCase().includes(term.toLowerCase()))
          .map((entry) => entry.slug);
        const clauses = [`title.ilike.%${escaped}%`, `excerpt.ilike.%${escaped}%`];
        if (slugs.length) clauses.push(`category.in.(${slugs.join(',')})`);
        request = request.or(clauses.join(','));
      }

      return request.order('published_at', { ascending: false });
    };

    /*
      Two round trips rather than one, and deliberately. The count has to be
      known before the range can be clamped - a reader on page nine of a
      search that now returns four posts gets page one, not an empty grid -
      and PostgREST returns the count with the rows rather than before them.
      The first request asks for no rows at all (`head`), so what the extra
      trip costs is a round trip, not a second download.
    */
    const { count } = await build().range(0, 0).limit(0);
    const total = count ?? 0;
    const pageCount = pageCountFor(total, PER_PAGE);
    const page = Math.min(Math.max(query.page ?? 1, 1), pageCount);
    const offset = (page - 1) * PER_PAGE;

    if (total === 0) return { posts: [], total: 0, page: 1, pageCount: 1 };

    const { data } = await build().range(offset, offset + PER_PAGE - 1);
    return {
      posts: ((data as unknown as PostRow[] | null) ?? []).map(mapPost),
      total,
      page,
      pageCount,
    };
  },

  /**
   * One post by its slug, asked for by slug.
   *
   * It used to read every live post and find one in the array, which is a
   * whole archive downloaded - bodies, documents and all - to render one
   * article. It is also the read that would have broken when the listing's
   * select was narrowed, since this path needs the fields a card does not.
   */
  async getPublishedBySlug(slug: string): Promise<BlogPost | null> {
    const supabase = await getServerClient();
    const { data } = await supabase
      .from('posts')
      .select(POST_SELECT)
      .eq('slug', slug)
      .or(liveFilter())
      .maybeSingle();
    return data ? mapPost(data as unknown as PostRow) : null;
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

  /** Every post including drafts. Admin only - see the note at the top. */
  async listAll(): Promise<BlogPost[]> {
    const supabase = getAdminScopedClient();
    const { data } = await supabase
      .from('posts')
      .select(POST_SELECT)
      .order('published_at', { ascending: false });
    return ((data as unknown as PostRow[] | null) ?? []).map(mapPost);
  },

  async getById(id: string): Promise<BlogPost | null> {
    const supabase = getAdminScopedClient();
    const { data } = await supabase.from('posts').select(POST_SELECT).eq('id', id).maybeSingle();
    return data ? mapPost(data as unknown as PostRow) : null;
  },

  async isSlugAvailable(slug: string, exceptId?: string): Promise<boolean> {
    const supabase = getAdminScopedClient();
    let query = supabase.from('posts').select('id').eq('slug', slug);
    if (exceptId) query = query.neq('id', exceptId);
    const { data } = await query.limit(1);
    return (data ?? []).length === 0;
  },

  async create(input: BlogPostInput): Promise<BlogPost> {
    const supabase = getAdminScopedClient();
    const { data, error } = await supabase
      .from('posts')
      .insert(postToRow(input))
      .select(POST_SELECT)
      .single();

    if (error) throw new Error(`Failed to create post: ${error.message}`);
    return mapPost(data as unknown as PostRow);
  },

  async update(id: string, input: BlogPostInput, updatedBy?: string): Promise<BlogPost | null> {
    const supabase = getAdminScopedClient();
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
    const supabase = getAdminScopedClient();
    const { error } = await supabase.from('posts').delete().eq('id', id);
    return !error;
  },

  /**
   * How many live posts each category holds, without downloading any.
   *
   * One head request per category - five of them, in parallel, each asking
   * for a count and no rows. The version this replaces read every post and
   * tallied them in JavaScript, which is the same shape of mistake 0093 took
   * out of the niche directory: an archive downloaded to produce five
   * numbers.
   */
  async countByCategory(): Promise<Record<string, number>> {
    const supabase = await getServerClient();
    const entries = await Promise.all(
      postCategories.map(async (category) => {
        const { count } = await supabase
          .from('posts')
          .select('id', { count: 'exact', head: true })
          .or(liveFilter())
          .eq('category', category.slug);
        return [category.slug, count ?? 0] as const;
      }),
    );
    return Object.fromEntries(entries);
  },

  async getPublishedSlugs(): Promise<{ slug: string; updatedAt: string }[]> {
    const posts = await supabaseBlogRepository.listPublished();
    return posts.map((post) => ({ slug: post.slug, updatedAt: post.updatedAt }));
  },
};
