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
  // A trend needs both a series to draw and a figure to label it. Without
  // them the cell showed a flat line and "+0%" with an upward arrow, which
  // reads as "measured, and steady" rather than "we do not know".
  const change = metrics.trafficChangePct;
  const hasTrend = metrics.trafficTrend.length > 0 && typeof change === 'number';
  const positive = (change ?? 0) >= 0;

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
        hint={
          typeof metrics.spamScore === 'number'
            ? `Spam score ${metrics.spamScore}%`
            : undefined
        }
      />
      <div className="bg-white px-4 py-4">
        <dt className="text-[11px] font-medium tracking-wide text-muted uppercase">
          Traffic Trend
        </dt>
        {hasTrend ? (
          <>
            <dd className="mt-2 flex items-end gap-2">
              <Sparkline
                values={metrics.trafficTrend}
                width={92}
                height={30}
                stroke={positive ? 'var(--color-accent-500)' : 'var(--color-negative)'}
                label={`Organic traffic over the last 12 months, ${formatPercent(change as number)}`}
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
                {formatPercent(change as number)}
              </span>
            </dd>
            <p className="mt-1 text-[11px] text-muted">Last 6 months</p>
          </>
        ) : (
          <>
            <dd className="mt-2 text-[15px] font-semibold text-muted">&mdash;</dd>
            <p className="mt-1 text-[11px] text-muted">Not recorded</p>
          </>
        )}
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

function Cell({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-white px-4 py-4">
      <dt className="text-[11px] font-medium tracking-wide text-muted uppercase">{label}</dt>
      <dd className="tabular mt-2 text-xl font-semibold text-ink">{value}</dd>
      {/* An absent hint leaves no empty line behind. */}
      {hint ? <p className="mt-1 text-[11px] text-muted">{hint}</p> : null}
    </div>
  );
}
