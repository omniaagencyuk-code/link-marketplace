import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/config/brand';

/**
 * Crawl rules.
 *
 * The marketplace inventory is account-only, so /websites is disallowed
 * outright. /marketplace stays crawlable because its signed-out render is the
 * public gateway page; the listings behind it are gated in `proxy.ts` and
 * never served to an unauthenticated request.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/websites', '/websites/', '/dashboard/', '/admin/', '/login', '/signup', '/api/'],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
