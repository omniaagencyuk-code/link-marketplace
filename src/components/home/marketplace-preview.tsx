import Link from 'next/link';
import { ArrowRight, ChevronRight } from 'lucide-react';
import { nicheName } from '@/lib/data/categories';
import { formatCompactNumber, formatPrice } from '@/lib/utils/format';
import { marketingStats } from '@/lib/config/marketing';
import type { WebsiteListItem } from '@/lib/types';

/**
 * Floating marketplace card in the hero.
 *
 * Rows are real listings from the data layer, not fixtures, so the preview
 * always matches what /websites actually sells.
 */
export function MarketplacePreview({ websites }: { websites: WebsiteListItem[] }) {
  // Rounded down: "+ 5,000 more" reads better than an oddly exact figure.
  const remaining = Math.floor((marketingStats.inventory - websites.length) / 1000) * 1000;

  return (
    <section
      aria-labelledby="featured-websites-heading"
      className="relative rounded-xl border border-line bg-white shadow-[var(--shadow-pop)]"
    >
      <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
        <h2 id="featured-websites-heading" className="text-[15px] font-semibold text-ink">
          Featured Websites
        </h2>
        <Link
          href="/websites"
          className="inline-flex items-center gap-1 text-[13px] font-medium text-accent-700 hover:underline"
        >
          View all
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>

      <ul className="divide-y divide-line">
        {websites.map((website, index) => (
          <li
            key={website.id}
            className="motion-safe:animate-[var(--animate-rise)]"
            style={{ animationDelay: `${index * 70}ms` }}
          >
            <Link
              href={`/websites/${website.slug}`}
              className="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface"
            >
              <span
                aria-hidden="true"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-navy-900 text-[13px] font-semibold text-white"
              >
                {website.domain.charAt(0).toUpperCase()}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-ink">
                  {website.domain}
                </span>
                <span className="block truncate text-[12px] text-muted">
                  {nicheName(website.niche)}
                </span>
              </span>

              <span className="hidden shrink-0 text-right sm:block">
                <span className="block text-[10px] tracking-wide text-muted uppercase">DR</span>
                <span className="tabular block text-[13px] font-semibold text-ink">
                  {website.metrics.domainRating}
                </span>
              </span>

              <span className="hidden shrink-0 text-right md:block lg:hidden xl:block">
                <span className="block text-[10px] tracking-wide text-muted uppercase">
                  Traffic
                </span>
                <span className="tabular block text-[13px] font-semibold text-ink">
                  {formatCompactNumber(website.metrics.organicTraffic)}
                </span>
              </span>

              <span className="tabular shrink-0 text-[14px] font-semibold text-ink">
                {formatPrice(website.headlinePriceMinor)}
              </span>

              <ChevronRight
                className="h-4 w-4 shrink-0 text-muted-soft transition-transform group-hover:translate-x-0.5 group-hover:text-accent-600"
                aria-hidden="true"
              />
            </Link>
          </li>
        ))}
      </ul>

      <Link
        href="/websites"
        className="flex items-center justify-between gap-3 rounded-b-xl border-t border-line bg-accent-50/70 px-5 py-3.5 text-[13px] font-medium text-accent-700 transition-colors hover:bg-accent-50"
      >
        <span>+ {remaining.toLocaleString('en-GB')} more vetted websites</span>
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </section>
  );
}
