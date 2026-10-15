/**
 * A traffic history built out of readings we already pay for.
 *
 * Every refresh asks Ahrefs for `org_traffic` and, until now, threw the
 * reading away once it had overwritten `organic_traffic`. So the marketplace
 * held one number per listing and no history at all: `traffic_trend` shipped
 * empty from the CSV importer and nothing ever filled it, which is why a
 * listing's Traffic Trend panel read "Not recorded".
 *
 * Buying the history instead was measured rather than guessed at, against the
 * free `ahrefs.com` target with `apiUsageCosts` read back:
 *
 *   select=date                13 rows,  1 unit a row -> 50, the floor
 *   select=date,org_traffic    13 rows, 11 units a row -> 143
 *
 * `org_traffic` is a ten-unit column and the series *is* that column, so
 * there is nothing to trim. `site-explorer/metrics-history` also takes one
 * target per call where the refresh batches a hundred, so 12,190 active
 * listings is 1.74 million units a pass against a two million unit monthly
 * allowance. Keeping it current would cost that again every month.
 *
 * Accumulating costs nothing, and what it builds is a measurement of our own
 * rather than a figure bought twice.
 *
 * ## One point a month, and what that does not promise
 *
 * Readings are bucketed by calendar month: a second reading in a month it
 * already holds replaces that month's figure rather than appending, so a
 * tier 1 listing refreshed weekly and a tier 3 listing refreshed monthly
 * build the same shape of series instead of one of them running four times
 * faster than the other.
 *
 * What this cannot promise is that the months are consecutive. A listing
 * nobody refreshed in February has no February reading, and the array has no
 * way to say so - which is why nothing built on it should be labelled "the
 * last twelve months" when it holds twelve readings. It holds twelve monthly
 * readings, and `traffic_trend_month` says when the newest one was taken.
 *
 * Filling a gap would mean inventing a figure for a month nobody measured,
 * which is the thing this file exists to stop doing.
 */

/** How many monthly readings a listing keeps. The oldest falls off the front. */
export const TREND_MONTHS = 12;

/**
 * The calendar month a reading belongs to, as `YYYY-MM-01`.
 *
 * UTC, because the refresh runs on a server whose local midnight is nobody's
 * in particular, and a reading taken at 23:30 on the last of the month must
 * not land in the next one depending on where the function happened to run.
 */
export function monthKey(when: Date): string {
  const year = when.getUTCFullYear();
  const month = String(when.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

export interface TrendUpdate {
  trend: number[];
  month: string;
}

/**
 * Fold one reading into a listing's series.
 *
 * `lastMonth` is the month the final element belongs to, or null when there
 * is nothing recorded. A series with points but no month is possible - rows
 * that predate this column - and it appends rather than replacing: we do not
 * know which month that last point was taken in, and overwriting a reading we
 * cannot identify would lose a real measurement to guesswork.
 */
export function appendReading(
  trend: readonly number[],
  lastMonth: string | null,
  traffic: number,
  when: Date,
): TrendUpdate {
  const month = monthKey(when);
  // A negative or non-finite reading is not a measurement. Ahrefs does not
  // send one, and if it ever did it must not become a point on a chart.
  const reading = Number.isFinite(traffic) && traffic >= 0 ? Math.round(traffic) : 0;

  const points = trend.filter((value) => Number.isFinite(value));

  if (points.length > 0 && lastMonth === month) {
    // The same month, measured again. The later reading is the better one:
    // Ahrefs revises a month as it fills in, so the last word on a month is
    // the closest thing to its real figure.
    return { trend: [...points.slice(0, -1), reading], month };
  }

  const next = [...points, reading];
  return { trend: next.slice(Math.max(0, next.length - TREND_MONTHS)), month };
}

/**
 * How much the series moved, and across how many months.
 *
 * Null with fewer than two readings, because one reading is not a change -
 * and the panel that draws this needs both a series and a figure, so a null
 * here keeps it saying "Not recorded" rather than drawing a flat line and
 * "+0%", which reads as "measured, and steady".
 *
 * Null too when the oldest reading is zero: a rise from nothing has no
 * percentage, and dividing by it would publish Infinity as a growth figure.
 */
export function trendChange(trend: readonly number[]): { pct: number; months: number } | null {
  const points = trend.filter((value) => Number.isFinite(value));
  if (points.length < 2) return null;

  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (first <= 0) return null;

  return {
    pct: Number((((last - first) / first) * 100).toFixed(1)),
    months: points.length - 1,
  };
}
