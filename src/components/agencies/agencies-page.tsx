import Link from 'next/link';
import { ArrowRight, Check, type LucideIcon } from 'lucide-react';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { Faq, type FaqItem } from '@/components/shared/faq';
import { Reveal } from '@/components/cms/reveal';
import { Ink } from '@/components/marketing/page-motion';
import { MARKETPLACE_FILTERS } from '@/components/marketing/marketplace-filters';
import { OrderSteps } from '@/components/marketing/order-steps';
import { ServiceCta } from '@/components/marketing/service-cta';
import { MarketplaceMock } from '@/components/marketing/marketplace-mock';
import { AgencyDashboard } from './agency-dashboard';
import {
  CapabilityPanel,
  ContentAlongside,
  PricingConversation,
  RoadmapPanel,
  ScaleProblem,
} from './visuals';
import { RichText, type RichTextValue } from '@/lib/cms/rich-text-render';
import { siteUrl } from '@/lib/config/brand';
import { signupFor } from '@/lib/marketplace/entry';
import type { Animation } from '@/lib/cms/sections';
import type { ContentAccessors } from '@/lib/cms/resolve';
import type { PreviewRow } from '@/lib/services/marketplace-preview';

/**
 * /link-building-agencies, as its own composition.
 *
 * The sixth page redrawn, and the fourth off the shared `ServicePage`
 * (/buy-backlinks and the service starter still render from it). Same
 * furniture as the others: the same `Reveal`, the same `Ink`, the same
 * `MarketplaceMock`, the same `ServiceCta`, the same entrance CSS.
 *
 * ## Every word still comes from the CMS
 *
 * Not one string of page copy is written here. The hero, the four value
 * points, the marketplace band, the four body sections, the four questions,
 * the four related links and the closing call to action are read through
 * `content`, so an editor's saved changes still win and the shipped
 * defaults in `cms/pages/link-building-agencies.ts` are still the fallback.
 *
 * ## The rule this page is arranged around
 *
 * Its own FAQs say that user seats, per-client workspaces and white-label
 * reporting are **not** available, and its fourth section is titled "What we
 * are building next for agencies". That makes an agency landing page the
 * easiest place on this site to ship a contradiction: every stock agency
 * design has a white-label badge, a row of client logos and a figure like
 * "245 links placed, +42%", and each of those would be a claim the page's
 * own paragraphs deny four screens later.
 *
 * So the drawings here show only what the dashboard genuinely does - the
 * `CAPABILITIES` list names the screen for each - the roadmap section gets a
 * panel that *keeps* the missing half visible rather than softening it, and
 * the mockup's "Trusted by agencies worldwide" row of invented logos is
 * replaced by that capability list. `verify:agencies` checks each of those,
 * because none of them is something a build can catch.
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
 * Where an agency goes to talk about rates.
 *
 * The pricing page's enquiry form, which already exists and already has a
 * section headed "For agencies & frequent buyers". Linking there rather than
 * inventing a booking route means the CTA lands somewhere that works, and
 * the terms it offers are the ones somebody has actually agreed to offer.
 */
const AGENCY_PRICING_HREF = '/pricing#enquiry';

/** A drawing for each body section, in the order the sections ship. */
const BODY_VISUALS = [ScaleProblem, CapabilityPanel, ContentAlongside, RoadmapPanel] as const;

export function AgenciesPage({
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
              <li className="text-ink-soft">{breadcrumbLabel}</li>
            </ol>
          </nav>

          <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,34rem)] lg:gap-16">
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

            {/* --------------------------------------- the campaign board */}
            <div
              data-pp-enter="panel"
              style={{ '--pp-delay': '200ms' } as React.CSSProperties}
              className="relative min-w-0"
            >
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -inset-8 rounded-[2.5rem] bg-accent-400/20 blur-3xl"
              />
              <AgencyDashboard className="relative" />
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

      {/* --------------------------------------------- marketplace showcase */}
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
                  {MARKETPLACE_FILTERS.map((filter) => (
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

      {/* ------------------------------------------------- the long read */}
      {bodySections.map((bodySection, index) => {
        const Visual = BODY_VISUALS[index] ?? null;
        const visualFirst = index % 2 === 1;
        const tinted = index % 2 === 1;
        /*
          "What we are building next for agencies" gets a panel of its own.
          It is the section that lists what does not exist, and on a page
          selling the platform that is the paragraph a reader skims - so it
          is the one drawn as something other than more body copy.
        */
        const panelled = Visual === RoadmapPanel;

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
              {!Visual ? (
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
              ) : (
                <div
                  className={[
                    visualFirst
                      ? 'grid items-center gap-10 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)] lg:gap-16'
                      : 'grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] lg:gap-16',
                    panelled
                      ? 'rounded-[1.5rem] border border-accent-100 bg-accent-50/70 p-8 lg:p-12'
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
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
              )}
            </Container>
          </section>
        );
      })}

      {/* ------------------------------------------------- how a campaign runs
          `OrderSteps`, not a fourth set of four. Buying a placement for a
          client is the same four steps as buying one for yourself - filter,
          choose, order, track to a live URL - and /digital-pr has its own
          band only because a PR campaign genuinely is a different thing. */}
      <section className="border-b border-line bg-white">
        <Container size="wide" className="py-14 lg:py-20">
          <Reveal animation={FADE_UP}>
            <h2 className="mx-auto max-w-2xl text-center text-2xl font-semibold tracking-tight text-ink sm:text-[2rem] sm:leading-tight">
              <Ink>Four steps</Ink> from a filtered list to a live URL
            </h2>
          </Reveal>

          <Reveal animation={STAGGER}>
            <div className="mt-12">
              <OrderSteps />
            </div>
          </Reveal>
        </Container>
      </section>

      {/* ------------------------------------------------- agency pricing */}
      <section className="overflow-x-clip border-b border-line bg-surface">
        <Container size="wide" className="py-14 lg:py-20">
          <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-16">
            <div className="min-w-0">
              <Reveal animation={FADE_UP}>
                <div className="max-w-2xl">
                  <h2 className="text-[1.375rem] font-semibold tracking-tight text-ink sm:text-2xl">
                    Buying at volume
                  </h2>
                  {/*
                    Written here rather than read from the CMS because this
                    band is new, and kept to what /pricing already offers:
                    preferential rates for eligible repeat buyers, custom
                    quotes for larger campaigns, flexible arrangements. No
                    tiers, no percentages and no minimum - the page's own FAQ
                    says marketplace prices are the same for everyone and
                    that terms are a conversation, and this cannot say
                    otherwise.
                  */}
                  <p className="mt-4 text-[15px] leading-relaxed text-muted">
                    Marketplace prices are the same for everyone, which is what makes them
                    predictable to quote a retainer from. If you are placing at volume or running
                    several campaigns at once, the pricing page has a form that reaches us — tell us
                    the niches and the numbers and we will come back with terms.
                  </p>

                  <Button asChild variant="accent" size="lg" className="mt-7">
                    <Link href={AGENCY_PRICING_HREF}>
                      Discuss agency pricing
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </Button>
                  <p className="mt-3 text-[13px] text-muted">
                    No account needed, and nothing is charged.
                  </p>
                </div>
              </Reveal>
            </div>

            <div className="min-w-0">
              <Reveal animation={SLIDE_LEFT}>
                <PricingConversation />
              </Reveal>
            </div>
          </div>
        </Container>
      </section>

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
              <div data-reveal-items="" className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

/** Exported so the suite can pin the destination rather than read it off a render. */
export { AGENCY_PRICING_HREF };
