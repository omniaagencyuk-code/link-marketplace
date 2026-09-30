import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BadgeCheck, Gauge, Receipt, Workflow } from 'lucide-react';
import { ServicePage } from '@/components/marketing/service-page';
import { NicheLandingPage } from '@/components/marketing/niche-landing-page';
import { PageSections } from '@/components/cms/page-sections';
import { acceptedNiches } from '@/lib/config/accepted-niches';
import type { NicheSlug } from '@/lib/types';
import { contentAccessors } from '@/lib/cms/resolve';
import { customPageService } from '@/lib/services/custom-page-service';
import { websiteService } from '@/lib/services';
import { brand, siteUrl } from '@/lib/config/brand';

/**
 * Pages created from the admin.
 *
 * This is the catch-all under the marketing group, so it only ever runs for a
 * URL no real route matched - Next resolves static segments ahead of dynamic
 * ones, and the admin refuses to create a page on a reserved slug anyway. An
 * unknown slug, or a page still in draft, is a 404 like any other.
 *
 * Rendered by the same `ServicePage` template as /link-building, which is what
 * "follows the same layout as the other pages" has to mean if it is to keep
 * being true as the design changes.
 */

export const dynamic = 'force-dynamic';

const highlightIcons = [BadgeCheck, Gauge, Receipt, Workflow];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = await customPageService.resolve(slug);
  if (!page) return {};

  const content = contentAccessors(page);
  const title = content.text('seo', 'metaTitle') || page.record.label;
  const description = content.text('seo', 'metaDescription');
  const ogImage = content.image('seo', 'ogImage');

  return {
    title,
    description,
    alternates: { canonical: `/${slug}` },
    openGraph: {
      title: `${title} | ${brand.name}`,
      description,
      url: `${siteUrl}/${slug}`,
      ...(ogImage.src ? { images: [{ url: ogImage.src, alt: ogImage.alt }] } : {}),
    },
  };
}

export default async function CustomPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const page = await customPageService.resolve(slug);
  if (!page) notFound();

  const content = contentAccessors(page);

  /*
    A niche page is scoped to one marketplace category, and the page says
    which. An unknown slug scopes to nothing rather than to something wrong -
    a page about finance quietly showing gambling publishers is worse than one
    showing the whole marketplace, because only the second is obvious.
  */
  const niche =
    page.record.template === 'niche' ? readNiche(content.text('marketplace', 'niche')) : undefined;

  const preview = await websiteService.getPublicPreview(6, niche);

  if (page.record.template === 'niche') {
    return (
      <NicheLandingPage
        content={content}
        preview={preview.rows}
        listingCount={preview.totalWebsites}
        highlightIcons={highlightIcons}
        path={`/${slug}`}
        breadcrumbLabel={page.record.label}
        breadcrumbParent={{ label: 'Link Building', href: '/link-building' }}
        extra={<PageSections slug={slug} />}
      />
    );
  }

  return (
    <ServicePage
      content={content}
      highlightIcons={highlightIcons}
      preview={preview.rows}
      path={`/${slug}`}
      breadcrumbLabel={page.record.label}
      extra={<PageSections slug={slug} />}
    />
  );
}

/** A category slug an editor typed, or nothing. Never something else. */
function readNiche(raw: string): NicheSlug | undefined {
  const slug = raw.trim().toLowerCase();
  return acceptedNiches.some((niche) => niche.slug === slug) ? (slug as NicheSlug) : undefined;
}
