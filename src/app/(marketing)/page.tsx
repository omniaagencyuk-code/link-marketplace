import type { Metadata } from 'next';
import { Hero } from '@/components/home/hero';
import { FeatureStrip } from '@/components/home/feature-strip';
import { TrustedBy } from '@/components/home/trusted-by';
import { HowItWorks } from '@/components/home/how-it-works';
import { NicheGrid } from '@/components/home/niche-grid';
import { FinalCta } from '@/components/home/final-cta';
import { websiteService } from '@/lib/services';
import { brand, siteUrl } from '@/lib/config/brand';

export const metadata: Metadata = {
  // `absolute` skips the root template, which would otherwise append the brand
  // name a second time.
  title: { absolute: `${brand.name} | ${brand.tagline}` },
  description: brand.description,
  alternates: { canonical: '/' },
};

export default async function HomePage() {
  const [featured, nicheCounts] = await Promise.all([
    websiteService.getFeatured(5),
    websiteService.countByNiche(),
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
      <Hero websites={featured} />
      <FeatureStrip />
      <TrustedBy />
      <HowItWorks />
      <NicheGrid counts={nicheCounts} />
      <FinalCta />
    </>
  );
}
