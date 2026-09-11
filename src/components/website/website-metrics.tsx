import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { Sparkline } from '@/components/ui/sparkline';
import {
  formatCompactNumber,
  formatNumber,
  formatPercent,
  formatTurnaround,
} from '@/lib/utils/format';
import { linkTypeLabels } from '@/lib/utils/labels';
import type { Website } from '@/lib/types';

/** Headline metric row shown directly under the listing title. */
export function WebsiteMetrics({ website }: { website: Website }) {
  const { metrics } = website;
  // Quote the headline service rather than a range spanning every product,
  // which would read as misleadingly wide.
  const available = website.services.filter((service) => service.available);
  const headline =
    available.find((service) => service.type === 'guest-post') ?? available[0] ?? null;
  const turnaround = headline
    ? formatTurnaround(headline.turnaroundMinDays, headline.turnaroundMaxDays)
    : 'On request';
  const positive = metrics.trafficChangePct >= 0;

  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line shadow-[var(--shadow-card)] sm:grid-cols-3 lg:grid-cols-5">
      <Cell label="Domain Rating" value={String(metrics.domainRating)} hint="Ahrefs style, 0-100" />
      <Cell
        label="Organic Traffic"
        value={formatCompactNumber(metrics.organicTraffic)}
        hint={`${formatNumber(metrics.organicTraffic)} monthly visits`}
      />
      <Cell
        label="Referring Domains"
        value={formatCompactNumber(metrics.referringDomains)}
        hint={`Spam score ${metrics.spamScore}%`}
      />
      <div className="bg-white px-4 py-4">
        <dt className="text-[11px] font-medium tracking-wide text-muted uppercase">
          Traffic Trend
        </dt>
        <dd className="mt-2 flex items-end gap-2">
          <Sparkline
            values={metrics.trafficTrend}
            width={92}
            height={30}
            stroke={positive ? 'var(--color-accent-500)' : 'var(--color-negative)'}
            label={`Organic traffic over the last 12 months, ${formatPercent(metrics.trafficChangePct)}`}
          />
          <span
            className={`tabular inline-flex items-center text-[13px] font-semibold ${
              positive ? 'text-accent-700' : 'text-negative'
            }`}
          >
            {positive ? (
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ArrowDownRight className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {formatPercent(metrics.trafficChangePct)}
          </span>
        </dd>
        <p className="mt-1 text-[11px] text-muted">Last 6 months</p>
      </div>
      <Cell
        label="Est. Turnaround"
        value={turnaround}
        hint={
          headline
            ? `${linkTypeLabels[headline.type]}, from approval`
            : 'Publisher is not taking orders'
        }
      />
    </dl>
  );
}

function Cell({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="bg-white px-4 py-4">
      <dt className="text-[11px] font-medium tracking-wide text-muted uppercase">{label}</dt>
      <dd className="tabular mt-2 text-xl font-semibold text-ink">{value}</dd>
      <p className="mt-1 text-[11px] text-muted">{hint}</p>
    </div>
  );
}
