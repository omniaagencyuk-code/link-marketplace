import type { Metadata } from 'next';
import { pageContentService } from '@/lib/services/page-content-service';
import { getRegisteredPage } from './registry';
import { brand, siteUrl } from '@/lib/config/brand';

/**
 * Page metadata from editable content.
 *
 * Meta title and description are the highest-leverage copy on the site, so
 * they are editable like everything else - and they fall back to the shipped
 * defaults the same way.
 */
export async function metadataForPage(slug: string): Promise<Metadata> {
  const page = getRegisteredPage(slug);
  if (!page) return {};

  const content = await pageContentService.content(slug);
  const title = content.text('seo', 'metaTitle');
  const description = content.text('seo', 'metaDescription');
  const ogImage = content.image('seo', 'ogImage');

  return {
    title,
    description,
    alternates: { canonical: page.definition.path },
    openGraph: {
      title: `${title} | ${brand.name}`,
      description,
      url: `${siteUrl}${page.definition.path}`,
      ...(ogImage.src ? { images: [{ url: ogImage.src, alt: ogImage.alt }] } : {}),
    },
  };
}
