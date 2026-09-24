import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Container } from '@/components/layout/container';
import { WebsiteHeader } from '@/components/website/website-header';
import { WebsiteMetrics } from '@/components/website/website-metrics';
import { WebsiteSections } from '@/components/website/website-sections';
import { OrderCard } from '@/components/website/order-card';
import { RelatedWebsites } from '@/components/website/related-websites';
import { websiteService } from '@/lib/services';
import { requireCustomerSession } from '@/lib/auth/customer-access';
import { tierFor } from '@/lib/utils/pricing';
import { nicheName } from '@/lib/data/categories';
import { countryName } from '@/lib/data/countries';
import { formatPrice } from '@/lib/utils/format';

interface PageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Listing pages are account-only, so they are rendered per request rather than
 * pre-rendered. Pre-rendering would write every publisher's page to disk as a
 * static asset, which is exactly what the access change is meant to prevent.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const website = await websiteService.getBySlug(slug);
  if (!website) return { title: 'Website not found' };

  const lowest = Math.min(...website.services.map((service) => service.priceMinor));
  const title = `${website.domain} - ${nicheName(website.niche)} guest posts and niche edits`;
  const description = `Buy placements on ${website.domain}, a ${nicheName(
    website.niche,
  ).toLowerCase()} website in ${countryName(website.country)} with DR ${
    website.metrics.domainRating
  } and ${website.metrics.organicTraffic.toLocaleString('en-GB')} monthly organic visits. From ${formatPrice(
    lowest,
  )}.`;

  return {
    title,
    description,
    // Listing pages are private: never indexed, never canonicalised into the
    // public site, and no Open Graph card that would carry the domain into a
    // link preview.
    robots: { index: false, follow: false, nocache: true },
  };
}

export default async function WebsiteDetailPage({ params }: PageProps) {
  const { slug } = await params;
  // Second gate. proxy.ts already redirected signed-out requests; this makes
  // the page safe on its own terms if the matcher is ever changed.
  const viewer = await requireCustomerSession(`/websites/${slug}`);

  const website = await websiteService.getBySlug(slug);
  if (!website || website.status === 'archived') notFound();

  const related = await websiteService.getRelated(slug, 4);

  return (
    <>
      <WebsiteHeader website={website} />

      <Container size="wide" className="py-6 lg:py-8">
        <WebsiteMetrics website={website} />

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="min-w-0">
            <WebsiteSections website={website} />
          </div>

          <aside aria-label="Order this placement" className="lg:order-last">
            <div className="lg:sticky lg:top-20">
              <OrderCard website={website} tier={tierFor(viewer.plan)} />
            </div>
          </aside>
        </div>

        <RelatedWebsites websites={related} niche={website.niche} />
      </Container>
    </>
  );
}
