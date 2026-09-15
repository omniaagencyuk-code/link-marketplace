import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/config/brand';
import { blogService } from '@/lib/services/blog-service';
import { postCategories } from '@/lib/config/blog';

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
 * scheduled posts, so an unpublished post can never appear here.
 */
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
  ];

  const posts = await blogService.getPublishedSlugs();

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
    ...posts.map((post) => ({
      url: `${siteUrl}/resources/${post.slug}`,
      lastModified: new Date(post.updatedAt),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
  ];
}
