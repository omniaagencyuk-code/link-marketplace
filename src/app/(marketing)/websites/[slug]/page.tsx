import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Container } from '@/components/layout/container';
import { WebsiteHeader } from '@/components/website/website-header';
import { WebsiteMetrics } from '@/components/website/website-metrics';
import { WebsiteSections } from '@/components/website/website-sections';
import { OrderCard } from '@/components/website/order-card';
import { RelatedWebsites } from '@/components/website/related-websites';
import { websiteService } from '@/lib/services';
import { nicheName } from '@/lib/data/categories';
import { countryName } from '@/lib/data/countries';
import { formatPrice } from '@/lib/utils/format';
import { brand, siteUrl } from '@/lib/config/brand';

interface PageProps {
  params: Promise<{ slug: string }>;
}

/** Pre-render every active listing at build time. */
export async function generateStaticParams() {
  const slugs = await websiteService.getSlugs();
  return slugs.map((slug) => ({ slug }));
}

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
    alternates: { canonical: `/websites/${website.slug}` },
    openGraph: {
      title: `${website.domain} | ${brand.name}`,
      description,
      url: `${siteUrl}/websites/${website.slug}`,
      type: 'article',
    },
  };
}

export default async function WebsiteDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const website = await websiteService.getBySlug(slug);
  if (!website || website.status === 'archived') notFound();

  const related = await websiteService.getRelated(slug, 4);
  const lowest = Math.min(...website.services.map((service) => service.priceMinor));

  const productJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `${website.domain} link placement`,
    description: website.description,
    category: nicheName(website.niche),
    brand: { '@type': 'Brand', name: brand.name },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: website.rating,
      reviewCount: website.completedOrders,
    },
    offers: website.services.map((service) => ({
      '@type': 'Offer',
      name: service.type,
      price: (service.priceMinor / 100).toFixed(2),
      priceCurrency: brand.currency,
      availability: service.available
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      url: `${siteUrl}/websites/${website.slug}`,
    })),
    lowPrice: (lowest / 100).toFixed(2),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
      />
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

        <RelatedWebsites websites={related} niche={website.niche} />
      </Container>
    </>
  );
}
