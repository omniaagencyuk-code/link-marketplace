import Link from 'next/link';
import { nicheName } from '@/lib/data/categories';
import { popularNiches } from '@/lib/config/marketing';
import type { NicheSlug } from '@/lib/types';

/**
 * Popular niches under the hero search. Each pill deep-links into the
 * marketplace with that niche already selected, using the same `niche` query
 * parameter the filter sidebar reads.
 */
export function NichePills() {
  return (
    <div>
      <span className="block text-[13px] text-muted">Popular niches</span>
      {/* Scrolls sideways on phones rather than wrapping to four rows. */}
      <div className="hide-scrollbar -mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0 sm:pb-0">
        {popularNiches.map((slug) => (
          <Link
            key={slug}
            href={`/websites?niche=${slug}`}
            className="shrink-0 rounded-full border border-line-strong bg-white px-3.5 py-1.5 text-[13px] font-medium whitespace-nowrap text-ink-soft transition-colors hover:border-accent-400 hover:bg-accent-50 hover:text-accent-700"
          >
            {nicheName(slug as NicheSlug)}
          </Link>
        ))}
      </div>
    </div>
  );
}
