import Link from 'next/link';
import { DomainRating } from '@/components/shared/metric';
import { VerifiedBadge } from '@/components/shared/verified-badge';
import { formatCompactNumber, formatPrice } from '@/lib/utils/format';
import { nicheName } from '@/lib/data/categories';
import type { NicheSlug, WebsiteListItem } from '@/lib/types';

export function RelatedWebsites({
  websites,
  niche,
}: {
  websites: WebsiteListItem[];
  niche: NicheSlug;
}) {
  if (websites.length === 0) return null;

  return (
    <section aria-labelledby="related-heading" className="mt-10">
      <div className="flex items-end justify-between gap-4">
        <h2 id="related-heading" className="text-lg font-semibold text-ink">
          Similar {nicheName(niche)} websites
        </h2>
        <Link
          href={`/websites?niche=${niche}`}
          className="text-[13px] font-medium text-accent-700 hover:underline"
        >
          See all
        </Link>
      </div>

      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {websites.map((website) => (
          <li key={website.id}>
            <Link
              href={`/websites/${website.slug}`}
              className="block h-full rounded-[var(--radius-card)] border border-line bg-white p-4 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-raised)]"
            >
              <span className="flex items-center gap-1.5">
                <span className="truncate text-[14px] font-semibold text-ink">
                  {website.domain}
                </span>
                {website.verified ? <VerifiedBadge /> : null}
              </span>
              <span className="mt-3 flex items-center gap-3 text-[12px] text-muted">
                <DomainRating value={website.metrics.domainRating} />
                <span className="tabular">
                  {formatCompactNumber(website.metrics.organicTraffic)} traffic
                </span>
              </span>
              <span className="tabular mt-3 block text-[14px] font-semibold text-ink">
                From {formatPrice(website.lowestPriceMinor)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
