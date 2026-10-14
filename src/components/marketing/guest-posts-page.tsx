import Link from 'next/link';
import { ArrowRight, Check, FileEdit, Filter, PenTool, Timer, type LucideIcon } from 'lucide-react';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { Faq, type FaqItem } from '@/components/shared/faq';
import { Reveal } from '@/components/cms/reveal';
import { RichText, type RichTextValue } from '@/lib/cms/rich-text-render';
import { RedactedPreview } from '@/components/marketplace/redacted-preview';
import { MarketplaceDemo } from '@/components/guest-posts/marketplace-demo';
import { HowItWorks, type HowItWorksStep } from '@/components/guest-posts/how-it-works';
import { MetricsShowcase } from '@/components/guest-posts/metrics-showcase';
import { siteUrl } from '@/lib/config/brand';
import type { ContentAccessors } from '@/lib/cms/resolve';
import type { PreviewRow } from '@/lib/services/marketplace-preview';

/**
 * /guest-posts.
 *
 * Its own composition rather than the shared `ServicePage`, which still
 * renders /link-building, /niche-edits, /digital-pr and
 * /link-building-agencies untouched. Redesigning the template would have
 * redesigned five pages, four of which nobody asked about.
 *
 * ## What is kept
 *
 * Everything the old page said. The same breadcrumb and its JSON-LD, the
 * same `h1`, intro, buttons and microcopy, the same four highlights, the same
 * redacted inventory preview and its filter checklist, all four body sections
 * with their internal links to /niche-edits and the rest, the related panel,
 * the FAQ and its JSON-LD, and the dark closing CTA. The order has changed
 * and two sections are new; nothing was dropped to make room.
 *
 * ## Where the animation is, and where it is not
 *
 * Motion drives three things, and all three are *the point of the thing being
 * animated*: the marketplace demonstrating its own sequence, three process
 * cards arriving in order, and four metrics drawing themselves. Everything
 * else that moves on this page is `Reveal` - the site's existing
 * IntersectionObserver plus two CSS properties - because a section simply
 * fading in as you reach it does not need an animation library, and `Reveal`
 * has a property Motion's `whileInView` does not: it never hides anything
 * unless JavaScript has run, so the copy on this page is visible to a crawler
 * and to anyone whose bundle failed.
 *
 * That matters more here than anywhere. This page exists to rank for "buy
 * guest posts"; an animation that hid its own body text would be an
 * expensive way to lose the thing it was built for.
 */

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
interface Highlight extends Record<string, unknown> {
  title: string;
  body: string;
}

/** Fixed in code. Editors change copy, not composition. */
const HIGHLIGHT_ICONS: LucideIcon[] = [Filter, PenTool, FileEdit, Timer];

/** The filters the marketplace actually offers, listed beside the preview. */
const FILTERS = [
  'Domain Rating',
  'Organic Traffic',
  'Referring Domains',
  'Country',
  'Niche',
  'Price',
  'Turnaround',
  'Link Type',
];

