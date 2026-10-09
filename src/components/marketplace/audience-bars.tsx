import { Flag } from '@/components/shared/flag';
import { countryName } from '@/lib/data/countries';
import { formatNumber } from '@/lib/utils/format';
import type { AudienceCountry } from '@/lib/types';

/**
 * Where a publisher's readers actually are, as two bars in a table cell.
 *
 * This is the column a buyer scans for. A domain rating says how strong a
 * site is; this says whether its audience is the one they are trying to
 * reach, and a UK business has no use for a DR 80 site read entirely in
 * Indonesia.
 *
 * ## It is measured, and it is not everywhere
 *
 * `audienceSplit` is written by the Ahrefs refresh, which reports visits per
 * country; the shares are derived from those visits, so the bar and the
 * number cannot disagree. Nothing here is inferred from a domain suffix or
 * from where a publisher says they are - 0043 and 0044 exist because that
 * guess was being made and recorded as though it were a measurement.
 *
 * Counted against the live inventory, 6,422 of 12,190 active listings carry
 * two countries or more. So just over half of the rows have this and just
 * under half do not, which makes the unavailable state as much a part of
 * this component as the bars: it says the figure has not been measured
 * rather than drawing an empty bar, which would read as "no traffic from
 * anywhere".
 *
 * Two countries, because that is what fits a table row at a glance and the
 * long tail is in the expanded panel. A site with one measured country shows
 * one bar rather than a blank second slot.
 */
export function AudienceBars({ split }: { split: AudienceCountry[] }) {
  const top = split.filter((entry) => entry.country && entry.share > 0).slice(0, 2);

  if (top.length === 0) {
    return (
      <span className="text-[12px] text-muted" title="Country traffic has not been measured for this publisher">
        —
      </span>
    );
  }

  return (
    <ul className="space-y-1">
      {top.map((entry) => (
        <li key={entry.country} className="flex items-center gap-1.5">
          <Flag country={entry.country} className="h-3 w-4 shrink-0 rounded-[2px]" />
          <span className="w-5 shrink-0 text-[11px] font-medium text-ink-soft">{entry.country}</span>

          {/*
            The bar is scaled to the whole audience, not to the biggest
            country shown. Scaling to the leader would draw 40% and 35% as a
            full bar and a nearly-full one, which reads as "mostly these two"
            whatever the real concentration is.
          */}
          <span
            aria-hidden="true"
            className="h-1.5 w-10 shrink-0 overflow-hidden rounded-full bg-surface-sunken"
          >
            <span
              className="block h-full rounded-full bg-accent-500"
              style={{ width: `${Math.min(100, Math.max(3, entry.share))}%` }}
            />
          </span>

          <span
            className="tabular w-8 shrink-0 text-right text-[11px] text-muted"
            title={
              `${countryName(entry.country)}: ${entry.share}% of organic traffic` +
              (entry.traffic ? ` (about ${formatNumber(entry.traffic)} visits a month)` : '')
            }
          >
            {entry.share}%
          </span>
        </li>
      ))}
    </ul>
  );
}
