/**
 * The traffic history the refresh accumulates.
 *
 * Pure arithmetic over readings we already pay for: no API key, no database,
 * no network, and deliberately no Ahrefs call of any kind - buying this
 * history is the thing the feature exists to avoid, measured at 143 units a
 * domain and 1.74 million for the inventory.
 *
 * What is worth being exhaustive about is the bucketing. A series is written
 * back over itself on every refresh, so a rule that is wrong in one direction
 * silently doubles a listing's history and in the other silently discards a
 * month - and nothing says so afterwards, because the array that comes out
 * looks exactly like an array that went in.
 */

import { appendReading, monthKey, trendChange, TREND_MONTHS } from '../src/lib/ahrefs/trend.ts';
import { trendPatch } from '../src/lib/services/refresh-service.ts';

let checks = 0;
let failures = 0;

function ok(condition: boolean, description: string) {
  checks += 1;
  if (condition) {
    console.log(`  PASS  ${description}`);
    return;
  }
  failures += 1;
  console.error(`  FAIL  ${description}`);
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const at = (iso: string) => new Date(iso);

console.log('\n--- which month a reading belongs to ---');

ok(monthKey(at('2026-10-15T09:00:00Z')) === '2026-10-01', 'a reading in October is October');
ok(monthKey(at('2026-01-01T00:00:00Z')) === '2026-01-01', 'the first instant of a month');
ok(monthKey(at('2026-12-31T23:59:59Z')) === '2026-12-01', 'and the last');
/*
  The one that matters. The refresh runs on a server whose local midnight is
  nobody's in particular; a reading taken at 23:30 UTC on the last of the
  month must land in that month wherever the function happened to run.
*/
ok(
  monthKey(at('2026-10-31T23:30:00Z')) === '2026-10-01',
  'late on the last day of a month is still that month, in UTC',
);
ok(monthKey(at('2026-11-01T00:30:00Z')) === '2026-11-01', 'and just after midnight is the next');

{
  /*
    Measured from a timezone where it matters, rather than asserted.

    On a UTC machine `getMonth` and `getUTCMonth` agree, so the check above
    passes whichever the implementation uses - and both CI and this container
    run UTC, which is exactly how a timezone bug survives a test suite. Node
    honours a `process.env.TZ` set at runtime, so this asks the question from
    UTC+14, where 23:30 on the 31st of October is already November locally.
  */
  const real = process.env.TZ;
  process.env.TZ = 'Pacific/Kiritimati';
  const boundary = at('2026-10-31T23:30:00Z');
  ok(boundary.getMonth() === 10, 'the test is standing somewhere that November has already started');
  ok(monthKey(boundary) === '2026-10-01', 'and the reading is still bucketed into October');
  if (real === undefined) delete process.env.TZ;
  else process.env.TZ = real;
}

console.log('\n--- the first reading a listing ever gets ---');

{
  const result = appendReading([], null, 4200, at('2026-10-15T09:00:00Z'));
  ok(same(result.trend, [4200]), 'starts the series');
  ok(result.month === '2026-10-01', 'and records the month it was taken in');
}

console.log('\n--- a second reading in the same month ---');

{
  const first = appendReading([], null, 4200, at('2026-10-02T09:00:00Z'));
  const second = appendReading(first.trend, first.month, 4600, at('2026-10-09T09:00:00Z'));
  ok(same(second.trend, [4600]), 'replaces the month rather than appending to it');
  ok(second.month === '2026-10-01', 'and the month is unchanged');

  // A tier 1 listing is refreshed weekly. Four readings in October must leave
  // one October point, or a weekly listing builds a series four times faster
  // than a monthly one and the two arrays mean different things.
  let series = appendReading([], null, 100, at('2026-10-01T09:00:00Z'));
  for (const [day, value] of [['08', 200], ['15', 300], ['22', 400]] as const) {
    // Zero-padded, because `2026-10-8` is not a date `new Date` can parse -
    // it returns Invalid Date, `monthKey` returns NaN-NaN-01, that matches no
    // stored month, and the test "proved" four readings become four points.
    series = appendReading(series.trend, series.month, value, at(`2026-10-${day}T09:00:00Z`));
  }
  ok(same(series.trend, [400]), 'four weekly readings in one month are one point');
  ok(series.trend.length === 1, 'and the series is one long, not four');
}

console.log('\n--- a reading in a new month ---');

{
  const october = appendReading([], null, 4200, at('2026-10-15T09:00:00Z'));
  const november = appendReading(october.trend, october.month, 4800, at('2026-11-03T09:00:00Z'));
  ok(same(november.trend, [4200, 4800]), 'appends, newest last');
  ok(november.month === '2026-11-01', 'and moves the marker on');
}

console.log('\n--- the cap ---');

{
  let series = { trend: [] as number[], month: null as string | null };
  // Fourteen consecutive months, which is two more than the series keeps.
  // Built with Date.UTC rather than by formatting a string, so month 13 is
  // January 2027 rather than a month nobody can parse.
  for (let month = 0; month < 14; month += 1) {
    const when = new Date(Date.UTC(2026, month, 10, 9, 0, 0));
    series = appendReading(series.trend, series.month, (month + 1) * 100, when);
  }
  ok(series.trend.length === TREND_MONTHS, `holds ${TREND_MONTHS} readings and no more`);
  ok(series.trend[series.trend.length - 1] === 1400, 'the newest reading is the last element');
  ok(series.trend[0] === 300, 'and the oldest two fell off the front');
}

console.log('\n--- a series from before the month marker existed ---');

{
  /*
    Rows that predate 0087 can hold points with no month. Appending is the
    conservative answer: we do not know which month that last point was taken
    in, and replacing a reading we cannot identify loses a real measurement
    to a guess. The cost of being wrong is one month holding two readings.
  */
  const result = appendReading([100, 200], null, 300, at('2026-10-15T09:00:00Z'));
  ok(same(result.trend, [100, 200, 300]), 'is appended to rather than overwritten');
  ok(result.month === '2026-10-01', 'and gains a marker from here on');
}

console.log('\n--- readings that are not measurements ---');

{
  ok(
    same(appendReading([100], '2026-09-01', Number.NaN, at('2026-10-15T09:00:00Z')).trend, [100, 0]),
    'a non-finite reading does not become a point of its own value',
  );
  ok(
    same(appendReading([100], '2026-09-01', -5, at('2026-10-15T09:00:00Z')).trend, [100, 0]),
    'and neither does a negative one',
  );
  ok(
    same(appendReading([100, Number.NaN, 300], '2026-09-01', 400, at('2026-10-15T09:00:00Z')).trend,
      [100, 300, 400]),
    'a corrupted point already in the array is dropped rather than drawn',
  );
  ok(
    same(appendReading([], null, 4200.6, at('2026-10-15T09:00:00Z')).trend, [4201]),
    'a fractional reading is rounded, because the column is integer[]',
  );
}

console.log('\n--- what the series says it changed by ---');

ok(trendChange([]) === null, 'no readings is not a change');
ok(trendChange([100]) === null, 'and one reading is not a change either');
{
  const change = trendChange([100, 150]);
  ok(change?.pct === 50, 'two readings, fifty per cent up');
  ok(change?.months === 1, 'across one month');
}
{
  const change = trendChange([200, 150]);
  ok(change?.pct === -25, 'a fall is negative');
}
{
  const change = trendChange([100, 110, 120, 130, 140, 150, 160]);
  ok(change?.months === 6, 'seven readings is a six-month change');
  ok(change?.pct === 60, 'measured end to end, not between the last two');
}
/*
  Zero is a real and terrible reading, and a rise from it has no percentage.
  Dividing by it would publish Infinity as a growth figure on a listing page.
*/
ok(trendChange([0, 500]) === null, 'a rise from zero has no percentage');

console.log('\n--- what the refresh actually writes ---');

{
  const patch = trendPatch(
    { traffic_trend: [100, 200], traffic_trend_month: '2026-09-01' },
    300,
    at('2026-10-15T09:00:00Z'),
  );
  ok(same(patch.traffic_trend, [100, 200, 300]), 'the series');
  ok(patch.traffic_trend_month === '2026-10-01', 'the month it was taken in');
  ok(patch.traffic_change_pct === 200, 'and the change across it');
}
{
  /*
    The rule the referring domain and keyword columns already follow: a
    reading Ahrefs did not give is not a reading of zero. On a chart a written
    zero is a cliff, and the next refresh would draw a recovery that never
    happened.
  */
  const patch = trendPatch({ traffic_trend: [100], traffic_trend_month: '2026-09-01' }, null, at('2026-10-15T09:00:00Z'));
  ok(Object.keys(patch).length === 0, 'a listing Ahrefs had no traffic for is left alone');
}
{
  const patch = trendPatch(undefined, 500, at('2026-10-15T09:00:00Z'));
  ok(same(patch.traffic_trend, [500]), 'a listing the batch query missed still starts a series');
  ok(patch.traffic_change_pct === null, 'with no change figure, because one reading is not a change');
}
{
  /*
    The panel needs both. `hasTrend` is `trafficTrend.length > 0 && typeof
    change === 'number'`, so a series written without a change figure reads
    "Not recorded" however many points it holds - which is right for one
    reading and would be wrong for two.
  */
  const first = trendPatch({ traffic_trend: [], traffic_trend_month: null }, 100, at('2026-09-15T09:00:00Z'));
  ok(first.traffic_change_pct === null, 'one reading draws nothing');
  const second = trendPatch(
    { traffic_trend: first.traffic_trend as number[], traffic_trend_month: first.traffic_trend_month as string },
    120,
    at('2026-10-15T09:00:00Z'),
  );
  ok(second.traffic_change_pct === 20, 'and the second reading is what lights the panel');
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) {
  console.error(`${failures} failed`);
  process.exit(1);
}
