import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  Filter,
  Globe2,
  Lock,
  ShieldCheck,
  SlidersHorizontal,
  Timer,
} from 'lucide-react';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { MarketplaceView } from '@/components/marketplace/marketplace-view';
import { RedactedPreview } from '@/components/marketplace/redacted-preview';
import { HandwrittenNote } from '@/components/shared/handwritten';
import { getCurrentUser } from '@/lib/auth/customer-access';
import { settingsService, websiteService } from '@/lib/services';
import { ADVERTISED_INVENTORY } from '@/lib/data/websites';
import { marketingStats } from '@/lib/config/marketing';
import { brand, siteUrl } from '@/lib/config/brand';

/**
 * The marketplace, and its front door.
 *
 * One route, two renders. Signed out it is a public, indexable gateway that
 * explains the marketplace and sells the signup - with a preview whose rows
 * are redacted on the server, so no publisher is identifiable from the page.
 * Signed in it is the marketplace itself.
 *
 * `proxy.ts` lets `/marketplace` through precisely because of the signed-out
 * half; everything below it (`/websites`, `/websites/[slug]`) is gated there.
 */

export const metadata: Metadata = {
  title: 'Link building marketplace',
  description:
    'Search thousands of hand-vetted publishers by domain rating, organic traffic, niche, country and price. Create a free Press Parrot account to unlock the full marketplace.',
  alternates: { canonical: '/marketplace' },
  openGraph: {
    title: `Link building marketplace | ${brand.name}`,
    description:
      'Thousands of vetted publishers, real SEO metrics and upfront pricing. Free account, no subscription.',
    url: `${siteUrl}/marketplace`,
  },
};

const filterChips = [
  'Domain Rating',
  'Organic Traffic',
  'Referring Domains',
  'Country',
  'Niche',
  'Price',
  'Turnaround',
  'Link Type',
];

const gatewayPoints = [
  {
    icon: ShieldCheck,
    title: 'Every site vetted by hand',
    body: 'We check traffic quality, outbound link patterns, indexation and editorial standards before a publisher is listed. Sites that fail are not listed at a lower price - they are not listed.',
  },
  {
    icon: SlidersHorizontal,
    title: 'Filter on the metrics that matter',
    body: 'Domain rating, organic traffic, referring domains, country, language, niche, turnaround and price. Sort and stack them until the shortlist is exactly right.',
  },
  {
    icon: Globe2,
    title: 'Broad coverage, no filler',
    body: `${marketingStats.nicheCount}+ niches and ${marketingStats.inventory.toLocaleString('en-GB')}+ websites across ${'50'}+ countries, including the hard niches most marketplaces quietly skip.`,
  },
  {
    icon: Timer,
    title: 'Upfront prices, real turnaround',
    body: 'Each listing shows its own price and typical turnaround before you commit. No enquiry forms, no negotiation, no surprise invoice.',
  },
];

