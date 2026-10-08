/**
 * The window the dashboard is looking at.
 *
 * Pure, and in the URL rather than in React state: the figures are counted by
 * the database on the server, so the range has to be something a server
 * component can read. It also means a range can be linked to and reloaded,
 * which a dropdown holding its own state cannot do.
 *
 * ## "All time" has no preceding period
 *
 * Every other range has one of equal length immediately before it, which is
 * what a "compared with" figure is against. All time does not, and the
 * difference matters: a card must be able to tell "no change" from "nothing
 * to compare with" rather than printing 0% for both.
 */

export const RANGE_KEYS = ['today', '7d', '30d', '90d', 'year', 'all', 'custom'] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];

export const RANGE_LABELS: Record<RangeKey, string> = {
  today: 'Today',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  year: 'This year',
  all: 'All time',
  custom: 'Custom range',
};

/** The default, and what an unreadable one falls back to. */
export const DEFAULT_RANGE: RangeKey = '30d';

export interface DateRange {
  key: RangeKey;
  label: string;
  /** Null means unbounded, which only "all time" is. */
  from: Date | null;
  to: Date | null;
  /** Whether a preceding window of the same length exists to compare with. */
  comparable: boolean;
}

const DAY = 24 * 60 * 60 * 1000;

/** Midnight UTC on the day a moment falls in. */
function startOfDay(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
}

/** A `yyyy-mm-dd` an admin typed, or nothing. Never something else. */
export function readDay(raw: string | undefined | null): Date | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) return null;
  const at = new Date(`${raw.trim()}T00:00:00Z`);
  if (Number.isNaN(at.getTime())) return null;
  // Round-tripped, so the thirtieth of February is caught rather than being
  // rolled quietly into March - the same check the commercial terms needed.
  return at.toISOString().slice(0, 10) === raw.trim() ? at : null;
}

export function formatDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/**
 * The range to count over.
 *
 * `to` is exclusive and lands on the start of tomorrow, so an order placed
 * this afternoon is inside "today". A range ending at the current moment
 * excludes the rest of the day and the figure moves every time the page is
 * opened.
 */
export function resolveRange(
  key: string | undefined,
  from: string | undefined,
  to: string | undefined,
  now: Date = new Date(),
): DateRange {
  const asked = (RANGE_KEYS as readonly string[]).includes(key ?? '')
    ? (key as RangeKey)
    : DEFAULT_RANGE;

  const today = startOfDay(now);
  const tomorrow = new Date(today.getTime() + DAY);

  if (asked === 'custom') {
    const start = readDay(from);
    const end = readDay(to);
    /*
      A custom range needs both ends and needs them the right way round. One
      of them missing, or reversed, falls back rather than counting over a
      window nobody asked for - an empty dashboard that looks like a quiet
      month is worse than one showing the default.
    */
    if (start && end && start <= end) {
      return {
        key: 'custom',
        label: `${formatDay(start)} to ${formatDay(end)}`,
        from: start,
        // Exclusive, so the last day the admin picked is included in full.
        to: new Date(end.getTime() + DAY),
        comparable: true,
      };
    }
    return resolveRange(DEFAULT_RANGE, undefined, undefined, now);
  }

  if (asked === 'all') {
    return { key: 'all', label: RANGE_LABELS.all, from: null, to: null, comparable: false };
  }

  if (asked === 'year') {
    const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    return { key: 'year', label: RANGE_LABELS.year, from: start, to: tomorrow, comparable: true };
  }

  const days = asked === 'today' ? 1 : asked === '7d' ? 7 : asked === '90d' ? 90 : 30;
  return {
    key: asked,
    label: RANGE_LABELS[asked],
    from: new Date(tomorrow.getTime() - days * DAY),
    to: tomorrow,
    comparable: true,
  };
}

/**
 * The change between two periods, as a percentage, or nothing.
 *
 * Nothing when there is no preceding period, and nothing when that period was
 * zero: every increase from zero is infinite, and "+100%" against a month
 * with no orders is a number that reads as growth and means "the first one".
 */
export function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}
