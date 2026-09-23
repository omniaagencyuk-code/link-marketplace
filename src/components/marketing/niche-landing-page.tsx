import Link from 'next/link';
import { ArrowRight, Check, Lock } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { Faq, type FaqItem } from '@/components/shared/faq';
import { RedactedPreview } from '@/components/marketplace/redacted-preview';
import { MonsteraLeaf } from '@/components/shared/foliage';
import { NicheMascot } from './niche-mascot';
import { Markdown } from '@/lib/cms/markdown';
import { journeySteps } from '@/lib/config/how-it-works';
import { siteUrl } from '@/lib/config/brand';
import { formatNumber } from '@/lib/utils/format';
import type { ContentAccessors } from '@/lib/cms/resolve';
import type { PreviewRow } from '@/lib/services/marketplace-preview';

/**
 * A landing page for one niche of the marketplace.
 *
 * Not a second marketplace, and the distinction runs through the whole
 * component: every route out of here lands on `/marketplace` with a filter
 * already applied, the preview table is the same redacted one the service
 * pages use, and the count comes from the same inventory. A visitor who
 * arrives from Google sees a page about gambling; what they buy from is the
 * marketplace everybody else uses.
 *
 * Copy comes from the CMS, layout stays in code - the same split as
 * `ServicePage`, for the same reason: editors change words, not composition.
 * This is a separate template rather than a branch of that one because the
 * shape genuinely differs, and because the next niche page should reuse this
 * rather than adding a seventh set of optional props over there.
 */

