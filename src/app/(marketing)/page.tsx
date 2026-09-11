import type { Metadata } from 'next';
import { Hero } from '@/components/home/hero';
import { TrustStrip } from '@/components/home/trust-strip';
import { FeaturedWebsites } from '@/components/home/featured-websites';
import { HowItWorksSection } from '@/components/home/how-it-works-section';
import { CtaSection } from '@/components/home/cta-section';
import { websiteService } from '@/lib/services';
import { brand, siteUrl } from '@/lib/config/brand';

export const metadata: Metadata = {
  title: `${brand.name} | ${brand.tagline}`,
  description: brand.description,
  alternates: { canonical: '/' },
};

export default async function HomePage() {
  const [featured, heroRows] = await Promise.all([
    websiteService.getFeatured(6),
    websiteService.getFeatured(5),
  ]);

  const organisationJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: brand.name,
    url: siteUrl,
    email: brand.supportEmail,
    description: brand.description,
    address: {
      '@type': 'PostalAddress',
      streetAddress: brand.company.addressLines[0],
      addressLocality: brand.company.addressLines[1],
      postalCode: brand.company.addressLines[2],
      addressCountry: 'GB',
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        // Structured data is static and generated from the brand config.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organisationJsonLd) }}
      />
      <Hero websites={heroRows} />
      <TrustStrip />
      <FeaturedWebsites websites={featured} />
      <HowItWorksSection />
      <CtaSection />
    </>
  );
}
