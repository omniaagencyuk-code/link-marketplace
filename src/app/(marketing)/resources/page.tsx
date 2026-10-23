import { cache } from 'react';
import type { Metadata } from 'next';
import { ResourcesPage, pickFeatured } from '@/components/resources/resources-page';
import { blogService } from '@/lib/services/blog-service';
import { postCategories, categoryName } from '@/lib/config/blog';
import {
  isIndexableView,
  listingHref,
  readPage,
  readSearch,
  type ListingQuery,
} from '@/lib/blog/listing';
import { brand, siteUrl } from '@/lib/config/brand';
import type { PostCategorySlug } from '@/lib/types/blog';

export const dynamic = 'force-dynamic';

const HEADING = 'Link building, without the folklore';
const INTRO =
  'Practical guides on link building, SEO, content and digital PR. Written by the people who run the marketplace, not by a content farm.';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** The one reading of the query string, used by the page and its metadata. */
function readQuery(params: Record<string, string | string[] | undefined>): ListingQuery {
  const one = (key: string) => (typeof params[key] === 'string' ? params[key] : undefined);
  const requested = one('category');
  const category = postCategories.find((entry) => entry.slug === requested)?.slug as
    | PostCategorySlug
    | undefined;

  return { category, search: readSearch(one('q')), page: readPage(one('page')) };
}

/**
 * One read per request, shared by the metadata and the page.
 *
 * `generateMetadata` and the component both need the result - the first to
 * know which page the reader actually landed on, the second to draw it - and
 * `cache` means they ask once. Keyed on the three primitives rather than on
 * a query object, because two objects with the same fields are two keys.
 */
const load = cache(async (category: string, search: string, page: number) => {
  const query: ListingQuery = {
    category: (category || undefined) as PostCategorySlug | undefined,
    search: search || undefined,
    page,
  };
  const [result, counts] = await Promise.all([
    blogService.page(query),
    blogService.countByCategory(),
  ]);
  return { query, result, counts };
});

/**
 * Per view, not per page.
 *
 * The index used to declare `/resources` as the canonical of every view it
 * rendered, so `?category=seo` and page four both told a crawler they were
 * really page one - which is the duplicate-content problem a canonical is
 * for, pointed the wrong way. Now each view declares itself, built by the
 * same `listingHref` the links use so the two cannot disagree.
 *
 * A search is `noindex` instead. Every term a reader types makes a URL, and
 * none of them is a page anybody wrote or linked to; indexing them is how a
 * site grows a thousand thin archive pages. It still renders and is still
 * crawlable - it is just not something to put in an index.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const asked = readQuery(await searchParams);
  const { result } = await load(asked.category ?? '', asked.search ?? '', asked.page ?? 1);

  /*
    The page the reader is actually on, not the one they asked for. A link
    to `?page=99` of a three-page archive shows page three, and a canonical
    still saying 99 would be declaring a URL that is not a distinct page -
    which is the duplicate it exists to prevent, pointed at a page that does
    not exist.
  */
  const query: ListingQuery = { ...asked, page: result.page };
  const canonical = listingHref(query);
  const indexable = isIndexableView(query);

  const name = query.category ? categoryName(query.category) : null;
  const page = query.page && query.page > 1 ? ` (page ${query.page})` : '';
  const title = query.search
    ? `Search results for “${query.search}”`
    : `${name ? `${name} guides` : 'Resources'}${page}`;

  const description = name
    ? (postCategories.find((entry) => entry.slug === query.category)?.description ?? INTRO)
    : 'Guides and playbooks on link building, SEO, content and digital PR from the Press Parrot team.';

  return {
    title,
    description,
    alternates: { canonical },
    robots: indexable ? undefined : { index: false, follow: true },
    openGraph: {
      title: `${title} | ${brand.name}`,
      description,
      url: `${siteUrl}${canonical}`,
    },
  };
}

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const asked = readQuery(await searchParams);
  const { query, result, counts } = await load(
    asked.category ?? '',
    asked.search ?? '',
    asked.page ?? 1,
  );

  /*
    The hero's article leads the index and nothing else. On a filtered or
    searched view it would be an article outside the result the reader asked
    for, sitting above the result they did get - and on page two it would be
    the same article again, which is both a duplicate and a reason the grid
    below starts in a different place than it looks like it should.
  */
  const unfiltered = !query.category && !query.search && result.page === 1;

  return (
    <ResourcesPage
      posts={result.posts}
      featured={unfiltered ? pickFeatured(result.posts) : undefined}
      total={result.total}
      page={result.page}
      pageCount={result.pageCount}
      counts={counts}
      query={{ ...query, page: result.page }}
      heading={query.category ? categoryName(query.category) : HEADING}
      intro={
        query.category
          ? (postCategories.find((entry) => entry.slug === query.category)?.description ?? INTRO)
          : INTRO
      }
    />
  );
}