interface TrustItem extends Record<string, unknown> {
  label: string;
}
interface CategoryItem extends Record<string, unknown> {
  label: string;
  href: string;
}
interface HighlightItem extends Record<string, unknown> {
  title: string;
  body: string;
}
interface BodySection extends Record<string, unknown> {
  heading: string;
  content: string;
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

export interface NicheLandingPageProps {
  content: ContentAccessors;
  /** Redacted rows for this niche. Never carries a domain - see `toPreviewRows`. */
  preview: PreviewRow[];
  /**
   * How many active listings this niche has right now.
   *
   * Counted from the marketplace on every render, so it follows the inventory
   * without anyone remembering to update a number. Zero hides the line
   * entirely rather than advertising an empty shelf.
   */
  listingCount: number;
  /** Icons for the value cards, positionally matched. Not editable. */
  highlightIcons: LucideIcon[];
  path: string;
  breadcrumbLabel: string;
  /** The parent crumb, e.g. Link Building. */
  breadcrumbParent?: { label: string; href: string };
}

/**
 * Rounded down to a round number, so the page understates rather than
 * overstates: "240+" with 243 listed is true tomorrow as well as today. Small
 * inventories are reported exactly, because rounding 8 down to 0 would be
 * worse than useless.
 */
function describeCount(total: number): string {
  if (total < 25) return formatNumber(total);
  const step = total < 100 ? 10 : total < 1000 ? 20 : 100;
  return `${formatNumber(Math.floor(total / step) * step)}+`;
}

export function NicheLandingPage({
  content,
  preview,
  listingCount,
  highlightIcons,
  path,
  breadcrumbLabel,
  breadcrumbParent,
}: NicheLandingPageProps) {
  const trust = content.list<TrustItem>('hero', 'trust');
  const categories = content
    .list<CategoryItem>('categories', 'items')
    .filter((item) => item.label && item.href);
  const highlights = content.list<HighlightItem>('highlights', 'items');
  const bodySections = content.list<BodySection>('body', 'sections');
  const related = content.list<RelatedEntry>('related', 'items');

  const faqs: FaqItem[] = content
    .list<FaqEntry>('faqs', 'items')
    .filter((entry) => entry.question && entry.answer)
    .map((entry) => ({ question: entry.question, answer: entry.answer }));

  const mascot = content.image('hero', 'mascot');
  const primaryCta = content.link('hero', 'primaryCta');
  const secondaryCta = content.link('hero', 'secondaryCta');
  const previewCta = content.link('preview', 'cta');
  const contentCta = content.link('content', 'cta');
  const ctaPrimary = content.link('cta', 'primaryCta');
  const ctaSecondary = content.link('cta', 'secondaryCta');

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: siteUrl },
      ...(breadcrumbParent
        ? [
            {
              '@type': 'ListItem',
              position: 2,
              name: breadcrumbParent.label,
              item: `${siteUrl}${breadcrumbParent.href}`,
            },
          ]
        : []),
      {
        '@type': 'ListItem',
        position: breadcrumbParent ? 3 : 2,
        name: breadcrumbLabel,
        item: `${siteUrl}${path}`,
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

      {/* ----------------------------------------------------------- hero */}
      <section className="tropical-wash relative overflow-hidden border-b border-line bg-white">
        <MonsteraLeaf className="pointer-events-none absolute -top-20 -right-24 hidden w-80 rotate-[18deg] opacity-20 lg:block" />
        <Container size="wide" className="relative py-12 lg:py-16">
          <nav aria-label="Breadcrumb" className="mb-6">
            <ol className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
              <li>
                <Link href="/" className="hover:text-ink">
                  Home
                </Link>
              </li>
              {breadcrumbParent ? (
                <>
                  <li aria-hidden="true">/</li>
                  <li>
                    <Link href={breadcrumbParent.href} className="hover:text-ink">
                      {breadcrumbParent.label}
                    </Link>
                  </li>
                </>
              ) : null}
              <li aria-hidden="true">/</li>
              <li className="text-ink-soft">{breadcrumbLabel}</li>
            </ol>
          </nav>

          <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.75fr)] lg:gap-14">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold tracking-[0.12em] text-accent-700 uppercase">
                {content.text('hero', 'eyebrow')}
              </p>
              <h1 className="mt-4 text-[2.25rem] leading-[1.06] font-semibold tracking-tight text-ink sm:text-5xl">
                {content.text('hero', 'title')}
              </h1>
              <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-muted lg:text-[17px]">
                {content.text('hero', 'intro')}
              </p>

              {trust.length ? (
                <ul className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2">
                  {trust.map((item) => (
                    <li
                      key={item.label}
                      className="flex items-center gap-2 text-[13px] font-medium text-ink-soft"
                    >
                      <Check className="h-4 w-4 shrink-0 text-accent-600" aria-hidden="true" />
                      {item.label}
                    </li>
                  ))}
                </ul>
              ) : null}

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

            {/* After the copy in the source, which is where it belongs on a
                phone: the headline is what a visitor from Google came for,
                and on desktop the grid puts this column on the right anyway. */}
            <div className="min-w-0">
              {/* Capped: left to fill the column the artwork sets the height
                  of the whole hero and opens a hole above the headline. */}
              <NicheMascot src={mascot.src} alt={mascot.alt} className="lg:max-w-sm lg:ml-auto" />
            </div>
          </div>
        </Container>
      </section>

      {/* ------------------------------------------------ marketplace preview */}
      <section className="border-b border-line bg-surface">
        <Container size="wide" className="py-14 lg:py-20">
          <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-14">
            <div className="min-w-0">
              <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-[2rem] sm:leading-tight">
                {content.text('preview', 'heading')}
              </h2>

              {/* Counted from the live marketplace. Hidden at zero rather than
                  announcing an empty shelf to a stranger. */}
              {listingCount > 0 ? (
                <p className="mt-4 flex flex-wrap items-baseline gap-2">
                  <span className="tabular text-3xl font-semibold tracking-tight text-ink">
                    {describeCount(listingCount)}
                  </span>
                  <span className="text-[15px] text-muted">
                    {content.text('preview', 'countSuffix')}
                  </span>
                </p>
              ) : null}

              <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted">
                {content.text('preview', 'body')}
              </p>

              <p className="mt-5 flex items-start gap-2 text-[13px] leading-relaxed text-ink-soft">
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
                {content.text('preview', 'lockNote')}
              </p>

              <Button asChild variant="accent" size="lg" className="mt-6">
                <Link href={previewCta.href}>
                  {previewCta.label}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            </div>

            <div className="min-w-0">
              {/* The same redacted table the service pages use. It is handed
                  rows that never carried a domain, slug or id. */}
              <RedactedPreview
                rows={preview}
                title={`${breadcrumbLabel} listings`}
                note="Website names and prices are shown to members"
                lockPrice
              />
            </div>
          </div>
        </Container>
      </section>

      {/* ------------------------------------------------------- categories */}
      {categories.length ? (
        <section className="border-b border-line bg-white">
          <Container size="wide" className="py-12 lg:py-16">
            <h2 className="text-2xl font-semibold tracking-tight text-ink">
              {content.text('categories', 'heading')}
            </h2>
            <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">
              {content.text('categories', 'body')}
            </p>

            {/* Every one of these is a real marketplace query. A shortcut that
                filtered nothing would be decoration pretending to be a
                feature. */}
            <ul className="mt-6 flex flex-wrap gap-2.5">
              {categories.map((category) => (
                <li key={category.label}>
                  <Link
                    href={category.href}
                    className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-white px-3.5 py-2 text-[13px] font-medium text-ink-soft transition-colors hover:border-accent-500 hover:text-accent-700"
                  >
                    {category.label}
                    <ArrowRight className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </Container>
        </section>
      ) : null}

      {/* -------------------------------------------------------- highlights */}
      {highlights.length ? (
        <section className="border-b border-line bg-surface">
          <Container size="wide" className="py-14 lg:py-20">
            <h2 className="max-w-2xl text-2xl font-semibold tracking-tight text-ink sm:text-[2rem] sm:leading-tight">
              {content.text('highlights', 'heading')}
            </h2>
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {highlights.map((highlight, index) => {
                const Icon = highlightIcons[index % highlightIcons.length];
                return (
                  <div
                    key={highlight.title || index}
                    className="rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)]"
                  >
                    {Icon ? (
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-50 text-accent-700">
                        <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                      </span>
                    ) : null}
                    <h3 className="mt-4 text-[15px] font-semibold text-ink">{highlight.title}</h3>
                    <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
                      {highlight.body}
                    </p>
                  </div>
                );
              })}
            </div>
          </Container>
        </section>
      ) : null}

      {/* ------------------------------------------------------ how it works */}
      <section className="border-b border-line bg-white">
        <Container size="wide" className="py-14 lg:py-20">
          <h2 className="text-2xl font-semibold tracking-tight text-ink">How it works</h2>
          {/* The shared steps, so this page cannot describe a process the rest
              of the site contradicts. */}
          <ol className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {journeySteps.map((step) => (
              <li key={step.number}>
                <span className="tabular text-[13px] font-semibold text-accent-700">
                  {step.number}
                </span>
                <h3 className="mt-2 text-[15px] font-semibold text-ink">{step.title}</h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{step.description}</p>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      {/* -------------------------------------------------------------- body */}
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
                    <Markdown source={bodySection.content} />
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

      {/* ---------------------------------------------------- content upsell */}
      <section className="border-b border-line bg-surface">
        <Container size="wide" className="py-12 lg:py-16">
          <div className="rounded-[var(--radius-card)] border border-line bg-white p-6 shadow-[var(--shadow-card)] lg:p-8">
            <div className="grid items-center gap-6 sm:grid-cols-[7rem_minmax(0,1fr)_auto] sm:gap-8">
              <NicheMascot src={mascot.src} alt="" className="mx-auto w-28 sm:mx-0" />
              <div className="min-w-0 text-center sm:text-left">
                <h2 className="text-[1.25rem] font-semibold tracking-tight text-ink">
                  {content.text('content', 'heading')}
                </h2>
                <p className="mt-2 text-[14px] leading-relaxed text-muted">
                  {content.text('content', 'body')}
                </p>
              </div>
              <div className="text-center sm:text-right">
                <Button asChild variant="outline" size="lg">
                  <Link href={contentCta.href}>
                    {contentCta.label}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* --------------------------------------------------------------- faq */}
      {faqs.length ? (
        <section className="border-b border-line bg-white">
          <Container size="wide" className="py-14 lg:py-20">
            <div className="mx-auto max-w-3xl">
              <Faq items={faqs} />
            </div>
          </Container>
        </section>
      ) : null}

      {/* --------------------------------------------------------- closing */}
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
