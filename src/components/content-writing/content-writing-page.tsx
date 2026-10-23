import Link from 'next/link';
import { ArrowRight, Check, type LucideIcon } from 'lucide-react';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { Faq, type FaqItem } from '@/components/shared/faq';
import { HandwrittenNote } from '@/components/shared/handwritten';
import { Reveal } from '@/components/cms/reveal';
import { ServiceCta } from '@/components/marketing/service-cta';
import { EditorDemo } from './editor-demo';
import { ContentSteps, type ContentStep } from './content-steps';
import { ArticleQuality, ContentAndLinks } from './visuals';
import { RichText, type RichTextValue } from '@/lib/cms/rich-text-render';
import { brand, siteUrl } from '@/lib/config/brand';
import { formatPrice } from '@/lib/utils/format';
import { contentTypes, wordCountOptions } from '@/lib/config/content';
import type { Animation } from '@/lib/cms/sections';
import type { ContentAccessors } from '@/lib/cms/resolve';

/**
 * /content-writing, as its own composition.
 *
 * The fourth page redrawn, after /link-building, /niche-edits and
 * /digital-pr, and the first that was never a `ServicePage` - this one has
 * always had its own layout, written inline in the route, because pricing is
 * the centre of it. The redraw moves that layout into a component and gives
 * it the hero, the entrances and the illustrations the other three have.
 *
 * ## The numbers are still not copy
 *
 * The rule the old page was built around is the one most worth not losing in
 * a redesign: **an editor owns every word here and none of the numbers.**
 * Prices come from settings, through `pricingTable`, so the page cannot
 * quote a figure the checkout does not charge; where none is configured a
 * length reads "On request" rather than inventing one. The content types and
 * the available lengths come from `config/content.ts`, the same module the
 * order form reads, so the cards can never offer something the form does not.
 *
 * The length cards are therefore *informational*, not controls. The order
 * form takes no word count in its URL and sits behind a session, so a card
 * that looked clickable would be a button that did nothing - the one CTA
 * below them is the real way in.
 *
 * ## What animates, and what must not
 *
 * The hero's editor is Motion, because it is a four-stage sequence with a
 * timeline. Everything else is the project's own `Reveal` and the entrance
 * CSS the other three pages use, which hides nothing until JavaScript has
 * armed it - so every paragraph, price, FAQ answer and link is in the
 * server-rendered HTML whether or not anything runs.
 */

interface HighlightEntry extends Record<string, unknown> {
  title: string;
  body: string;
}
interface StepEntry extends Record<string, unknown>, ContentStep {}
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

const FADE_UP: Animation = { entrance: 'fade-up', speed: 'normal', delay: 'none' };
const STAGGER: Animation = { entrance: 'stagger', speed: 'normal', delay: 'none' };
const SLIDE_LEFT: Animation = { entrance: 'slide-left', speed: 'normal', delay: 'none' };
const SLIDE_RIGHT: Animation = { entrance: 'slide-right', speed: 'normal', delay: 'none' };

/** A drawing for each editorial section, in the order they ship. */
const BODY_VISUALS = [ContentAndLinks, ArticleQuality] as const;

export interface PriceRow {
  words: number;
  priceMinor: number | null;
}

