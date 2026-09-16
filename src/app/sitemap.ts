import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/config/brand';
import { blogService } from '@/lib/services/blog-service';
import { postCategories } from '@/lib/config/blog';
import { customPageService } from '@/lib/services/custom-page-service';

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
  const lastModified = new Date();

  const staticRoutes: { path: string; priority: number; changeFrequency: 'daily' | 'weekly' | 'monthly' }[] = [
    { path: '/', priority: 1, changeFrequency: 'weekly' },
    { path: '/link-building', priority: 0.9, changeFrequency: 'monthly' },
    { path: '/guest-posts', priority: 0.9, changeFrequency: 'monthly' },
    { path: '/niche-edits', priority: 0.9, changeFrequency: 'monthly' },
    { path: '/content-writing', priority: 0.9, changeFrequency: 'monthly' },
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

  const [posts, customPages] = await Promise.all([
    blogService.getPublishedSlugs(),
    customPageService.listPublished(),
  ]);

  return [
    ...staticRoutes.map((route) => ({
      url: `${siteUrl}${route.path}`,
      lastModified,
      changeFrequency: route.changeFrequency,
      priority: route.priority,
    })),
    ...postCategories.map((category) => ({
      url: `${siteUrl}/resources?category=${category.slug}`,
      lastModified,
      changeFrequency: 'weekly' as const,
      priority: 0.5,
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
