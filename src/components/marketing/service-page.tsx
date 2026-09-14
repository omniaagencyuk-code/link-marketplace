import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { Faq, type FaqItem } from '@/components/shared/faq';
import { RedactedPreview } from '@/components/marketplace/redacted-preview';
import { MonsteraLeaf } from '@/components/shared/foliage';
import { siteUrl } from '@/lib/config/brand';
import type { PreviewRow } from '@/lib/services/marketplace-preview';

/**
 * Shared layout for the public service pages.
 *
 * /link-building, /guest-posts, /niche-edits, /content-writing, /digital-pr
 * and /link-building-agencies all use this, so they stay consistent and a
 * change to the conversion path happens once. Each page supplies its own copy;
 * nothing here is generated.
 */

export interface ServiceSection {
  heading: string;
  /** Paragraphs. Kept short on purpose - this is a page, not an essay. */
  paragraphs: string[];
  /** Optional bullet list under the paragraphs. */
  points?: string[];
}

export interface ServicePageProps {
  eyebrow: string;
  title: string;
  intro: string;
  primaryCta?: { label: string; href: string };
  secondaryCta?: { label: string; href: string };
  microcopy?: string;
  /** Three or four short value props under the hero. */
  highlights: { icon: LucideIcon; title: string; body: string }[];
  /** The editorial body of the page. */
  sections: ServiceSection[];
  faqs: FaqItem[];
  /** Related pages, for internal linking. */
  related: { label: string; href: string; description: string }[];
  /** Redacted rows, when the page shows the marketplace. */
  preview?: PreviewRow[];
  previewHeading?: string;
  previewBody?: string;
  /** Canonical path, used for the breadcrumb structured data. */
  path: string;
  /** Breadcrumb label. */
  breadcrumbLabel: string;
}

export function ServicePage({
  eyebrow,
  title,
  intro,
  primaryCta = { label: 'Get Started Free', href: '/signup' },
  secondaryCta = { label: 'How It Works', href: '/how-it-works' },
  microcopy = 'Free account · No subscription · Pay only for what you order',
  highlights,
  sections,
  faqs,
  related,
  preview,
  previewHeading = 'Thousands of link building opportunities in one place',
  previewBody,
  path,
  breadcrumbLabel,
}: ServicePageProps) {
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
              {eyebrow}
            </p>
            <h1 className="mt-4 text-[2.25rem] leading-[1.08] font-semibold tracking-tight text-ink sm:text-5xl">
              {title}
            </h1>
            <p className="mt-5 text-[16px] leading-relaxed text-muted lg:text-[17px]">{intro}</p>

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

            <p className="mt-4 text-[13px] text-muted">{microcopy}</p>
          </div>
        </Container>
      </section>

      <section className="border-b border-line bg-white">
        <Container size="wide" className="py-12 lg:py-16">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {highlights.map((highlight) => (
              <div key={highlight.title}>
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-50 text-accent-700">
                  <highlight.icon className="h-4.5 w-4.5" aria-hidden="true" />
                </span>
                <h2 className="mt-4 text-[15px] font-semibold text-ink">{highlight.title}</h2>
                <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{highlight.body}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {preview ? (
        <section className="border-b border-line bg-surface">
          <Container size="wide" className="py-14 lg:py-20">
            <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-14">
              <div className="min-w-0">
                <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-[2rem] sm:leading-tight">
                  {previewHeading}
                </h2>
                {previewBody ? (
                  <p className="mt-4 text-[15px] leading-relaxed text-muted">{previewBody}</p>
                ) : null}
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
              {sections.map((section) => (
                <article key={section.heading}>
                  <h2 className="text-[1.375rem] font-semibold tracking-tight text-ink sm:text-2xl">
                    {section.heading}
                  </h2>
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph} className="mt-4 text-[15px] leading-relaxed text-muted">
                      {paragraph}
                    </p>
                  ))}
                  {section.points ? (
                    <ul className="mt-5 space-y-2.5">
                      {section.points.map((point) => (
                        <li key={point} className="flex gap-2.5 text-[15px] leading-relaxed text-ink-soft">
                          <Check
                            className="mt-1 h-4 w-4 shrink-0 text-accent-600"
                            aria-hidden="true"
                          />
                          {point}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </article>
              ))}
            </div>

            <aside className="lg:sticky lg:top-24 lg:self-start">
              <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
                <h2 className="text-[13px] font-semibold tracking-wide text-ink uppercase">
                  Related
                </h2>
                <ul className="mt-4 space-y-3">
                  {related.map((item) => (
                    <li key={item.href}>
                      <Link href={item.href} className="group block">
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
            Start building links that hold up
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-white/70">
            Create a free account, open the marketplace and order your first placement today.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Button asChild variant="accent" size="lg">
              <Link href="/signup">
                Create Free Account
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white"
            >
              <Link href="/pricing">See pricing</Link>
            </Button>
          </div>
        </Container>
      </section>
    </>
  );
}