export function ContentWritingPage({
  content,
  highlightIcons,
  rows,
  currency,
  configured,
}: {
  content: ContentAccessors;
  highlightIcons: LucideIcon[];
  /** Lengths and their prices, computed from settings by `pricingTable`. */
  rows: PriceRow[];
  currency: string;
  /** Whether any price has been configured at all. */
  configured: boolean;
}) {
  const highlights = content.list<HighlightEntry>('highlights', 'items');
  const steps = content.list<StepEntry>('steps', 'items');
  const includes = content.list<IncludeEntry>('steps', 'includes');
  const bodySections = content.list<BodyEntry>('body', 'sections');
  const faqEntries = content
    .list<FaqEntry>('faqs', 'items')
    .filter((entry) => entry.question && entry.answer);

  const faqs: FaqItem[] = faqEntries.map((entry) => ({
    question: entry.question,
    answer: entry.answer,
  }));

  const heroPrimary = content.link('hero', 'primaryCta');
  const heroSecondary = content.link('hero', 'secondaryCta');
  const stepsCta = content.link('steps', 'cta');
  const ctaPrimary = content.link('cta', 'primaryCta');
  const ctaSecondary = content.link('cta', 'secondaryCta');

  /* Unchanged from the page this replaces: same two documents, same shape. */
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

      {/* ------------------------------------------------------------ hero */}
      <section className="relative overflow-x-clip border-b border-line bg-white">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(48rem 30rem at 80% -12%, rgba(16,185,129,0.16) 0%, transparent 62%), radial-gradient(34rem 24rem at 0% 104%, rgba(16,185,129,0.09) 0%, transparent 60%)',
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
              <li className="text-ink-soft">Content writing</li>
            </ol>
          </nav>

          <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,32rem)] lg:gap-16">
            <div className="min-w-0">
              <p
                data-pp-enter=""
                className="inline-flex rounded-full bg-accent-50 px-3 py-1 text-[11px] font-semibold tracking-[0.12em] text-accent-700 uppercase"
              >
                {content.text('hero', 'eyebrow')}
              </p>

              {/* Transform only: the LCP candidate is not faded in. */}
              <h1
                data-pp-enter="heading"
                style={{ '--pp-delay': '80ms' } as React.CSSProperties}
                className="mt-5 text-[2.25rem] leading-[1.06] font-semibold tracking-tight text-ink sm:text-5xl lg:text-[3.1rem]"
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
                  <Link href={heroPrimary.href}>
                    {heroPrimary.label}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link href={heroSecondary.href}>{heroSecondary.label}</Link>
                </Button>
              </div>

              <p
                data-pp-enter=""
                style={{ '--pp-delay': '420ms' } as React.CSSProperties}
                className="mt-4 text-[13px] text-muted"
              >
                {content.text('hero', 'microcopy')}
              </p>

              {/* The four value points as a row of labels - title here, title
                  and explanation in the section below. */}
              {highlights.length ? (
                <ul
                  data-pp-enter=""
                  style={{ '--pp-delay': '500ms' } as React.CSSProperties}
                  className="mt-8 grid gap-x-6 gap-y-3 border-t border-line pt-6 sm:grid-cols-2"
                >
                  {highlights.map((highlight, index) => {
                    const Icon = highlightIcons[index % highlightIcons.length];
                    return (
                      <li
                        key={highlight.title || index}
                        className="flex items-center gap-2 text-[13px] text-ink-soft"
                      >
                        {Icon ? (
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-50 text-accent-700">
                            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                          </span>
                        ) : null}
                        {highlight.title}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>

            {/* ------------------------------------------- the editor */}
            <div
              data-pp-enter="panel"
              style={{ '--pp-delay': '200ms' } as React.CSSProperties}
              className="relative min-w-0"
            >
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -inset-8 rounded-[2.5rem] bg-accent-400/20 blur-3xl"
              />
              <EditorDemo className="relative" />
            </div>
          </div>
        </Container>
      </section>

      {/* -------------------------------------------------------- benefits */}
      {highlights.length ? (
        <section className="border-b border-line bg-white">
          <Container size="wide" className="py-14 lg:py-20">
            <Reveal animation={STAGGER}>
              <div data-reveal-items="" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
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
                      <p className="mt-2 text-[14px] leading-relaxed text-muted">{highlight.body}</p>
                    </div>
                  );
                })}
              </div>
            </Reveal>
          </Container>
        </section>
      ) : null}

      {/* ---------------------------------------------------- what we write */}
      <section className="border-b border-line bg-surface" aria-labelledby="content-types">
        <Container size="wide" className="py-14 lg:py-20">
          <Reveal animation={FADE_UP}>
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
          </Reveal>

          <Reveal animation={STAGGER}>
            {/*
              The cards are the order form's own catalogue, not a list typed
              here: five of them, the sixth ("Other") left out because it is
              the form's escape hatch rather than a service. A card the form
              cannot offer is a promise the checkout breaks.
            */}
            <div
              data-reveal-items=""
              className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
            >
              {contentTypes
                .filter((type) => type.slug !== 'other')
                .map((type) => (
                  <article
                    key={type.slug}
                    className="group rounded-[var(--radius-card)] border border-line bg-white p-6 shadow-[var(--shadow-card)] transition-all duration-200 hover:-translate-y-1 hover:border-accent-200 hover:shadow-[var(--shadow-pop)]"
                  >
                    <h3 className="text-[16px] font-semibold text-ink">{type.label}</h3>
                    <p className="mt-2 text-[14px] leading-relaxed text-muted">
                      {type.description}
                    </p>
                    <p className="mt-4 inline-flex rounded-md bg-accent-50 px-2 py-1 text-[12px] font-medium text-accent-800">
                      {type.typicalWords}
                    </p>
                  </article>
                ))}
            </div>
          </Reveal>
        </Container>
      </section>

      {/* ------------------------------------------------- pricing and what
          is included, side by side */}
      <section className="overflow-x-clip border-b border-line bg-accent-50/40" aria-labelledby="pricing">
        <Container size="wide" className="py-16 lg:py-24">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-16">
            <Reveal animation={SLIDE_RIGHT}>
              <div className="min-w-0">
                <h2
                  id="pricing"
                  className="text-2xl font-semibold tracking-tight text-ink sm:text-[2rem] sm:leading-tight"
                >
                  {content.text('pricing', 'heading')}
                </h2>
                <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted">
                  {configured
                    ? content.text('pricing', 'introConfigured')
                    : content.text('pricing', 'introUnset')}
                </p>

                {/*
                  Lengths, informational. Not buttons: the order form takes no
                  word count in its URL and sits behind a session, so a card
                  that looked clickable would be a control that did nothing.
                  The figures come from settings through `pricingTable`, and
                  an unconfigured length reads "On request" rather than zero.
                */}
                <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {rows.map((row) => (
                    <li
                      key={row.words}
                      className="rounded-[var(--radius-card)] border border-line bg-white p-4 text-center shadow-[var(--shadow-card)] transition-colors duration-200 hover:border-accent-200"
                    >
                      <p className="tabular text-[20px] font-semibold tracking-tight text-ink">
                        {row.words.toLocaleString(brand.locale)}
                      </p>
                      <p className="text-[12px] text-muted">words</p>
                      <p className="mt-2 border-t border-line pt-2 text-[13px] font-semibold text-accent-700">
                        {row.priceMinor === null
                          ? 'On request'
                          : formatPrice(row.priceMinor, { currency })}
                      </p>
                    </li>
                  ))}
                </ul>

                <div className="mt-6 max-w-xl rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)]">
                  <p className="text-[13px] font-medium text-muted">
                    {content.text('pricing', 'customHeading')}
                  </p>
                  <p className="mt-1.5 text-[15px] text-ink">
                    {content.text('pricing', 'customBody')}
                  </p>
                </div>

                <p className="mt-4 text-[13px] text-muted">
                  Available lengths:{' '}
                  {wordCountOptions.map((words) => words.toLocaleString(brand.locale)).join(', ')}{' '}
                  or custom.
                </p>
              </div>
            </Reveal>

            {/* ------------------------------------ every article includes */}
            {includes.length ? (
              <Reveal animation={SLIDE_LEFT}>
                <div className="min-w-0">
                  {content.text('steps', 'annotation') ? (
                    <HandwrittenNote arrow="down-right" className="mb-4 hidden lg:block">
                      {content.text('steps', 'annotation')}
                    </HandwrittenNote>
                  ) : null}

                  <div className="rounded-[var(--radius-card)] border border-line bg-white p-6 shadow-[var(--shadow-pop)]">
                    <h2 className="text-[13px] font-semibold tracking-wide text-ink uppercase">
                      {content.text('steps', 'includesHeading')}
                    </h2>
                    <ul data-reveal-items="" className="mt-5 space-y-3">
                      {includes.map((item, index) => (
                        <li
                          key={item.text || index}
                          className="flex gap-2.5 text-[14px] leading-relaxed text-ink-soft"
                        >
                          <span className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-accent-100 text-accent-700">
                            <Check className="h-3 w-3" aria-hidden="true" />
                          </span>
                          {item.text}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </Reveal>
            ) : null}
          </div>
        </Container>
      </section>

      {/* --------------------------------------------------- how it works */}
      <section className="border-b border-line bg-white" id="how-it-works">
        <Container size="wide" className="py-14 lg:py-20">
          <Reveal animation={FADE_UP}>
            <h2 className="mx-auto max-w-2xl text-center text-2xl font-semibold tracking-tight text-ink sm:text-[2rem] sm:leading-tight">
              {content.text('steps', 'heading')}
            </h2>
          </Reveal>

          <Reveal animation={STAGGER}>
            <div className="mt-12">
              <ContentSteps steps={steps} />
            </div>
          </Reveal>

          {stepsCta.label ? (
            <Reveal animation={FADE_UP}>
              <div className="mt-12 text-center">
                <Button asChild variant="accent" size="lg">
                  <Link href={stepsCta.href}>
                    {stepsCta.label}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
              </div>
            </Reveal>
          ) : null}
        </Container>
      </section>

      {/* ------------------------------------------------- the long read */}
      {bodySections.map((entry, index) => {
        const Visual = BODY_VISUALS[index] ?? null;
        const visualFirst = index % 2 === 1;
        const tinted = index % 2 === 1;

        return (
          <section
            key={entry.heading || index}
            className={
              tinted
                ? 'overflow-x-clip border-b border-line bg-surface'
                : 'overflow-x-clip border-b border-line bg-white'
            }
          >
            <Container size="wide" className="py-14 lg:py-20">
              {!Visual ? (
                <Reveal animation={FADE_UP}>
                  <div className="mx-auto max-w-3xl">
                    <h2 className="text-[1.375rem] font-semibold tracking-tight text-ink sm:text-2xl">
                      {entry.heading}
                    </h2>
                    <div className="mt-4">
                      <RichText source={entry.content} />
                    </div>
                  </div>
                </Reveal>
              ) : (
                <div
                  className={
                    visualFirst
                      ? 'grid items-center gap-10 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-16'
                      : 'grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-16'
                  }
                >
                  {/*
                    The order classes go on the grid items rather than inside
                    `Reveal`, which renders its own element - an order class
                    on its child lands on something that is not a grid item.
                  */}
                  <div className={`min-w-0 ${visualFirst ? 'lg:order-2' : ''}`}>
                    <Reveal animation={FADE_UP}>
                      <div className="max-w-2xl">
                        <h2 className="text-[1.375rem] font-semibold tracking-tight text-ink sm:text-2xl">
                          {entry.heading}
                        </h2>
                        <div className="mt-4">
                          <RichText source={entry.content} />
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
              )}
            </Container>
          </section>
        );
      })}

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
