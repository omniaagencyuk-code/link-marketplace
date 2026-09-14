import Link from 'next/link';
import {
  Bitcoin,
  Briefcase,
  Clapperboard,
  Dice5,
  HeartPulse,
  Landmark,
  Plane,
  Shirt,
  Trophy,
  Cpu,
  type LucideIcon,
} from 'lucide-react';
import { Container } from '@/components/layout/container';
import { nicheName } from '@/lib/data/categories';
import type { NicheSlug } from '@/lib/types';

/** Icons per niche. Slugs match the marketplace's `niche` query parameter. */
const nicheIcons: Partial<Record<NicheSlug, LucideIcon>> = {
  igaming: Dice5,
  sports: Trophy,
  finance: Landmark,
  technology: Cpu,
  business: Briefcase,
  health: HeartPulse,
  travel: Plane,
  lifestyle: Shirt,
  crypto: Bitcoin,
  entertainment: Clapperboard,
};

const featured: NicheSlug[] = [
  'igaming',
  'sports',
  'finance',
  'technology',
  'business',
  'health',
  'travel',
  'lifestyle',
  'crypto',
  'entertainment',
];

export function NicheGrid({ counts }: { counts: Partial<Record<NicheSlug, number>> }) {
  return (
    <section
      className="border-b border-line bg-surface py-16 lg:py-20"
      aria-labelledby="niches-heading"
    >
      <Container size="wide">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-xl">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-accent-700 uppercase">
              Hand picked opportunities
            </p>
            <h2
              id="niches-heading"
              className="mt-4 text-3xl font-semibold tracking-tight text-ink sm:text-4xl"
            >
              Explore by niche
            </h2>
          </div>
          <Link
            href="/marketplace"
            className="text-[13px] font-medium text-accent-700 hover:underline"
          >
            See the whole marketplace
          </Link>
        </div>

        <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {featured.map((slug) => {
            const Icon = nicheIcons[slug] ?? Briefcase;
            const count = counts[slug];
            return (
              <li key={slug}>
                <Link
                  href={`/marketplace?niche=${slug}`}
                  className="group flex h-full flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-white p-4 shadow-[var(--shadow-card)] transition-all hover:-translate-y-0.5 hover:border-accent-300 hover:shadow-[var(--shadow-raised)]"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-50 text-accent-700 transition-colors group-hover:bg-accent-600 group-hover:text-white">
                    <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block text-[14px] font-semibold text-ink">
                      {nicheName(slug)}
                    </span>
                    {count ? (
                      <span className="tabular block text-[12px] text-muted">
                        {count} {count === 1 ? 'website' : 'websites'}
                      </span>
                    ) : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </Container>
    </section>
  );
}
