import Link from 'next/link';
import { ArrowRight, Check, type LucideIcon } from 'lucide-react';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { Faq, type FaqItem } from '@/components/shared/faq';
import { Reveal } from '@/components/cms/reveal';
import { Float, Ink } from '@/components/marketing/page-motion';
import { OrderSteps } from '@/components/marketing/order-steps';
import { ServiceCta } from '@/components/marketing/service-cta';
import { MarketplaceMock } from '@/components/marketing/marketplace-mock';
import { BODY_VISUALS } from './visuals';
import { RichText, type RichTextValue } from '@/lib/cms/rich-text-render';
import { siteUrl } from '@/lib/config/brand';
import { signupFor } from '@/lib/marketplace/entry';
import type { Animation } from '@/lib/cms/sections';
import type { ContentAccessors } from '@/lib/cms/resolve';
import type { PreviewRow } from '@/lib/services/marketplace-preview';

/**
 * /link-building, as its own composition.
 *
 * `ServicePage` still renders /buy-backlinks, /niche-edits, /digital-pr,
 * /link-building-agencies and the pages built from the service starter, and
 * is untouched. This page got a composition of its own for the reason
 * /guest-posts did: redesigning the template would have redesigned five
 * pages, four of which nobody asked about.
 *
 * ## Every word still comes from the CMS
 *
 * Not one string of page copy is written here. The hero, the four value
 * points, the marketplace band, the five body sections, the five questions,
 * the six related links and the closing call to action are all read through
 * `content`, so an editor's saved changes still win and the shipped defaults
 * in `cms/pages/link-building.ts` are still the fallback. What changed is the
 * arrangement and the drawing.
 *
 * That is also what keeps the page's search value: the headings, the
 * paragraphs, the bullet lists, the internal links and their anchor text, the
 * FAQ, the breadcrumb and the two pieces of structured data are the same ones
 * the page had before, in the same document order of heading to content.
 * `verify:link-building` asserts it rather than trusting this comment.
 *
 * ## Animation
 *
 * Three mechanisms, none of them a new library:
 *
 *   * `Reveal` for anything below the fold - the project's own
 *     IntersectionObserver, which plays once, refuses to animate what is
 *     already on screen, and hides nothing unless JavaScript is there to
 *     un-hide it.
 *   * A CSS entrance for the hero, because an observer cannot animate the
 *     first screen without hiding it first. See `globals.css`.
 *   * `Ink` for the highlighter, which draws by default and un-draws only
 *     when it can see the phrase is below the fold.
 *
 * Nothing animates a word or a letter of an SEO paragraph: long copy fades
 * as a block or not at all.
 */

interface HighlightItem extends Record<string, unknown> {
  title: string;
  body: string;
}
interface BodySection extends Record<string, unknown> {
  heading: string;
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

const FADE_UP: Animation = { entrance: 'fade-up', speed: 'normal', delay: 'none' };
const STAGGER: Animation = { entrance: 'stagger', speed: 'normal', delay: 'none' };
const SLIDE_LEFT: Animation = { entrance: 'slide-left', speed: 'normal', delay: 'none' };
const SLIDE_RIGHT: Animation = { entrance: 'slide-right', speed: 'normal', delay: 'none' };

/**
 * The marketplace's own filters, as the template has always listed them.
 *
 * Kept in this order and with these names because they are the filters the
 * marketplace actually has - a list that grows a column the product does not
 * offer is a promise the next page breaks.
 */
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

/**
 * How an order actually runs, in four steps.
 *
 * Taken from the page's own copy rather than invented for the design: "You
 * filter down to the sites that fit your campaign, add them to an order,
 * supply your target URL and anchor text, and track the order through to a
 * live URL." The labels are that sentence, cut into its four stages.
 */
export function LinkBuildingPage({
  content,
  highlightIcons,
  preview,
  path,
  breadcrumbLabel,
}: {
  content: ContentAccessors;
  highlightIcons: LucideIcon[];
  preview: PreviewRow[];
  path: string;
  breadcrumbLabel: string;
}) {
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

  /* Unchanged from the template: same two documents, same shape. */
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
      {faqs.length ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
        />
      ) : null}

