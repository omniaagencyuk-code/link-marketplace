import { ArrowUpRight, Star, Timer } from 'lucide-react';
import { DomainRating } from '@/components/shared/metric';
import { VerifiedBadge } from '@/components/shared/verified-badge';
import { Sparkline } from '@/components/ui/sparkline';
import { nicheName } from '@/lib/data/categories';
import { countryShortName } from '@/lib/data/countries';
import { formatCompactNumber, formatPrice } from '@/lib/utils/format';
import type { WebsiteListItem } from '@/lib/types';

/**
 * Marketplace preview shown beside the hero copy. Real seed rows are used so
 * the visual matches what buyers actually see inside the product.
 */
export function HeroPreview({ websites }: { websites: WebsiteListItem[] }) {
  const rows = websites.slice(0, 5);
  const trend = rows[0]?.metrics.trafficTrend ?? [];

  return (
    <div className="relative">
      <div
        aria-hidden="true"
        className="absolute -inset-x-6 -top-8 -bottom-10 rounded-[2rem] bg-gradient-to-br from-accent-100/60 via-white to-transparent blur-2xl"
      />

      <div className="relative overflow-hidden rounded-xl border border-line bg-white shadow-[var(--shadow-pop)]">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div>
            <p className="text-[13px] font-semibold text-ink">Marketplace</p>
            <p className="text-[11px] text-muted">Live inventory, updated daily</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-50 px-2.5 py-1 text-[11px] font-medium text-accent-700">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-500" aria-hidden="true" />
            5,247 live
          </span>
        </div>

        <table className="w-full text-left">
          <caption className="sr-only">Example marketplace listings</caption>
          <thead>
            <tr className="text-[10px] tracking-wide text-muted uppercase">
              <th scope="col" className="px-4 py-2 font-semibold">
                Website
              </th>
              <th scope="col" className="px-2 py-2 font-semibold">
                DR
              </th>
              <th scope="col" className="hidden px-2 py-2 font-semibold sm:table-cell">
                Traffic
              </th>
              <th scope="col" className="px-4 py-2 text-right font-semibold">
                Price
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((website) => (
              <tr key={website.id} className="border-t border-line">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13px] font-semibold text-ink">{website.domain}</span>
                    {website.verified ? <VerifiedBadge /> : null}
                  </div>
                  <p className="text-[11px] text-muted">
                    {nicheName(website.niche)} &middot; {countryShortName(website.country)}
                  </p>
                </td>
                <td className="px-2 py-2.5">
                  <DomainRating value={website.metrics.domainRating} />
                </td>
                <td className="tabular hidden px-2 py-2.5 text-[12px] text-ink-soft sm:table-cell">
                  {formatCompactNumber(website.metrics.organicTraffic)}
                </td>
                <td className="tabular px-4 py-2.5 text-right text-[13px] font-semibold text-ink">
                  {formatPrice(website.headlinePriceMinor)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="grid grid-cols-2 gap-px border-t border-line bg-line">
          <div className="bg-white px-4 py-3">
            <p className="text-[11px] text-muted">Organic traffic trend</p>
            <div className="mt-1.5 flex items-end justify-between gap-3">
              <Sparkline values={trend} width={110} height={28} />
              <span className="inline-flex items-center gap-0.5 text-[12px] font-semibold text-accent-700">
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                {rows[0] ? `${Math.abs(rows[0].metrics.trafficChangePct).toFixed(0)}%` : '—'}
              </span>
            </div>
          </div>
          <div className="space-y-2 bg-white px-4 py-3">
            <p className="flex items-center gap-1.5 text-[12px] text-ink-soft">
              <Timer className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
              24-72h average turnaround
            </p>
            <p className="flex items-center gap-1.5 text-[12px] text-ink-soft">
              <Star className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
              4.9/5 from 1,200+ buyers
            </p>
          </div>
        </div>
      </div>

      <dl className="relative mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Vetted websites', value: '5,000+' },
          { label: 'Niches covered', value: '20+' },
          { label: 'Customer rating', value: '4.9/5' },
          { label: 'Avg. turnaround', value: '24-72h' },
        ].map((metric) => (
          <div
            key={metric.label}
            className="rounded-lg border border-line bg-white px-3 py-2.5 shadow-[var(--shadow-card)]"
          >
            <dt className="text-[11px] text-muted">{metric.label}</dt>
            <dd className="tabular mt-0.5 text-[15px] font-semibold text-ink">{metric.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