export default async function MarketplacePage() {
  const user = await getCurrentUser();

  if (user) {
    const [websites, settings] = await Promise.all([
      websiteService.getAll(),
      settingsService.get(),
    ]);

    return (
      <>
        <section className="border-b border-line bg-white">
          <Container size="wide" className="py-8 lg:py-10">
            <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Browse {ADVERTISED_INVENTORY.toLocaleString('en-GB')}+ Vetted Websites
            </h1>
            <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">
              Filter by niche, country, domain rating, traffic and price, then order guest posts,
              niche edits and digital PR placements.
            </p>
            <ul className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2">
              {[
                { icon: ShieldCheck, label: 'All sites manually vetted' },
                { icon: Timer, label: 'Fast turnaround' },
                { icon: BadgeCheck, label: 'Transparent metrics' },
              ].map((indicator) => (
                <li
                  key={indicator.label}
                  className="flex items-center gap-2 text-[13px] font-medium text-ink-soft"
                >
                  <indicator.icon className="h-4 w-4 text-accent-600" aria-hidden="true" />
                  {indicator.label}
                </li>
              ))}
            </ul>
          </Container>
        </section>

        <Container size="wide" className="py-6 lg:py-8">
          <Suspense fallback={<MarketplaceSkeleton />}>
            <MarketplaceView websites={websites} defaultPageSize={settings.defaultPageSize} />
          </Suspense>
        </Container>
      </>
    );
  }

  const preview = await websiteService.getPublicPreview(6);

  return (
    <>
      <section className="tropical-wash relative overflow-hidden border-b border-line bg-white">
        <Container size="wide" className="relative py-12 lg:py-16">
          <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.85fr)] lg:gap-14">
            <div className="min-w-0">
              <p className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.1em] text-accent-700 uppercase">
                <Lock className="h-3 w-3" aria-hidden="true" />
                Members only
              </p>

              <h1 className="mt-5 text-[2.25rem] leading-[1.06] font-semibold tracking-tight text-ink sm:text-5xl">
                {marketingStats.inventory.toLocaleString('en-GB')}+ vetted websites.
                <br />
                <span className="text-accent-600">One marketplace.</span>
              </h1>

              <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-muted lg:text-[17px]">
                Search thousands of hand-vetted publishers using real SEO metrics, transparent
                pricing and powerful filters.
              </p>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Button asChild variant="accent" size="lg">
                  <Link href="/signup?next=%2Fmarketplace">
                    Create Free Account
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link href="/login?next=%2Fmarketplace">Log In</Link>
                </Button>
              </div>

              <p className="mt-4 text-[13px] text-muted">
                Free access. No subscription required.
              </p>

              <dl className="mt-9 grid max-w-lg grid-cols-3 gap-4 border-t border-line pt-6">
                {[
                  { value: `${marketingStats.inventory.toLocaleString('en-GB')}+`, label: 'Vetted websites' },
                  { value: `${marketingStats.nicheCount}+`, label: 'Niches' },
                  { value: '50+', label: 'Countries' },
                ].map((stat) => (
                  <div key={stat.label}>
                    <dt className="sr-only">{stat.label}</dt>
                    <dd>
                      <span className="block text-xl font-semibold tracking-tight text-ink">
                        {stat.value}
                      </span>
                      <span className="mt-0.5 block text-[12px] text-muted">{stat.label}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="relative min-w-0">
              <HandwrittenNote
                arrow="none"
                className="absolute -top-8 -left-1 hidden rotate-[-6deg] lg:block"
              >
                A peek behind the perch.
              </HandwrittenNote>
              <RedactedPreview
                rows={preview.rows}
                cta={{
                  label: 'Unlock the Marketplace',
                  href: '/signup?next=%2Fmarketplace',
                  caption: 'Free account. No subscription required.',
                }}
              />
            </div>
          </div>
        </Container>
      </section>

      <section className="border-b border-line bg-surface">
        <Container size="wide" className="py-14 lg:py-20">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              What you get when you log in
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">
              The listings themselves are the part an account unlocks. Everything else about how the
              marketplace works is on this page.
            </p>
          </div>

          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            {gatewayPoints.map((point) => (
              <div
                key={point.title}
                className="rounded-[var(--radius-card)] border border-line bg-white p-6 shadow-[var(--shadow-card)]"
              >
                <point.icon className="h-5 w-5 text-accent-600" aria-hidden="true" />
                <h3 className="mt-4 text-[16px] font-semibold text-ink">{point.title}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-muted">{point.body}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 rounded-[var(--radius-card)] border border-line bg-white p-6 shadow-[var(--shadow-card)]">
            <h3 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
              <Filter className="h-4 w-4 text-accent-600" aria-hidden="true" />
              Filters available inside the marketplace
            </h3>
            <ul className="mt-4 flex flex-wrap gap-2">
              {filterChips.map((chip) => (
                <li
                  key={chip}
                  className="rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-[12px] font-medium text-ink-soft"
                >
                  {chip}
                </li>
              ))}
            </ul>
          </div>
        </Container>
      </section>

      <section className="bg-navy-950 text-white">
        <Container size="wide" className="py-14 text-center lg:py-20">
          <h2 className="mx-auto max-w-2xl text-2xl font-semibold tracking-tight sm:text-3xl">
            Ready to see the list?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-white/70">
            Creating an account takes under a minute and costs nothing. You only pay when you place
            an order.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Button asChild variant="accent" size="lg">
              <Link href="/signup?next=%2Fmarketplace">
                Create Free Account
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white">
              <Link href="/how-it-works">How It Works</Link>
            </Button>
          </div>
        </Container>
      </section>
    </>
  );
}

function MarketplaceSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <div className="hidden h-96 animate-pulse rounded-[var(--radius-card)] border border-line bg-white lg:block" />
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, index) => (
          <div
            key={index}
            className="h-14 animate-pulse rounded-[var(--radius-card)] border border-line bg-white"
          />
        ))}
      </div>
    </div>
  );
}
