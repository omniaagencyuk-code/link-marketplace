import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { Faq, type FaqItem } from '@/components/shared/faq';
import { RedactedPreview } from '@/components/marketplace/redacted-preview';
import { MonsteraLeaf } from '@/components/shared/foliage';
import { RichText, type RichTextValue } from '@/lib/cms/rich-text-render';
import { siteUrl } from '@/lib/config/brand';
import type { ContentAccessors } from '@/lib/cms/resolve';
import type { PreviewRow } from '@/lib/services/marketplace-preview';

/**
 * Shared layout for the public service pages.
 *
 * Every word on the page comes from the CMS content passed in, with the
 * shipped defaults as the fallback - see `lib/cms`. The layout, spacing and
 * icons stay in code deliberately: editors change copy, not composition, which
 * is what keeps six pages looking like one product.
 */

export interface ServicePageProps {
  content: ContentAccessors;
  /** Icons for the value points, positionally matched. Not editable. */
  highlightIcons: LucideIcon[];
  /** Redacted rows, when the page shows the marketplace. */
  preview?: PreviewRow[];
  /** Canonical path, used for the breadcrumb structured data. */
  path: string;
  /** Breadcrumb label. */
  breadcrumbLabel: string;
}

interface HighlightItem extends Record<string, unknown> {
  title: string;
  body: string;
}
interface BodySection extends Record<string, unknown> {
  heading: string;
  /** Markdown as shipped, or an edited document. `RichText` takes either. */
  content: RichTextValue;
}
interface FaqEntry extends Record<string, unknown> {
  question: string;
  answer: string;
}
interface RelatedEntry extends Record<string, unknown> {
  label: string;
  href: string;
  description: string;
}