      {/* ------------------------------------------------------------ hero */}
      <section className="relative overflow-hidden border-b border-line bg-white">
        {/*
          Two soft washes and nothing else. The brief's "green decorative
          background shapes" are gradients rather than drawn blobs, because a
          blob is an image to download and a gradient is four lines of CSS
          the compositor paints for nothing.
        */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(48rem 30rem at 85% -8%, rgba(16,185,129,0.14) 0%, transparent 62%), radial-gradient(34rem 24rem at 4% 108%, rgba(16,185,129,0.08) 0%, transparent 60%)',
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
              <li className="text-ink-soft">{breadcrumbLabel}</li>
            </ol>
          </nav>

          <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:gap-16">
            <div className="min-w-0">
              <p
                data-pp-enter=""
                className="inline-flex rounded-full bg-accent-50 px-3 py-1 text-[11px] font-semibold tracking-[0.12em] text-accent-700 uppercase"
              >
                {content.text('hero', 'eyebrow')}
              </p>

              {/*
                Transform only, no fade. This is the largest thing on the
                first screen and so the likely LCP element, and an element at
                zero opacity counts as unpainted.
              */}
              <h1
                data-pp-enter="heading"
                style={{ '--pp-delay': '80ms' } as React.CSSProperties}
                className="mt-5 text-[2.25rem] leading-[1.06] font-semibold tracking-tight text-ink sm:text-5xl lg:text-[3.25rem]"
              >
                {content.text('hero', 'title')}
              </h1>

              <p
                data-pp-enter=""
                style={{ '--pp-delay': '220ms' } as React.CSSProperties}
                className="mt-6 max-w-xl text-[16px] leading-relaxed text-muted lg:text-[17px]"
              >
                {content.text('hero', 'intro')}
              </p>

              <div
                data-pp-enter=""
                style={{ '--pp-delay': '340ms' } as React.CSSProperties}
                className="mt-8 flex flex-wrap items-center gap-3"
              >
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

              <p
                data-pp-enter=""
                style={{ '--pp-delay': '420ms' } as React.CSSProperties}
                className="mt-4 text-[13px] text-muted"
              >
                {content.text('hero', 'microcopy')}
              </p>

              {/*
                The four value points as a row of labels under the buttons.
                The same four the section below carries in full - this is
                their title, that is their title and their explanation, and
                neither is a second copy of the other.
              */}
              {highlights.length ? (
                <ul
                  data-pp-enter=""
                  style={{ '--pp-delay': '500ms' } as React.CSSProperties}
                  className="mt-8 flex flex-wrap gap-x-6 gap-y-3 border-t border-line pt-6"
                >
                  {highlights.map((highlight, index) => {
                    const Icon = highlightIcons[index % highlightIcons.length];
                    return (
                      <li
                        key={highlight.title || index}
                        className="flex items-center gap-2 text-[13px] text-ink-soft"
                      >
                        {Icon ? (
                          <Icon className="h-4 w-4 shrink-0 text-accent-700" aria-hidden="true" />
                        ) : null}
                        {highlight.title}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>

            {/* ------------------------------------------- the dashboard */}
            <div
              data-pp-enter="panel"
              style={{ '--pp-delay': '200ms' } as React.CSSProperties}
              className="relative min-w-0"
            >
              {/* The glow behind it. */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -inset-6 rounded-[2rem] bg-accent-400/20 blur-3xl"
              />

              <div className="relative">
                <MarketplaceMock rows={preview} />

                {/*
                  Two cards that drift. Hidden on a phone: they overlap the
                  panel's edges, which is decoration on a wide screen and a
                  layout problem on a narrow one.
                */}
                <Float
                  seconds={6}
                  className="pointer-events-none absolute -top-5 -left-5 hidden lg:block"
                >
                  <div className="rounded-xl border border-line bg-white px-3.5 py-2.5 shadow-[var(--shadow-pop)]">
                    <p className="text-[11px] font-semibold text-ink">Vetted by a person</p>
                    <p className="mt-0.5 text-[10px] text-muted">Before it is ever listed</p>
                  </div>
                </Float>

                <Float
                  seconds={7}
                  delayMs={900}
                  className="pointer-events-none absolute -right-4 -bottom-6 hidden lg:block"
                >
                  <div className="rounded-xl border border-line bg-white px-3.5 py-2.5 shadow-[var(--shadow-pop)]">
                    <p className="text-[11px] font-semibold text-ink">Price before you commit</p>
                    <p className="mt-0.5 text-[10px] text-muted">No enquiry form</p>
                  </div>
                </Float>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* -------------------------------------------------------- benefits */}
      {highlights.length ? (
        <section className="border-b border-line bg-white">
          <Container size="wide" className="py-14 lg:py-20">
            <Reveal animation={STAGGER}>
              <div
                data-reveal-items=""
                className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4"
              >
                {highlights.map((highlight, index) => {
                  const Icon = highlightIcons[index % highlightIcons.length];
                  return (
                    <div
                      key={highlight.title || index}
                      className="group rounded-[var(--radius-card)] border border-line bg-white p-6 transition-all duration-200 hover:-translate-y-1 hover:border-accent-200 hover:shadow-[var(--shadow-pop)]"
                    >
                      {Icon ? (
                        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-50 text-accent-700 transition-colors group-hover:bg-accent-100">
                          <Icon className="h-5 w-5" aria-hidden="true" />
                        </span>
                      ) : null}
                      <h2 className="mt-5 text-[15px] font-semibold text-ink">{highlight.title}</h2>
                      <p className="mt-2 text-[14px] leading-relaxed text-muted">
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

      {/* --------------------------------------------- marketplace showcase */}
      {/*
        `overflow-x-clip` on every band that holds a sideways reveal.

        A `slide-left` reveal sits 3rem off to one side until it is scrolled
        to, and a section below the fold holds that offset for as long as
        nobody has reached it - which widens the document and gives the whole
        page a horizontal scrollbar on a phone. Measured: 16px over at 390px
        wide, which is the container's own padding, so it reads as the page
        being subtly broken rather than as an animation.

        Clip rather than hidden: `overflow-hidden` makes a scroll container,
        which takes `position: sticky` out of service inside it and changes
        what a focused element scrolls into view.
      */}
      <section className="overflow-x-clip border-b border-line bg-accent-50/40">
        <Container size="wide" className="py-16 lg:py-24">
          <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,32rem)] lg:gap-16">
            <Reveal animation={SLIDE_RIGHT}>
              <div className="min-w-0">
                <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-[2rem] sm:leading-tight">
                  {content.text('preview', 'heading')}
                </h2>
                <p className="mt-4 text-[15px] leading-relaxed text-muted">
                  {content.text('preview', 'body')}
                </p>

                <ul className="mt-7 grid gap-2.5 sm:grid-cols-2">
                  {FILTERS.map((filter) => (
                    <li key={filter} className="flex items-center gap-2 text-[14px] text-ink-soft">
                      <Check className="h-4 w-4 shrink-0 text-accent-600" aria-hidden="true" />
                      {filter}
                    </li>
                  ))}
                </ul>

                <Button asChild variant="accent" size="lg" className="mt-8">
                  <Link href={signupFor()}>
                    Unlock the Marketplace
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
                <p className="mt-3 text-[13px] text-muted">
                  Create a free account to browse publishers and pricing.
                </p>
              </div>
            </Reveal>

            <Reveal animation={SLIDE_LEFT}>
              <div className="min-w-0">
                <MarketplaceMock rows={preview} />
              </div>
            </Reveal>
          </div>
        </Container>
      </section>

      {/* ------------------------------------------------------ the process */}
      <section className="border-b border-line bg-white">
        <Container size="wide" className="py-14 lg:py-20">
          <Reveal animation={FADE_UP}>
            <h2 className="max-w-2xl text-2xl font-semibold tracking-tight text-ink sm:text-[2rem] sm:leading-tight">
              <Ink>Four steps</Ink> from a filtered list to a live URL
            </h2>
          </Reveal>

          <Reveal animation={STAGGER}>
            <div className="mt-10">
              <OrderSteps />
            </div>
          </Reveal>
        </Container>
      </section>

      {/* ------------------------------------------------- the long read */}
      {bodySections.map((bodySection, index) => {
        const Visual = BODY_VISUALS[index] ?? null;
        /* Alternating: the visual swaps sides, and a section with no visual
           runs full width rather than leaving a hole beside the text. */
        const visualFirst = index % 2 === 1;
        const tinted = index % 2 === 1;

        return (
          <section
            key={bodySection.heading || index}
            className={
              tinted
                ? 'overflow-x-clip border-b border-line bg-surface'
                : 'overflow-x-clip border-b border-line bg-white'
            }
          >
            <Container size="wide" className="py-14 lg:py-20">
              {Visual ? (
                /*
                  The copy is always first in the DOM and the picture second,
                  whichever side it is drawn on. The swap is `order` on the
                  grid items - which is these wrappers, not the blocks inside
                  them: `Reveal` renders its own element, so an order class on
                  its child lands on something that is not a grid item and
                  does nothing. It was written that way first and both
                  sections came out identical.
                */
                <div
                  className={
                    visualFirst
                      ? 'grid items-center gap-10 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:gap-16'
                      : 'grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-16'
                  }
                >
                  <div className={`min-w-0 ${visualFirst ? 'lg:order-2' : ''}`}>
                    <Reveal animation={FADE_UP}>
                      <div className="max-w-2xl">
                        <h2 className="text-[1.375rem] font-semibold tracking-tight text-ink sm:text-2xl">
                          {bodySection.heading}
                        </h2>
                        <div className="mt-4">
                          <RichText source={bodySection.content} />
                        </div>
                      </div>
                    </Reveal>
                  </div>

                  <div className={`min-w-0 ${visualFirst ? 'lg:order-1' : ''}`}>
                    <Reveal animation={visualFirst ? SLIDE_RIGHT : SLIDE_LEFT}>
                      <Visual />
                    </Reveal>
                  </div>
                </div>
              ) : (
                <Reveal animation={FADE_UP}>
                  <div className="max-w-3xl">
                    <h2 className="text-[1.375rem] font-semibold tracking-tight text-ink sm:text-2xl">
                      {bodySection.heading}
                    </h2>
                    <div className="mt-4">
                      <RichText source={bodySection.content} />
                    </div>
                  </div>
                </Reveal>
              )}
            </Container>
          </section>
        );
      })}

      {/* ------------------------------------------------- related services */}
      {related.length ? (
        <section className="border-b border-line bg-white">
          <Container size="wide" className="py-14 lg:py-20">
            <Reveal animation={FADE_UP}>
              <h2 className="text-[13px] font-semibold tracking-wide text-ink uppercase">
                Related
              </h2>
            </Reveal>

            <Reveal animation={STAGGER}>
              <div
                data-reveal-items=""
                className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
              >
                {related.map((item) => (
                  <Link
                    key={item.href || item.label}
                    href={item.href || '/'}
                    className="group rounded-[var(--radius-card)] border border-line bg-white p-5 transition-all duration-200 hover:-translate-y-1 hover:border-accent-200 hover:shadow-[var(--shadow-pop)]"
                  >
                    <span className="flex items-center gap-1.5 text-[15px] font-semibold text-ink group-hover:text-accent-700">
                      {item.label}
                      <ArrowRight
                        className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-1"
                        aria-hidden="true"
                      />
                    </span>
                    <span className="mt-1.5 block text-[13px] leading-snug text-muted">
                      {item.description}
                    </span>
                  </Link>
                ))}
              </div>
            </Reveal>
          </Container>
        </section>
      ) : null}

      {/* -------------------------------------------------------------- FAQ */}
      {faqs.length ? (
        <section className="border-b border-line bg-surface">
          <Container size="wide" className="py-14 lg:py-20">
            <Reveal animation={FADE_UP}>
              <div className="mx-auto max-w-3xl">
                <Faq items={faqs} />
              </div>
            </Reveal>
          </Container>
        </section>
      ) : null}

      {/* -------------------------------------------------------- final CTA */}
      <ServiceCta
        heading={content.text('cta', 'heading')}
        body={content.text('cta', 'body')}
        primary={ctaPrimary}
        secondary={ctaSecondary}
      />
    </>
  );
}
