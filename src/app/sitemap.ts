import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/config/brand';
import { blogService } from '@/lib/services/blog-service';
import { customPageService } from '@/lib/services/custom-page-service';
import { pageContentService } from '@/lib/services/page-content-service';

/**
 * Public sitemap.
 *
 * Only pages a signed-out visitor can actually read. Individual marketplace
 * listings are deliberately absent: they are account-only, so publishing their
 * URLs would both leak the inventory and point crawlers at pages that redirect.
 *
 * `/marketplace` is included because its signed-out render is a real public
 * page - the gateway - rather than the listings themselves.
 *
 * Blog posts come from the service, which filters drafts and future-dated
 * scheduled posts, so an unpublished post can never appear here. Pages created
 * in the admin are included on the same terms - published only, never drafts.
 *
 * The /resources category filters are deliberately absent. Each of them
 * renders `<link rel="canonical" href="/resources">`, so listing
 * /resources?category=seo here says "index this" on the same URL the page
 * itself says is a copy of something else. Google resolves that contradiction
 * by dropping the URL, and a sitemap full of URLs it drops is a sitemap it
 * trusts less. They are reachable from /resources, which is how a filtered
 * view of one list should be found.
 */
/**
 * Rebuilt per request, not at build time.
 *
 * Blog posts and pages created in the admin both live in the database, so a
 * sitemap prerendered at build time would be frozen at whatever existed when
 * the site was last deployed - publishing a post would never add it.
 */
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: { path: string; priority: number; changeFrequency: 'daily' | 'weekly' | 'monthly' }[] = [
    { path: '/', priority: 1, changeFrequency: 'weekly' },
    { path: '/link-building', priority: 0.9, changeFrequency: 'monthly' },
    { path: '/guest-posts', priority: 0.9, changeFrequency: 'monthly' },
    { path: '/niche-edits', priority: 0.9, changeFrequency: 'monthly' },
    { path: '/content-writing', priority: 0.9, changeFrequency: 'monthly' },
    { path: '/gambling-link-building', priority: 0.8, changeFrequency: 'monthly' },
    { path: '/digital-pr', priority: 0.8, changeFrequency: 'monthly' },
    { path: '/link-building-agencies', priority: 0.8, changeFrequency: 'monthly' },
    { path: '/marketplace', priority: 0.8, changeFrequency: 'weekly' },
    { path: '/how-it-works', priority: 0.7, changeFrequency: 'monthly' },
    { path: '/pricing', priority: 0.7, changeFrequency: 'monthly' },
    { path: '/resources', priority: 0.7, changeFrequency: 'weekly' },
    { path: '/terms', priority: 0.3, changeFrequency: 'monthly' },
    { path: '/privacy', priority: 0.3, changeFrequency: 'monthly' },
    { path: '/cookies', priority: 0.3, changeFrequency: 'monthly' },
  ];

  /*
    A database that is briefly unavailable must not cost us the whole sitemap.

    Everything below this line comes out of Postgres, and an unhandled failure
    in any one of the three reads makes the route a 500 - which Search Console
    records as "Couldn't fetch" against the whole file, including the fifteen
    static routes that needed no database at all. A partial sitemap is worth
    far more than none, so a failed read contributes nothing and says so in the
    log rather than taking the page down with it.

    This is the one place that deserves the treatment. Swallowing an error is
    normally how a bug goes unnoticed for a month; here the alternative is
    handing Google an error page for the file that tells it the site exists.
  */
  const soften = async <T>(what: string, read: Promise<T>, fallback: T): Promise<T> => {
    try {
      return await read;
    } catch (error) {
      console.error(`[sitemap] ${what} could not be read, continuing without it`, error);
      return fallback;
    }
  };

  const [posts, customPages, editable] = await Promise.all([
    soften('blog posts', blogService.getPublishedSlugs(), []),
    soften('pages created in the admin', customPageService.listPublished(), []),
    // Real edited dates for the pages that have one. The sitemap used to stamp
    // every static route with the time of the request, so each fetch claimed
    // the whole site had changed a moment ago. Google's guidance is explicit
    // that a lastmod it finds to be inaccurate gets ignored, which costs us the
    // signal on the pages where it is true.
    soften('page edit dates', pageContentService.list(), []),
  ]);

  const editedAt = new Map(
    editable
      .filter((page) => page.updatedAt)
      .map((page) => [page.path, new Date(page.updatedAt as string)]),
  );

  return [
    ...staticRoutes.map((route) => ({
      url: `${siteUrl}${route.path}`,
      // Omitted rather than invented where the page has never been edited: no
      // lastmod is read as "no claim", a wrong one teaches Google to disregard
      // the element everywhere on the site.
      ...(editedAt.has(route.path) ? { lastModified: editedAt.get(route.path) } : {}),
      changeFrequency: route.changeFrequency,
      priority: route.priority,
    })),
    ...customPages.map((page) => ({
      url: `${siteUrl}${page.path}`,
      lastModified: new Date(page.updatedAt),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
    ...posts.map((post) => ({
      url: `${siteUrl}/resources/${post.slug}`,
      lastModified: new Date(post.updatedAt),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
  ];
}
