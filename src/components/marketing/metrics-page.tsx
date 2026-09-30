import Link from 'next/link';
import { ArrowRight, Info } from 'lucide-react';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { RichText, type RichTextValue } from '@/lib/cms/rich-text-render';
import { siteUrl } from '@/lib/config/brand';
import type { ContentAccessors } from '@/lib/cms/resolve';

interface Metric extends Record<string, unknown> {
  id: string;
  heading: string;
  summary: string;
  body: RichTextValue;
  limit: string;
}

/**
 * The metrics reference.
 *
 * A long page built to be linked into rather than read start to finish: every
 * metric has an anchor, and the homepage's cards point straight at them. The
 * contents list is the navigation, and it sticks on a desktop because the page
 * is long enough that scrolling back to it is a nuisance.
 *
 * Each entry ends with what its number cannot tell you. That is an editorial
 * decision rather than a layout one, and it is the reason the page exists in
 * this shape: a reference that presents Domain Rating as a verdict teaches
 * people to buy bad links confidently, which is worse than teaching them
 * nothing.
 */
export function MetricsPage({ content }: { content: ContentAccessors }) {
  const metrics = content.list<Metric>('metrics', 'items');
  const heroPrimary = content.link('hero', 'primaryCta');
  const heroSecondary = content.link('hero', 'secondaryCta');
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
        name: 'Link building metrics',
        item: `${siteUrl}/link-building-metrics`,
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      <section className="tropical-wash relative overflow-hidden border-b border-line bg-white">
        <Container size="wide" className="relative py-12 lg:py-16">
          <nav aria-label="Breadcrumb" className="mb-6">
            <ol className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
              <li>
                <Link href="/" className="hover:text-ink">
                  Home
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li className="text-ink-soft">Link building metrics</li>
            </ol>
          </nav>

          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-accent-700 uppercase">
              {content.text('hero', 'eyebrow')}
            </p>
            <h1 className="mt-4 text-[2rem] leading-[1.08] font-semibold tracking-tight text-ink sm:text-[2.75rem]">
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
          </div>
        </Container>
      </section>

      <section className="border-b border-line bg-white">
        <Container size="wide" className="py-12 lg:py-16">
          <div className="mx-auto max-w-2xl">
            <h2 className="text-[1.375rem] font-semibold tracking-tight text-ink sm:text-2xl">
              {content.text('intro', 'heading')}
            </h2>
            <div className="mt-5">
              <RichText source={content.richText('intro', 'body')} variant="article" />
            </div>
          </div>
        </Container>
      </section>

      {metrics.length ? (
        <section className="border-b border-line bg-white" aria-labelledby="metrics-heading">
          <Container size="wide" className="py-14 lg:py-16">
            <h2 id="metrics-heading" className="sr-only">
              The metrics
            </h2>

            <div className="grid gap-10 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] lg:gap-16">
              {/*
                Contents first in the source as well as on screen. Somebody
                arriving on a phone gets the list of what is here before the
                three thousand words, which is what a reference page is for.
              */}
              <nav aria-label="On this page" className="lg:sticky lg:top-8 lg:self-start">
                <p className="text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">
                  On this page
                </p>
                <ul className="mt-3 space-y-1.5">
                  {metrics.map((metric) => (
                    <li key={metric.id}>
                      <a
                        href={`#${metric.id}`}
                        className="text-[13px] text-ink-soft hover:text-accent-700 hover:underline"
                      >
                        {metric.heading}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>

              <div className="min-w-0 max-w-2xl space-y-14">
                {metrics.map((metric) => (
                  <article key={metric.id} id={metric.id} className="scroll-mt-8">
                    <h3 className="text-[1.375rem] font-semibold tracking-tight text-ink sm:text-2xl">
                      {metric.heading}
                    </h3>
                    {metric.summary ? (
                      <p className="mt-2 text-[15px] leading-relaxed text-muted">{metric.summary}</p>
                    ) : null}

                    <div className="mt-5">
                      <RichText source={metric.body} variant="article" />
                    </div>

                    {metric.limit ? (
                      <aside className="mt-5 flex gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4">
                        <Info
                          className="mt-0.5 h-4 w-4 shrink-0 text-muted"
                          aria-hidden="true"
                        />
                        <p className="text-[14px] leading-relaxed text-ink-soft">
                          <span className="font-medium text-ink">What it cannot tell you: </span>
                          {metric.limit}
                        </p>
                      </aside>
                    ) : null}
                  </article>
                ))}
              </div>
            </div>
          </Container>
        </section>
      ) : null}

      <section className="border-b border-line bg-surface">
        <Container size="wide" className="py-14 lg:py-16">
          <div className="mx-auto max-w-2xl">
            <h2 className="text-[1.375rem] font-semibold tracking-tight text-ink sm:text-2xl">
              {content.text('closing', 'heading')}
            </h2>
            <div className="mt-5">
              <RichText source={content.richText('closing', 'body')} variant="article" />
            </div>
          </div>
        </Container>
      </section>

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
              <Link href={ctaPrimary.href}>{ctaPrimary.label}</Link>
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
