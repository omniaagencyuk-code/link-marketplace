import type { Metadata } from 'next';
import { Container } from '@/components/layout/container';
import { Hero } from '@/components/home/hero';
import { MarketplaceSection } from '@/components/home/marketplace-section';
import { ServicesGrid } from '@/components/home/services-grid';
import { WhyPressParrot } from '@/components/home/why-press-parrot';
import { PlatformFeatures } from '@/components/home/platform-features';
import { HowItWorks } from '@/components/home/how-it-works';
import { AgenciesSection } from '@/components/home/agencies-section';
import { SeoEditorial } from '@/components/home/seo-editorial';
import { NicheGrid } from '@/components/home/niche-grid';
import { TrustedBy } from '@/components/home/trusted-by';
import { FinalCta } from '@/components/home/final-cta';
import { Faq } from '@/components/shared/faq';
import { websiteService } from '@/lib/services';
import { homepageFaqs } from '@/lib/config/faqs';
import { brand, siteUrl } from '@/lib/config/brand';

/**
 * The homepage.
 *
 * The main SEO and conversion page for the business rather than a marketplace
 * catalogue. Every marketplace figure on it is an aggregate, and the preview
 * rows are redacted in the service layer, so no publisher is identifiable from
 * the HTML, the RSC payload or the structured data.
 */

export const metadata: Metadata = {
  // `absolute` skips the root template, which would otherwise append the brand
  // name a second time.
  title: { absolute: `Link Building Services | ${brand.name}` },
  description:
    'Link building services built around a marketplace of thousands of vetted publishers. Order guest posts, niche edits, digital PR and SEO content with real metrics and upfront pricing.',
  alternates: { canonical: '/' },
};

export default async function HomePage() {
  const [preview, nicheCounts] = await Promise.all([
    websiteService.getPublicPreview(5),
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

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: homepageFaqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        // Structured data is static and generated from the brand config. It
        // describes the company only - never the marketplace inventory.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organisationJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <Hero preview={preview.rows} />
      <MarketplaceSection preview={preview} />
      <ServicesGrid />
      <WhyPressParrot />
      <PlatformFeatures />
      <HowItWorks />
      <AgenciesSection />
      <NicheGrid counts={nicheCounts} />
      <SeoEditorial />

      <section className="border-b border-line bg-surface">
        <Container size="wide" className="py-14 lg:py-20">
          <div className="mx-auto max-w-3xl">
            <Faq items={homepageFaqs} />
          </div>
        </Container>
      </section>

      <TrustedBy />
      <FinalCta />
    </>
  );
}
