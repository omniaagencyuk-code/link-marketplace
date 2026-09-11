import { Container } from '@/components/layout/container';
import { HeroSearch } from './hero-search';
import { HeroPreview } from './hero-preview';
import type { WebsiteListItem } from '@/lib/types';

export function Hero({ websites }: { websites: WebsiteListItem[] }) {
  return (
    <section className="relative overflow-hidden border-b border-line bg-white">
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent-400/40 to-transparent"
      />
      <Container size="wide" className="py-12 lg:py-20">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.12em] text-accent-700 uppercase">
              Quality links. Real websites. No hassle.
            </p>
            <h1 className="mt-4 text-4xl leading-[1.08] font-semibold tracking-tight text-ink sm:text-5xl lg:text-[3.4rem]">
              The link building marketplace for{' '}
              <span className="text-accent-600">serious SEOs</span>
            </h1>
            <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-muted lg:text-[17px]">
              Buy high quality guest posts and niche edits on real websites. Vetted sites,
              transparent metrics and fast turnaround.
            </p>

            <div className="mt-8 max-w-2xl">
              <HeroSearch />
            </div>
          </div>

          <HeroPreview websites={websites} />
        </div>
      </Container>
    </section>
  );
}
