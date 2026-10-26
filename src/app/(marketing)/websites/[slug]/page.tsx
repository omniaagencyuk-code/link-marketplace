import Link from 'next/link';
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
import { spendInventoryRows } from '@/lib/marketplace/budget';
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
  // The country is named only when it is known. A search snippet reading
  // "a sports website in -" is worse than one that never mentions a market.
  const market = website.country ? ` in ${countryName(website.country)}` : '';
  const description = `Buy placements on ${website.domain}, a ${nicheName(
    website.niche,
  ).toLowerCase()} website${market} with DR ${
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
  /*
    Second gate. proxy.ts already redirected signed-out requests; this makes
    the page safe on its own terms if the matcher is ever changed.

    The session itself is no longer wanted - it was read for `viewer.plan`,
    and 0089 removed plans - but the call stays: what it does here is refuse
    a stranger, and its return value was always incidental to that.
  */
  const viewer = await requireCustomerSession(`/websites/${slug}`);

  /*
    Five rows: this listing and the four beside it.

    The same budget the marketplace page spends from, because this is the
    other way to collect the inventory - one listing at a time, which is
    slower per row and invisible if only the bulk screen were counted.

    A refusal says so. It was a 404 for a paragraph: a page that cannot be
    read is not a page that does not exist, and a customer who clicks a site
    they saved last week and is told it is gone will believe us. The slug is
    already in their address bar and they already have an account - there is
    nothing left for a 404 to protect.
  */
  const budget = await spendInventoryRows(viewer, 5);
  if (!budget.allowed) {
    return (
      <Container size="narrow" className="py-20 text-center">
        <h1 className="text-[22px] font-semibold text-ink">This listing is taking a breather</h1>
        <p className="mx-auto mt-3 max-w-md text-[14px] leading-relaxed text-muted">
          {budget.message}
        </p>
        <p className="mt-5 text-[13px] text-muted">
          <Link href="/dashboard/saved" className="font-medium text-accent-700 hover:underline">
            Your saved sites
          </Link>{' '}
          and your orders are unaffected.
        </p>
      </Container>
    );
  }

  const website = await websiteService.getBySlug(slug);
  if (!website || website.status === 'archived') notFound();

  // The listing is already loaded, so it is passed in rather than looked up
  // again - that lookup was the third read of the same row in one request.
  const related = await websiteService.getRelated(website, 4);

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
              <OrderCard website={website} />
            </div>
          </aside>
        </div>

        {/* Nothing to be related by when the listing has no category, and
            `related` is empty in that case anyway - the component is given a
            real niche or not rendered at all. */}
        {website.niche ? (
          <RelatedWebsites websites={related} niche={website.niche} />
        ) : null}
      </Container>
    </>
  );
}