export function GuestPostsPage({
  content,
  preview,
}: {
  content: ContentAccessors;
  preview: PreviewRow[];
}) {
  const highlights = content.list<Highlight>('highlights', 'items');
  const bodySections = content.list<BodySection>('body', 'sections');
  const related = content.list<RelatedEntry>('related', 'items');
  const steps = content.list<HowItWorksStep>('howItWorks', 'items');

  const faqs: FaqItem[] = content
    .list<FaqEntry>('faqs', 'items')
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
      { '@type': 'ListItem', position: 2, name: 'Guest posts', item: `${siteUrl}/guest-posts` },
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
      {/* Only where the questions and answers are genuinely on the page,
          which is what the current guidelines require. */}
      {faqs.length ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
        />
      ) : null}

      {/* ------------------------------------------------------------ hero */}
      <section className="relative overflow-hidden border-b border-line bg-white">
        {/*
          One soft wash of brand colour behind the left half, and nothing
          else. The panel on the right is the thing to look at; a second
          decorative element would be competing with it.
        */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(48rem 26rem at 8% -8%, rgba(16,185,129,0.10) 0%, transparent 58%)',
          }}
        />

        <Container size="wide" className="relative py-12 lg:py-20">
          <nav aria-label="Breadcrumb" className="mb-6">
            <ol className="flex items-center gap-2 text-[12px] text-muted">
              <li>
                <Link href="/" className="hover:text-ink">
                  Home
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li className="text-ink-soft">Guest posts</li>
            </ol>
          </nav>

          <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,34rem)] lg:gap-14">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold tracking-[0.12em] text-accent-700 uppercase">
                {content.text('hero', 'eyebrow')}
              </p>
              <h1 className="mt-4 text-[2.25rem] leading-[1.08] font-semibold tracking-tight text-ink sm:text-5xl">
                {content.text('hero', 'title')}
              </h1>
              <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-muted lg:text-[17px]">
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

            {/*
              Second in the DOM, so a screen reader and a crawler both reach
              the headline first, and so the panel is below the copy on a
              phone rather than above it. `aria-hidden` on the panel itself:
              it is a moving picture of a screen described in full by the
              words beside it.
            */}
            <div className="min-w-0">
              <MarketplaceDemo />
              <p className="mt-3 text-center text-[12px] text-muted">
                A demonstration of the marketplace, using example publishers.{' '}
                <Link href="/marketplace" className="font-medium text-accent-700 hover:underline">
                  Browse the real inventory
                </Link>
                .
              </p>
            </div>
          </div>
        </Container>
      </section>

      {/* ------------------------------------------------------ highlights */}
      {highlights.length ? (
        <section className="border-b border-line bg-white">
          <Container size="wide" className="py-12 lg:py-16">
            <Reveal animation={{ entrance: 'stagger', speed: 'subtle', delay: 'none' }}>
              <div data-reveal-items="" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {highlights.map((highlight, index) => {
                  const Icon = HIGHLIGHT_ICONS[index % HIGHLIGHT_ICONS.length];
                  return (
                    <div
                      key={highlight.title || index}
                      className="rounded-[var(--radius-card)] border border-line bg-white p-5 transition-colors duration-200 hover:border-line-strong"
                    >
                      {Icon ? (
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-50 text-accent-700">
                          <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                        </span>
                      ) : null}
                      <h2 className="mt-4 text-[15px] font-semibold text-ink">{highlight.title}</h2>
                      <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
                        {highlight.body}
                      </p>
                    </div>
                  );
                })}
              </div>
            </Reveal>
          </Container>
        </section>
      ) : null}

      {/* ---------------------------------------------------- how it works */}
      {steps.length ? (
        <section className="border-b border-line bg-surface">
          <Container size="wide" className="py-14 lg:py-20">
            <Reveal animation={{ entrance: 'fade-up', speed: 'subtle', delay: 'none' }}>
              <div className="max-w-2xl">
                <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-[2rem] sm:leading-tight">
                  {content.text('howItWorks', 'heading')}
                </h2>
                <p className="mt-4 text-[15px] leading-relaxed text-muted">
                  {content.text('howItWorks', 'intro')}
                </p>
              </div>
            </Reveal>

            <HowItWorks steps={steps} />
          </Container>
        </section>
      ) : null}

      {/* -------------------------------------------------------- metrics */}
      <section className="border-b border-line bg-white">
        <Container size="wide" className="py-14 lg:py-20">
          <Reveal animation={{ entrance: 'fade-up', speed: 'subtle', delay: 'none' }}>
            <div className="max-w-2xl">
              <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-[2rem] sm:leading-tight">
                {content.text('metrics', 'heading')}
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-muted">
                {content.text('metrics', 'intro')}
              </p>
            </div>
          </Reveal>

          <div className="mt-10">
            <MetricsShowcase />
          </div>

          <p className="mt-4 text-[12px] text-muted">{content.text('metrics', 'caption')}</p>
        </Container>
      </section>

      {/* -------------------------------------------------------- preview */}
      {preview.length ? (
        <section className="border-b border-line bg-surface">
          <Container size="wide" className="py-14 lg:py-20">
            <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-14">
              <Reveal animation={{ entrance: 'fade-up', speed: 'subtle', delay: 'none' }}>
                <div className="min-w-0">
                  <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-[2rem] sm:leading-tight">
                    {content.text('preview', 'heading')}
                  </h2>
                  <p className="mt-4 text-[15px] leading-relaxed text-muted">
                    {content.text('preview', 'body')}
                  </p>
                  <ul className="mt-6 grid gap-2.5 sm:grid-cols-2">
                    {FILTERS.map((filter) => (
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
              </Reveal>

              <div className="min-w-0">
                <RedactedPreview rows={preview} />
              </div>
            </div>
          </Container>
        </section>
      ) : null}

      {/* ----------------------------------------------- the body, and SEO */}
      <section className="border-b border-line bg-white">
        <Container size="wide" className="py-14 lg:py-20">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] lg:gap-16">
            <div className="min-w-0 max-w-2xl space-y-12">
              {bodySections.map((bodySection, index) => (
                <Reveal
                  key={bodySection.heading || index}
                  animation={{ entrance: 'fade-up', speed: 'subtle', delay: 'none' }}
                >
                  <article>
                    <h2 className="text-[1.375rem] font-semibold tracking-tight text-ink sm:text-2xl">
                      {bodySection.heading}
                    </h2>
                    <div className="mt-4">
                      <RichText source={bodySection.content} />
                    </div>
                  </article>
                </Reveal>
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

      {/* ------------------------------------------------------------ FAQ */}
      {faqs.length ? (
        <section className="border-b border-line bg-surface">
          <Container size="wide" className="py-14 lg:py-20">
            <div className="mx-auto max-w-3xl">
              <Faq items={faqs} />
            </div>
          </Container>
        </section>
      ) : null}

      {/* ------------------------------------------------------------ CTA */}
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
