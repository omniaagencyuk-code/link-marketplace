import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Check, FileText, Languages, Search, Users } from 'lucide-react';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { Faq } from '@/components/shared/faq';
import { MonsteraLeaf } from '@/components/shared/foliage';
import { HandwrittenNote } from '@/components/shared/handwritten';
import { RichText, type RichTextValue } from '@/lib/cms/rich-text-render';
import { metadataForPage } from '@/lib/cms/metadata';
import { pageContentService } from '@/lib/services/page-content-service';
import { settingsService } from '@/lib/services';
import { isPricingConfigured, pricingTable } from '@/lib/services/content-pricing';
import { contentTypes, wordCountOptions } from '@/lib/config/content';
import { formatPrice } from '@/lib/utils/format';
import { brand, siteUrl } from '@/lib/config/brand';

/**
 * Public content writing service page.
 *
 * Has its own layout rather than the shared `ServicePage` because pricing is
 * the centre of it, and prices come from settings rather than from copy. That
 * split is the point: an editor owns every word here, but not the numbers -
 * those come from the same place the order form charges from, so the page
 * cannot quote a price the checkout does not honour. When no price has been
 * configured the table shows "on request" rather than inventing one.
 */

const SLUG = 'content-writing';

/** Icons are fixed in code - editors change copy, not composition. */
const highlightIcons = [Search, Users, FileText, Languages];

interface HighlightEntry extends Record<string, unknown> {
  title: string;
  body: string;
}
interface StepEntry extends Record<string, unknown> {
  step: string;
  title: string;
  body: string;
}
interface IncludeEntry extends Record<string, unknown> {
  text: string;
}
interface BodyEntry extends Record<string, unknown> {
  heading: string;
  content: RichTextValue;
}
interface FaqEntry extends Record<string, unknown> {
  question: string;
  answer: string;
}

export async function generateMetadata(): Promise<Metadata> {
  return metadataForPage(SLUG);
}

