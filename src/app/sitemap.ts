import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/config/brand';
import { categoryService, websiteService } from '@/lib/services';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [websites, categories] = await Promise.all([
    websiteService.getAll(),
    categoryService.getAll(),
  ]);

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${siteUrl}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${siteUrl}/websites`, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${siteUrl}/how-it-works`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${siteUrl}/pricing`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${siteUrl}/resources`, changeFrequency: 'weekly', priority: 0.6 },
  ];

  const categoryRoutes: MetadataRoute.Sitemap = categories.map((category) => ({
    url: `${siteUrl}/websites?niche=${category.slug}`,
    changeFrequency: 'daily',
    priority: 0.6,
  }));

  const websiteRoutes: MetadataRoute.Sitemap = websites.map((website) => ({
    url: `${siteUrl}/websites/${website.slug}`,
    lastModified: new Date(website.updatedAt),
    changeFrequency: 'weekly',
    priority: 0.8,
  }));

  return [...staticRoutes, ...categoryRoutes, ...websiteRoutes];
}