export function ServicePage({
  content,
  highlightIcons,
  preview,
  path,
  breadcrumbLabel,
}: ServicePageProps) {
  const highlights = content.list<HighlightItem>('highlights', 'items');
  const bodySections = content.list<BodySection>('body', 'sections');
  const faqEntries = content.list<FaqEntry>('faqs', 'items');
  const related = content.list<RelatedEntry>('related', 'items');

  const faqs: FaqItem[] = faqEntries
    .filter((entry) => entry.question && entry.answer)
    .map((entry) => ({ question: entry.question, answer: entry.answer }));

  const primaryCta = content.link('hero', 'primaryCta');
  const secondaryCta = content.link('hero', 'secondaryCta');
  const ctaPrimary = content.link('cta', 'primaryCta');
  const ctaSecondary = content.link('cta', 'secondaryCta');

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: siteUrl },
      { '@type': 'ListItem', position: 2, name: breadcrumbLabel, item: `${siteUrl}${path}` },
    ],
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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      {/* FAQ markup only where the questions and answers are genuinely on the
          page, which is what the current guidelines require. */}
      {faqs.length ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
        />
      ) : null}

      <section className="tropical-wash relative overflow-hidden border-b border-line bg-white">
        <MonsteraLeaf className="pointer-events-none absolute -top-16 -right-16 hidden w-72 rotate-[18deg] opacity-25 lg:block" />
        <Container size="wide" className="relative py-12 lg:py-20">
          <nav aria-label="Breadcrumb" className="mb-6">
            <ol className="flex items-center gap-2 text-[12px] text-muted">
              <li>
                <Link href="/" className="hover:text-ink">
                  Home
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li className="text-ink-soft">{breadcrumbLabel}</li>
            </ol>
          </nav>

          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold tracking-[0.12em] text-accent-700 uppercase">
              {content.text('hero', 'eyebrow')}
            </p>
            <h1 className="mt-4 text-[2.25rem] leading-[1.08] font-semibold tracking-tight text-ink sm:text-5xl">
              {content.text('hero', 'title')}
            </h1>
            <p className="mt-5 text-[16px] leading-relaxed text-muted lg:text-[17px]">
              {content.text('hero', 'intro')}
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Button asChild variant="accent" size="lg">
                <Link href={primaryCta.href}>
                  {primaryCta.label}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href={secondaryCta.href}>{secondaryCta.label}</Link>
              </Button>
            </div>

            <p className="mt-4 text-[13px] text-muted">{content.text('hero', 'microcopy')}</p>
          </div>
        </Container>
      </section>

      {highlights.length ? (
        <section className="border-b border-line bg-white">
          <Container size="wide" className="py-12 lg:py-16">
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {highlights.map((highlight, index) => {
                const Icon = highlightIcons[index % highlightIcons.length];
                return (
                  <div key={highlight.title || index}>
                    {Icon ? (
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-50 text-accent-700">
                        <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                      </span>
                    ) : null}
                    <h2 className="mt-4 text-[15px] font-semibold text-ink">{highlight.title}</h2>
                    <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{highlight.body}</p>
                  </div>
                );
              })}
            </div>
          </Container>
        </section>
      ) : null}

      {preview ? (
        <section className="border-b border-line bg-surface">
          <Container size="wide" className="py-14 lg:py-20">
            <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-14">
              <div className="min-w-0">
                <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-[2rem] sm:leading-tight">
                  {content.text('preview', 'heading')}
                </h2>
                <p className="mt-4 text-[15px] leading-relaxed text-muted">
                  {content.text('preview', 'body')}
                </p>
                <ul className="mt-6 grid gap-2.5 sm:grid-cols-2">
                  {[
                    'Domain Rating',
                    'Organic Traffic',
                    'Referring Domains',
                    'Country',
                    'Niche',
                    'Price',
                    'Turnaround',
                    'Link Type',
                  ].map((filter) => (
                    <li key={filter} className="flex items-center gap-2 text-[14px] text-ink-soft">
                      <Check className="h-4 w-4 shrink-0 text-accent-600" aria-hidden="true" />
                      {filter}
                    </li>
                  ))}
                </ul>
                <Button asChild variant="accent" size="lg" className="mt-7">
                  <Link href="/marketplace">
                    Unlock the Marketplace
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
                <p className="mt-3 text-[13px] text-muted">
                  Create a free account to browse publishers and pricing.
                </p>
              </div>

              <div className="min-w-0">
                <RedactedPreview rows={preview} />
              </div>
            </div>
          </Container>
        </section>
      ) : null}

      <section className="border-b border-line bg-white">
        <Container size="wide" className="py-14 lg:py-20">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] lg:gap-16">
            <div className="min-w-0 max-w-2xl space-y-12">
              {bodySections.map((bodySection, index) => (
                <article key={bodySection.heading || index}>
                  <h2 className="text-[1.375rem] font-semibold tracking-tight text-ink sm:text-2xl">
                    {bodySection.heading}
                  </h2>
                  <div className="mt-4">
                    <RichText source={bodySection.content} />
                  </div>
                </article>
              ))}
            </div>

            {related.length ? (
              <aside className="lg:sticky lg:top-24 lg:self-start">
                <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
                  <h2 className="text-[13px] font-semibold tracking-wide text-ink uppercase">
                    Related
                  </h2>
                  <ul className="mt-4 space-y-3">
                    {related.map((item) => (
                      <li key={item.href || item.label}>
                        <Link href={item.href || '/'} className="group block">
                          <span className="block text-[14px] font-semibold text-ink group-hover:text-accent-700">
                            {item.label}
                          </span>
                          <span className="mt-0.5 block text-[13px] leading-snug text-muted">
                            {item.description}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </aside>
            ) : null}
          </div>
        </Container>
      </section>

      {faqs.length ? (
        <section className="border-b border-line bg-surface">
          <Container size="wide" className="py-14 lg:py-20">
            <div className="mx-auto max-w-3xl">
              <Faq items={faqs} />
            </div>
          </Container>
        </section>
      ) : null}

      <section className="bg-navy-950 text-white">
        <Container size="wide" className="py-14 text-center lg:py-20">
          <h2 className="mx-auto max-w-2xl text-2xl font-semibold tracking-tight sm:text-3xl">
            {content.text('cta', 'heading')}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-white/70">
            {content.text('cta', 'body')}
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Button asChild variant="accent" size="lg">
              <Link href={ctaPrimary.href}>
                {ctaPrimary.label}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white"
            >
              <Link href={ctaSecondary.href}>{ctaSecondary.label}</Link>
            </Button>
          </div>
        </Container>
      </section>
    </>
  );
}
