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
import { TrustMetrics } from '@/components/home/trust-metrics';
import { PageSections } from '@/components/cms/page-sections';
import { Reveal } from '@/components/cms/reveal';
import {
  ChecklistSection,
  ComparisonSection,
  MarketplaceSearchSection,
  ParrotSaysSection,
} from '@/components/cms/sections';
import { MetricCards } from '@/components/home/metric-cards';
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
  const [content, preview, nicheCounts, stats] = await Promise.all([
    pageContentService.content(SLUG),
    websiteService.getPublicPreview(5),
    websiteService.countByNiche(),
    // Aggregates through a security-definer function: three numbers, no row
    // it could leak a domain from. The hero and the trust row both read it,
    // and it is fetched once for both.
    websiteService.getStats(),
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

      {/*
        The order the page argues in: what this is, that it is real, what is
        in it, how it works, what it looks like inside - then the reading for
        anybody not ready to act, and the ask.

        The trust row used to sit inside the hero and the logos at the very
        bottom, which put the evidence for the claim four screens below the
        claim. They are one band under the hero now.
      */}
      <Hero content={content} stats={stats} />

      <section className="border-b border-line bg-surface">
        <Container size="wide" className="py-10">
          <TrustedBy />
          <div className="mt-8">
            <TrustMetrics content={content} stats={stats} />
          </div>
        </Container>
      </section>

      <NicheGrid counts={nicheCounts} />
      <HowItWorks content={content} />
      <MarketplaceSection content={content} preview={preview} />
      <WhyPressParrot content={content} />
      <ServicesGrid content={content} />
      <PlatformFeatures content={content} />
      <AgenciesSection content={content} />

      {/*
        The editorial half, broken up rather than run together.

        A three-thousand-word block is a wall nobody reads and a page nobody
        scrolls. The prose alternates with something to look at: an aside, two
        lists side by side, a checklist, the metric cards. The components are
        the ones from the section library, fed from this page's own CMS fields
        - so they are editable here and identical to the ones an admin can add
        further down.
      */}
      <SeoEditorial content={content} />

      <Reveal animation={{ entrance: 'slide-right', speed: 'subtle', delay: 'none' }}>
        <ParrotSaysSection
          values={{
            label: content.text('parrotSays', 'label'),
            body: content.text('parrotSays', 'body'),
          }}
          variant="accent"
          sectionId="home-parrot-says"
          data={{ page: {} }}
        />
      </Reveal>

      <MarketplaceSearchSection
        values={{
          heading: content.text('search', 'heading'),
          body: content.text('search', 'body'),
          placeholder: content.text('search', 'placeholder'),
          cta: content.link('search', 'cta'),
          note: content.text('search', 'note'),
        }}
        variant="default"
        sectionId="home-search"
        data={{ page: {} }}
      />

      <ComparisonSection
        values={{
          heading: content.text('comparison', 'heading'),
          body: content.text('comparison', 'body'),
          goodTitle: content.text('comparison', 'goodTitle'),
          good: content.list('comparison', 'good'),
          badTitle: content.text('comparison', 'badTitle'),
          bad: content.list('comparison', 'bad'),
        }}
        variant="default"
        sectionId="home-comparison"
        data={{ page: {} }}
      />

      <Reveal animation={{ entrance: 'stagger', speed: 'normal', delay: 'none' }}>
        <ChecklistSection
          values={{
            heading: content.text('checklist', 'heading'),
            body: content.text('checklist', 'body'),
            items: content.list('checklist', 'items'),
          }}
          variant="default"
          sectionId="home-checklist"
          data={{ page: {} }}
        />
      </Reveal>

      <MetricCards content={content} />

      {/*
        Anything built in the admin, between the editorial and the questions.

        This is where the homepage grows without a deploy: comparison blocks,
        checklists, metric cards, a parrot aside. It renders nothing until
        somebody adds a section, so today it changes nothing at all.
      */}
      <PageSections slug={SLUG} />

      {faqs.length ? (
        <section className="border-b border-line bg-surface">
          <Container size="wide" className="py-14 lg:py-20">
            <div className="mx-auto max-w-3xl">
              <Faq items={faqs} />
            </div>
          </Container>
        </section>
      ) : null}

      <FinalCta />
    </>
  );
}
