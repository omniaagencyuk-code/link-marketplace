import { Flag } from '@/components/shared/flag';
import { cn } from '@/lib/utils/cn';
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
 *
 * The marketplace card uses the same component laid out across instead of
 * down, so a phone and the table cannot come to differ about what the top
 * two countries are or how a share is drawn.
 */
export function AudienceBars({
  split,
  direction = 'stack',
  emptyLabel = '—',
}: {
  split: AudienceCountry[];
  /**
   * Stacked in a table cell, side by side on a card.
   *
   * The table has 98px and two rows to give this; a card has the width of the
   * card and one line, so the same two countries read better across than down.
   */
  direction?: 'stack' | 'inline';
  /**
   * What stands in for the bars where nothing has been measured.
   *
   * A dash in a table cell, because the column heading beside it already says
   * what is missing and there is no room for words. On a card there is room,
   * and half the inventory has no reading - so saying so in words beats a
   * dash a buyer has to interpret.
   */
  emptyLabel?: string;
}) {
  const top = split.filter((entry) => entry.country && entry.share > 0).slice(0, 2);

  /*
    The stacked version is tighter than the inline one, and the difference
    is measured rather than aesthetic.

    In the table this row is flag + code + bar + share with three gaps, and
    every one of them is `shrink-0` - so the row cannot compress, it
    overflows. At the roomier sizes that came to 126px of content in a cell
    the column gave 98, and the share labels were printing over the
    Keywords column beside them. A table cell does not clip by default, so
    nothing about the markup said it was wrong.

    126 goes to 108 here, and the column it sits in is sized to hold it
    (see the colgroup in `website-table`). The card keeps the roomier sizes
    because a card has the width.
  */
  const tight = direction === 'stack';

  if (top.length === 0) {
    return (
      <span className="text-[12px] text-muted" title="Country traffic has not been measured for this publisher">
        {emptyLabel}
      </span>
    );
  }

  return (
    <ul className={direction === 'inline' ? 'flex flex-wrap gap-x-4 gap-y-1' : 'space-y-1'}>
      {top.map((entry) => (
        <li
          key={entry.country}
          className={cn('flex items-center', tight ? 'gap-1' : 'gap-1.5')}
        >
          <Flag country={entry.country} className="h-3 w-4 shrink-0 rounded-[2px]" />
          <span
            className={cn(
              'shrink-0 text-[11px] font-medium text-ink-soft',
              tight ? 'w-[18px]' : 'w-5',
            )}
          >
            {entry.country}
          </span>

          {/*
            The bar is scaled to the whole audience, not to the biggest
            country shown. Scaling to the leader would draw 40% and 35% as a
            full bar and a nearly-full one, which reads as "mostly these two"
            whatever the real concentration is.
          */}
          <span
            aria-hidden="true"
            className={cn(
              'h-1.5 shrink-0 overflow-hidden rounded-full bg-surface-sunken',
              tight ? 'w-8' : 'w-10',
            )}
          >
            <span
              className="block h-full rounded-full bg-accent-500"
              style={{ width: `${Math.min(100, Math.max(3, entry.share))}%` }}
            />
          </span>

          <span
            className={cn(
              'tabular shrink-0 text-right text-[11px] text-muted',
              /* Wide enough for "100%", which is what a single-country
                 publisher shows and the only value that fills it. */
              tight ? 'w-[30px]' : 'w-8',
            )}
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
