import type { LucideIcon } from 'lucide-react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/**
 * One of the four figures across the top.
 *
 * ## No trend is a real answer
 *
 * `change` is null when there is nothing to compare with - an unbounded range
 * has no period before it, and a rise from zero is not a percentage. The card
 * then prints no badge rather than "+0%" or "+100%", both of which read as
 * facts about the business and are facts about the arithmetic.
 *
 * ## The sparkline is optional for the same reason
 *
 * Orders carry `placed_at`, so revenue and order counts have a history to
 * draw. Listings do not: there is no table recording how many there were last
 * month, so that card gets no line rather than an invented one.
 */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'accent',
  change,
  changeLabel,
  spark,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  tone?: 'accent' | 'info' | 'violet' | 'amber';
  /** Percentage against the preceding period, or null when there is none. */
  change?: number | null;
  changeLabel?: string;
  /** A drawn sparkline, when this figure has a history. */
  spark?: React.ReactNode;
}) {
  const tones = {
    accent: 'bg-accent-50 text-accent-700',
    info: 'bg-blue-50 text-blue-700',
    violet: 'bg-violet-50 text-violet-700',
    amber: 'bg-amber-50 text-amber-700',
  } as const;

  const rising = (change ?? 0) >= 0;

  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)] transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className={cn('inline-flex rounded-lg p-2', tones[tone])}>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <p className="mt-3 text-[13px] font-medium text-muted">{label}</p>
          <p className="tabular mt-1 text-[28px] leading-none font-semibold text-ink">{value}</p>
        </div>
        {spark ? <div className="mt-1 w-24 shrink-0">{spark}</div> : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
        {change != null ? (
          <span
            className={cn(
              'tabular inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold',
              rising ? 'bg-accent-50 text-accent-700' : 'bg-coral-50 text-coral-700',
            )}
          >
            {rising ? (
              <TrendingUp className="h-3 w-3" aria-hidden="true" />
            ) : (
              <TrendingDown className="h-3 w-3" aria-hidden="true" />
            )}
            {rising ? '+' : ''}
            {change}%
          </span>
        ) : null}
        {change != null && changeLabel ? (
          <span className="text-[11px] text-muted">{changeLabel}</span>
        ) : null}
        {hint ? <span className="text-[11px] text-muted">{hint}</span> : null}
      </div>
    </div>
  );
}
