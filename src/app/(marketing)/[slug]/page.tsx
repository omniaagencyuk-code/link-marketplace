import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BadgeCheck, Gauge, Receipt, Workflow } from 'lucide-react';
import { ServicePage } from '@/components/marketing/service-page';
import { NicheLandingPage } from '@/components/marketing/niche-landing-page';
import { PageSections } from '@/components/cms/page-sections';
import { categories } from '@/lib/data/categories';
import type { NicheSlug } from '@/lib/types';
import { contentAccessors } from '@/lib/cms/resolve';
import { customPageService } from '@/lib/services/custom-page-service';
import { websiteService } from '@/lib/services';
import { brand, siteUrl } from '@/lib/config/brand';
import { isPreview } from '@/lib/cms/preview';

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

export const dynamic = "force-dynamic";

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
  const title = content.text("seo", "metaTitle") || page.record.label;
  const description = content.text("seo", "metaDescription");
  const ogImage = content.image("seo", "ogImage");

  return {
    title,
    description,
    alternates: { canonical: `/${slug}` },
    openGraph: {
      title: `${title} | ${brand.name}`,
      description,
      url: `${siteUrl}/${slug}`,
      ...(ogImage.src
        ? { images: [{ url: ogImage.src, alt: ogImage.alt }] }
        : {}),
    },
  };
}

export default async function CustomPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const draft = await isPreview(searchParams);

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
    page.record.template === "niche"
      ? readNiche(content.text("marketplace", "niche"))
      : undefined;

  const preview = await websiteService.getPublicPreview(6, niche);

  if (page.record.template === "niche") {
    // Sections are the page; the template renders while it has none. The
    // category, the breadcrumb and the path are page-level configuration, so
    // no section on it has to be told which niche it is about.
    return (
      <PageSections
        slug={slug}
        config={{
          niche,
          label: page.record.label,
          path: `/${slug}`,
          breadcrumbParent: { label: "Link Building", href: "/link-building" },
        }}
        provided={{
          preview: preview.rows,
          listingCount: preview.totalWebsites,
        }}
        draft={draft}
        fallback={
          <NicheLandingPage
            content={content}
            preview={preview.rows}
            listingCount={preview.totalWebsites}
            highlightIcons={highlightIcons}
            path={`/${slug}`}
            breadcrumbLabel={page.record.label}
            breadcrumbParent={{
              label: "Link Building",
              href: "/link-building",
            }}
          />
        }
      />
    );
  }

  /*
    Sections are the page, and the template is what it renders until it has
    any - the same arrangement the niche template above already uses.

    It used to pass `<PageSections>` as `extra`, which rendered the whole
    template and then appended the page's sections to the bottom of it. A hero
    added in the builder therefore sat first in the section list and halfway
    down the page, under a hero the template had already drawn. The page had
    two shapes at once and the code's won, which is the thing the builder
    exists to stop.
  */
  return (
    <PageSections
      slug={slug}
      config={{ label: page.record.label, path: `/${slug}` }}
      provided={{ preview: preview.rows, listingCount: preview.totalWebsites }}
      draft={draft}
      fallback={
        <ServicePage
          content={content}
          highlightIcons={highlightIcons}
          preview={preview.rows}
          path={`/${slug}`}
          breadcrumbLabel={page.record.label}
        />
      }
    />
  );
}

/**
 * A category slug an editor typed, or nothing. Never something else.
 *
 * Checked against the marketplace's categories, which is the list the
 * marketplace filters on. It was checked against `acceptedNiches` - what a
 * publisher will carry, a different list for a different job - so "igaming",
 * the slug the field's own help text gives as the example, was not a
 * category and the page silently showed everything.
 */
function readNiche(raw: string): NicheSlug | undefined {
  const slug = raw.trim().toLowerCase();
  return categories.some((category) => category.slug === slug)
    ? (slug as NicheSlug)
    : undefined;
}
