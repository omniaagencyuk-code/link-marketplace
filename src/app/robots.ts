import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/config/brand';

/**
 * Crawl rules.
 *
 * `/websites` used to be disallowed here, which was the opposite of what it
 * needed to be and is why already-indexed listing URLs stayed indexed.
 *
 * Disallow does not mean "remove this from the index". It means "do not fetch
 * this", and a URL Google may not fetch is a URL whose 307 and whose
 * `X-Robots-Tag: noindex` Google never sees. So the listings kept their place
 * in the index on the strength of what was crawled months ago, and kept
 * serving impressions for domains that are now account-only - which is exactly
 * what Search Console was reporting.
 *
 * The rule is the other way round: to get a URL dropped, let the crawler reach
 * it and tell it to drop it. `proxy.ts` answers every inventory path with a
 * 307 to signup and a noindex header, and both of those only work on a request
 * that is allowed to happen.
 *
 * What stays disallowed is what has never been indexed and has no reason to
 * be: the dashboard, the admin area, the auth forms and the API.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/dashboard/', '/admin/', '/login', '/signup', '/api/'],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
