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
import { Faq, type FaqItem } from '@/components/shared/faq';
import { websiteService } from '@/lib/services';
import { pageContentService } from '@/lib/services/page-content-service';
import { metadataForPage } from '@/lib/cms/metadata';
import { brand, siteUrl } from '@/lib/config/brand';

/**
 * The homepage.
 *
 * The main SEO and conversion page for the business rather than a marketplace
 * catalogue. Every word is editable through /admin/pages; every marketplace
 * figure on it is an aggregate, and the preview rows are redacted in the
 * service layer, so no publisher is identifiable from the HTML, the RSC
 * payload or the structured data.
 */

const SLUG = 'home';

export async function generateMetadata(): Promise<Metadata> {
  const meta = await metadataForPage(SLUG);
  // `absolute` skips the root template, which would otherwise append the brand
  // name a second time.
  return { ...meta, title: { absolute: `${meta.title as string} | ${brand.name}` } };
}

export default async function HomePage() {
  const [content, preview, nicheCounts] = await Promise.all([
    pageContentService.content(SLUG),
    websiteService.getPublicPreview(5),
    websiteService.countByNiche(),
  ]);

  const faqs = content
    .list<{ question: string; answer: string }>('faqs', 'items')
    .filter((entry) => entry.question && entry.answer) as FaqItem[];

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
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        // Describes the company only - never the marketplace inventory.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organisationJsonLd) }}
      />
      {faqs.length ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
        />
      ) : null}

      <Hero content={content} preview={preview.rows} />
      <MarketplaceSection content={content} preview={preview} />
      <ServicesGrid content={content} />
      <WhyPressParrot content={content} />
      <PlatformFeatures content={content} />
      <HowItWorks content={content} />
      <AgenciesSection content={content} />
      <NicheGrid counts={nicheCounts} />
      <SeoEditorial content={content} />

      {faqs.length ? (
        <section className="border-b border-line bg-surface">
          <Container size="wide" className="py-14 lg:py-20">
            <div className="mx-auto max-w-3xl">
              <Faq items={faqs} />
            </div>
          </Container>
        </section>
      ) : null}

      <TrustedBy />
      <FinalCta />
    </>
  );
}
