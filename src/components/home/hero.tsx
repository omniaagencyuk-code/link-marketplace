import { Container } from '@/components/layout/container';
import { HeroSearch } from './hero-search';
import { NichePills } from './niche-pills';
import { ParrotHero } from './parrot-hero';
import { MarketplacePreview } from './marketplace-preview';
import { TrustMetrics } from './trust-metrics';
import type { WebsiteListItem } from '@/lib/types';

/**
 * Homepage hero.
 *
 * Three layered columns on desktop: copy and search on the left, the mascot in
 * the middle, the live marketplace card on the right. The mascot column is
 * given negative margins so the bird overlaps both neighbours rather than
 * sitting in its own box. Below 1024px the layout stacks in reading order:
 * headline, search, parrot, marketplace.
 */
export function Hero({ websites }: { websites: WebsiteListItem[] }) {
  return (
    <section className="tropical-wash relative overflow-hidden border-b border-line bg-white">
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent-400/40 to-transparent"
      />

      <Container size="wide" className="relative py-10 lg:py-16">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.72fr)_minmax(0,0.92fr)] lg:gap-0">
          {/* copy + search */}
          <div className="relative z-20 min-w-0 lg:pr-6">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-accent-700 uppercase">
              Quality links. Real websites. No squawk.
            </p>

            <h1 className="mt-4 text-[2.5rem] leading-[1.05] font-semibold tracking-tight text-ink sm:text-5xl lg:text-[3.25rem]">
              The link building
              <br className="hidden lg:block" /> marketplace for
              <br className="hidden lg:block" />{' '}
              <span className="text-accent-600">serious SEOs</span>
            </h1>

            <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-muted">
              Buy high quality guest posts, niche edits and digital PR placements on real websites.
              Vetted sites, transparent metrics and fast turnaround.
            </p>

            <div className="mt-7 max-w-xl">
              <HeroSearch />
            </div>

            <div className="mt-4 max-w-xl">
              <NichePills />
            </div>
          </div>

          {/* mascot, overlapping both columns on desktop */}
          <div className="relative z-10 min-w-0 lg:-mx-10 lg:mb-[-2.5rem]">
            <ParrotHero />
          </div>

          {/* live marketplace */}
          <div className="relative z-20 min-w-0">
            <MarketplacePreview websites={websites} />
          </div>
        </div>

        <div className="mt-10 lg:mt-12">
          <TrustMetrics />
        </div>
      </Container>
    </section>
  );
}
