import { Suspense } from 'react';
import type { Metadata } from 'next';
import { BadgeCheck, ShieldCheck, Timer } from 'lucide-react';
import { Container } from '@/components/layout/container';
import { MarketplaceView } from '@/components/marketplace/marketplace-view';
import { settingsService, websiteService } from '@/lib/services';
import { ADVERTISED_INVENTORY } from '@/lib/data/websites';
import { brand, siteUrl } from '@/lib/config/brand';

export const metadata: Metadata = {
  title: 'Browse vetted websites for guest posts and niche edits',
  description:
    'Search 5,000+ manually vetted websites by niche, country, domain rating, traffic and price. Buy guest posts, niche edits and digital PR placements with transparent metrics.',
  alternates: { canonical: '/websites' },
  openGraph: {
    title: `Browse vetted websites | ${brand.name}`,
    description:
      'Filter thousands of vetted publishers by niche, metrics and price, then order guest posts and niche edits in a few clicks.',
    url: `${siteUrl}/websites`,
  },
};

const trustIndicators = [
  { icon: ShieldCheck, label: 'All sites manually vetted' },
  { icon: Timer, label: 'Fast turnaround' },
  { icon: BadgeCheck, label: 'Trusted by brands' },
];

export default async function WebsitesPage() {
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
            Buy high quality guest posts and niche edits on real websites. Transparent metrics, fast
            turnaround and no hassle.
          </p>
          <ul className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2">
            {trustIndicators.map((indicator) => (
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
