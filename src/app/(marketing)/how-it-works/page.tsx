import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle2, FileSearch, Link2, Newspaper } from 'lucide-react';
import { Container } from '@/components/layout/container';
import { PageHero } from '@/components/layout/page-hero';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HowItWorksSection } from '@/components/home/how-it-works-section';
import { Faq } from '@/components/shared/faq';
import { CtaSection } from '@/components/home/cta-section';
import { linkTypeDescriptions, linkTypeLabels } from '@/lib/utils/labels';

export const metadata: Metadata = {
  title: 'How it works',
  description:
    'How the LinkMarket link building marketplace works: search vetted websites, review metrics, order guest posts or niche edits and get the live URL.',
  alternates: { canonical: '/how-it-works' },
};

const products = [
  { type: 'guest-post' as const, icon: Newspaper, best: 'Best for new pages and topical authority' },
  { type: 'niche-edit' as const, icon: Link2, best: 'Best for fast links on aged, indexed pages' },
  { type: 'digital-pr' as const, icon: FileSearch, best: 'Best for brand coverage on large publications' },
];

const vettingCriteria = [
  'Real organic traffic confirmed against two independent SEO data sources.',
  'An editorial team and a publishing history that predates any link selling.',
  'No link farms, private blog networks or sites built purely for placements.',
  'Clean outbound link profile with a sensible ratio of sponsored content.',
  'Indexed pages, a working sitemap and no manual action history we can detect.',
  'Response times and publication reliability tracked on every completed order.',
];

const faqs = [
  {
    question: 'Are the links permanent?',
    answer:
      'Yes. Every placement is sold as a permanent link with no yearly renewal fee. If a publisher removes a link within 12 months we replace it on a site of equal or better quality at no cost.',
  },
  {
    question: 'Who writes the content?',
    answer:
      'You can supply your own article, or let the publisher write it. Most listings support both. Where the publisher writes, one round of revisions is included in the price shown.',
  },
  {
    question: 'How fast are placements published?',
    answer:
      'Turnaround is shown on every listing and is measured in working days from content approval. Most guest posts go live within 24 to 72 hours; digital PR placements take longer because they go through a newsroom.',
  },
  {
    question: 'Do you accept gambling, finance or crypto content?',
    answer:
      'Many publishers do. Each listing states exactly which regulated topics it accepts, and you can filter the marketplace by niche to see only relevant inventory.',
  },
  {
    question: 'Can I see the site before I buy?',
    answer:
      'Every listing shows the domain, live metrics, audience geography, publishing rules and example placement paths. Nothing is hidden behind a paywall or an anonymised listing.',
  },
];

export default function HowItWorksPage() {
  return (
    <>
      <PageHero
        eyebrow="How it works"
        title="From shortlist to live link, without the back-and-forth"
        description="LinkMarket replaces outreach spreadsheets, email chains and invoice chasing with a single marketplace. You see the site, the metrics and the price before you commit."
      >
        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg" variant="primary">
            <Link href="/websites">Browse the marketplace</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/signup">Create an account</Link>
          </Button>
        </div>
      </PageHero>

      <HowItWorksSection showEyebrow={false} />

      <section className="border-b border-line bg-white py-14 lg:py-18">
        <Container size="wide">
          <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Three ways to place a link
          </h2>
          <p className="mt-2 max-w-2xl text-[15px] text-muted">
            Pick the product that matches the page you are trying to rank. Most campaigns use a
            mix of all three.
          </p>

          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {products.map((product) => (
              <Card key={product.type}>
                <CardHeader className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-50 text-accent-700">
                    <product.icon className="h-4.5 w-4.5" aria-hidden="true" />
                  </span>
                  <CardTitle className="text-[15px]">{linkTypeLabels[product.type]}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-[14px] leading-relaxed text-ink-soft">
                    {linkTypeDescriptions[product.type]}
                  </p>
                  <p className="mt-3 text-[13px] font-medium text-accent-700">{product.best}</p>
                  <Button asChild variant="link" size="sm" className="mt-4">
                    <Link href={`/websites?service=${product.type}`}>
                      Browse {linkTypeLabels[product.type].toLowerCase()} inventory
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </Container>
      </section>

      <section className="border-b border-line bg-surface py-14 lg:py-18">
        <Container size="wide">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr] lg:gap-16">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                What &ldquo;vetted&rdquo; actually means
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed text-muted">
                Roughly one in four websites that apply to join the marketplace is accepted. The
                rest fail on traffic quality, link profile or editorial standards. Vetting is
                repeated every quarter, and listings that slip are paused.
              </p>
            </div>
            <ul className="space-y-3">
              {vettingCriteria.map((criterion) => (
                <li
                  key={criterion}
                  className="flex gap-3 rounded-lg border border-line bg-white p-4 text-[14px] leading-relaxed text-ink-soft shadow-[var(--shadow-card)]"
                >
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent-600" aria-hidden="true" />
                  {criterion}
                </li>
              ))}
            </ul>
          </div>
        </Container>
      </section>

      <section className="bg-white py-14 lg:py-18">
        <Container size="narrow">
          <Faq items={faqs} />
        </Container>
      </section>

      <CtaSection />
    </>
  );
}