export default async function ContentWritingPage() {
  const [content, settings] = await Promise.all([
    pageContentService.content(SLUG),
    settingsService.get(),
  ]);

  const pricing = settings.contentPricing;
  const configured = isPricingConfigured(pricing);
  const rows = pricingTable(pricing, [500, 1000, 1500, 2000]);

  const highlights = content.list<HighlightEntry>('highlights', 'items');
  const steps = content.list<StepEntry>('steps', 'items');
  const includes = content.list<IncludeEntry>('steps', 'includes');
  const bodySections = content.list<BodyEntry>('body', 'sections');
  const faqs = content
    .list<FaqEntry>('faqs', 'items')
    .filter((entry) => entry.question && entry.answer);

  const heroPrimary = content.link('hero', 'primaryCta');
  const heroSecondary = content.link('hero', 'secondaryCta');
  const stepsCta = content.link('steps', 'cta');
  const ctaPrimary = content.link('cta', 'primaryCta');
  const ctaSecondary = content.link('cta', 'secondaryCta');

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: siteUrl },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Content writing',
        item: `${siteUrl}/content-writing`,
      },
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
              <li className="text-ink-soft">Content writing</li>
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
                <Link href={heroPrimary.href}>
                  {heroPrimary.label}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href={heroSecondary.href}>{heroSecondary.label}</Link>
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
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-50 text-accent-700">
                      <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                    </span>
                    <h2 className="mt-4 text-[15px] font-semibold text-ink">{highlight.title}</h2>
                    <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{highlight.body}</p>
                  </div>
                );
              })}
            </div>
          </Container>
        </section>
      ) : null}

      <section className="border-b border-line bg-surface" aria-labelledby="content-types">
        <Container size="wide" className="py-14 lg:py-20">
          <div className="max-w-2xl">
            <h2
              id="content-types"
              className="text-2xl font-semibold tracking-tight text-ink sm:text-[2rem] sm:leading-tight"
            >
              {content.text('types', 'heading')}
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">
              {content.text('types', 'intro')}
            </p>
          </div>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {contentTypes
              .filter((type) => type.slug !== 'other')
              .map((type) => (
                <article
                  key={type.slug}
                  className="rounded-[var(--radius-card)] border border-line bg-white p-6 shadow-[var(--shadow-card)]"
                >
                  <h3 className="text-[16px] font-semibold text-ink">{type.label}</h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-muted">{type.description}</p>
                  <p className="mt-4 text-[12px] font-medium text-accent-700">{type.typicalWords}</p>
                </article>
              ))}
          </div>
        </Container>
      </section>

      <section className="border-b border-line bg-white" aria-labelledby="pricing">
        <Container size="wide" className="py-14 lg:py-20">
          <div className="max-w-2xl">
            <h2
              id="pricing"
              className="text-2xl font-semibold tracking-tight text-ink sm:text-[2rem] sm:leading-tight"
            >
              {content.text('pricing', 'heading')}
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">
              {configured
                ? content.text('pricing', 'introConfigured')
                : content.text('pricing', 'introUnset')}
            </p>
          </div>

          <div className="mt-8 grid max-w-3xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {rows.map((row) => (
              <div
                key={row.words}
                className="rounded-[var(--radius-card)] border border-line bg-surface p-5"
              >
                <p className="text-[13px] font-medium text-muted">
                  {row.words.toLocaleString(brand.locale)} words
                </p>
                <p className="mt-1.5 text-xl font-semibold tracking-tight text-ink">
                  {row.priceMinor === null
                    ? 'On request'
                    : formatPrice(row.priceMinor, { currency: settings.currency })}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-6 max-w-3xl rounded-[var(--radius-card)] border border-line bg-surface p-5">
            <p className="text-[13px] font-medium text-muted">
              {content.text('pricing', 'customHeading')}
            </p>
            <p className="mt-1.5 text-[15px] text-ink">{content.text('pricing', 'customBody')}</p>
          </div>

          <p className="mt-4 text-[13px] text-muted">
            Available lengths:{' '}
            {wordCountOptions.map((words) => words.toLocaleString(brand.locale)).join(', ')} or
            custom.
          </p>
        </Container>
      </section>

      <section className="border-b border-line bg-surface" id="how-it-works">
        <Container size="wide" className="py-14 lg:py-20">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-16">
            <div className="min-w-0 max-w-2xl">
              <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-[2rem] sm:leading-tight">
                {content.text('steps', 'heading')}
              </h2>

              <ol className="mt-8 space-y-7">
                {steps.map((entry, index) => (
                  <li key={entry.title || index} className="flex gap-5">
                    <span className="text-[13px] font-semibold text-accent-600 tabular">
                      {entry.step}
                    </span>
                    <div>
                      <h3 className="text-[16px] font-semibold text-ink">{entry.title}</h3>
                      <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{entry.body}</p>
                    </div>
                  </li>
                ))}
              </ol>

              {stepsCta.label ? (
                <Button asChild variant="accent" size="lg" className="mt-9">
                  <Link href={stepsCta.href}>
                    {stepsCta.label}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
              ) : null}
            </div>

            {includes.length ? (
              <aside className="lg:pt-4">
                {content.text('steps', 'annotation') ? (
                  <HandwrittenNote arrow="down-right" className="mb-4 hidden lg:block">
                    {content.text('steps', 'annotation')}
                  </HandwrittenNote>
                ) : null}
                <div className="rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)]">
                  <h2 className="text-[13px] font-semibold tracking-wide text-ink uppercase">
                    {content.text('steps', 'includesHeading')}
                  </h2>
                  <ul className="mt-4 space-y-2.5">
                    {includes.map((item, index) => (
                      <li
                        key={item.text || index}
                        className="flex gap-2.5 text-[14px] leading-relaxed text-ink-soft"
                      >
                        <Check
                          className="mt-0.5 h-4 w-4 shrink-0 text-accent-600"
                          aria-hidden="true"
                        />
                        {item.text}
                      </li>
                    ))}
                  </ul>
                </div>
              </aside>
            ) : null}
          </div>
        </Container>
      </section>

      {bodySections.length ? (
        <section className="border-b border-line bg-white">
          <Container size="wide" className="py-14 lg:py-20">
            <div className="mx-auto max-w-3xl space-y-10">
              {bodySections.map((entry, index) => (
                <article key={entry.heading || index}>
                  <h2 className="text-[1.375rem] font-semibold tracking-tight text-ink sm:text-2xl">
                    {entry.heading}
                  </h2>
                  <div className="mt-4">
                    <RichText source={entry.content} />
                  </div>
                </article>
              ))}
            </div>
          </Container>
        </section>
      ) : null}

      {faqs.length ? (
        <section className="border-b border-line bg-surface">
          <Container size="wide" className="py-14 lg:py-20">
            <div className="mx-auto max-w-3xl">
              <Faq
                items={faqs.map((entry) => ({ question: entry.question, answer: entry.answer }))}
              />
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
