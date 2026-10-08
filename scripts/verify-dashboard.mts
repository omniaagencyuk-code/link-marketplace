/**
 * The window the admin dashboard counts over.
 *
 * Pure arithmetic, and the kind that looks right and is not: an exclusive end
 * that lands an hour early drops this afternoon's orders out of "today", and
 * a preceding period computed from an unbounded range produces a percentage
 * against nothing.
 *
 * No database, no network, no key.
 */

import {
  DEFAULT_RANGE,
  formatDay,
  percentChange,
  readDay,
  resolveRange,
} from '../src/lib/admin/date-range';
import { axisTicks, plotArea, ringArcs } from '../src/lib/admin/chart-geometry';

function yes(what: string, got: boolean) {
  is(what, got, true);
}

let failures = 0;
function is(what: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}${ok ? '' : ` - expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`}`);
}

// A Wednesday afternoon, so "today" has hours left in it.
const NOW = new Date('2026-06-17T14:30:00Z');

console.log('\n--- where a range ends ---');
{
  const today = resolveRange('today', undefined, undefined, NOW);
  /*
    The end is the start of tomorrow, not the current moment.

    Ending "now" drops everything placed later today, and the figure then
    changes every time somebody opens the page - which reads as orders
    disappearing.
  */
  is('today ends at the start of tomorrow', today.to?.toISOString(), '2026-06-18T00:00:00.000Z');
  is('and starts at the start of today', today.from?.toISOString(), '2026-06-17T00:00:00.000Z');
  is('which is one day', (today.to!.getTime() - today.from!.getTime()) / 86_400_000, 1);
}
{
  const week = resolveRange('7d', undefined, undefined, NOW);
  is('seven days is seven days', (week.to!.getTime() - week.from!.getTime()) / 86_400_000, 7);
  is('and it includes today', week.to! > NOW, true);
}
{
  const year = resolveRange('year', undefined, undefined, NOW);
  is('this year starts on the first of January', year.from?.toISOString(), '2026-01-01T00:00:00.000Z');
}

console.log('\n--- all time has nothing before it ---');
{
  const all = resolveRange('all', undefined, undefined, NOW);
  is('it is unbounded', [all.from, all.to], [null, null]);
  // The card has to tell "no change" from "nothing to compare with".
  is('and reports that it cannot be compared', all.comparable, false);
  is('every other range can be', resolveRange('30d', undefined, undefined, NOW).comparable, true);
}

console.log('\n--- a range somebody typed ---');
{
  const custom = resolveRange('custom', '2026-03-01', '2026-03-31', NOW);
  is('it is used', custom.key, 'custom');
  // Exclusive end, so the last day picked is included in full rather than
  // stopping at midnight on the morning of it.
  is('the last day is included whole', custom.to?.toISOString(), '2026-04-01T00:00:00.000Z');
  is('and it is labelled with its own dates', custom.label, '2026-03-01 to 2026-03-31');
}
{
  /*
    A half-filled or reversed range falls back rather than counting over a
    window nobody asked for. An empty dashboard reads as a quiet month.
  */
  is('one end missing falls back', resolveRange('custom', '2026-03-01', undefined, NOW).key, DEFAULT_RANGE);
  is('the wrong way round falls back', resolveRange('custom', '2026-03-31', '2026-03-01', NOW).key, DEFAULT_RANGE);
  is('a date that is not one falls back', resolveRange('custom', 'last March', '2026-03-01', NOW).key, DEFAULT_RANGE);
  is('and so does the thirtieth of February', resolveRange('custom', '2026-02-30', '2026-03-01', NOW).key, DEFAULT_RANGE);
}
{
  is('an unknown range key falls back', resolveRange('fortnight', undefined, undefined, NOW).key, DEFAULT_RANGE);
  is('and so does none at all', resolveRange(undefined, undefined, undefined, NOW).key, DEFAULT_RANGE);
}

console.log('\n--- reading a day ---');
is('an ISO day is read', formatDay(readDay('2026-03-01')!), '2026-03-01');
is('a day that is not one is nothing', readDay('31/03/2026'), null);
is('nor is the thirtieth of February', readDay('2026-02-30'), null);
is('nor is the thirteenth month', readDay('2026-13-01'), null);
is('blank is nothing', readDay(''), null);

console.log('\n--- comparing with the period before ---');
is('a rise is a positive percentage', percentChange(150, 100), 50);
is('a fall is a negative one', percentChange(50, 100), -50);
is('no change is zero', percentChange(100, 100), 0);
/*
  The one that matters. Every increase from nothing is infinite, and "+100%"
  against a month with no orders reads as growth when it means "the first
  one". Nothing is the honest answer and the card prints no badge at all.
*/
is('a rise from nothing is not a percentage', percentChange(42, 0), null);
is('and neither is nothing from nothing', percentChange(0, 0), null);

console.log('\n--- laying an area chart out ---');
{
  const plot = plotArea(
    [
      { label: 'a', value: 0 },
      { label: 'b', value: 50 },
      { label: 'c', value: 100 },
    ],
    300,
    100,
  );
  is('the points are spread across the full width', [plot.dots[0]!.x, plot.dots[2]!.x], [0, 300]);
  /*
    The scale starts at zero, not at the smallest value.

    Scaling to a chart's own range turns a wobble between 980 and 1000 into a
    mountain, which is the commonest way a revenue chart lies. Here the
    lowest point must sit on the baseline only because it IS zero.
  */
  is('the tallest point is at the top', plot.dots[2]!.y, 0);
  is('a zero sits on the baseline', plot.dots[0]!.y, 100);
  is('and half of the peak is halfway up', plot.dots[1]!.y, 50);
  is('the peak is reported for the axis', plot.peak, 100);
  yes('the area closes back to the baseline', plot.area.endsWith('Z'));
}
{
  /*
    Nothing sold.

    Dividing by a peak of zero makes every coordinate NaN, SVG rejects the
    path and the chart silently does not render - which looks like a loading
    bug rather than an empty month.
  */
  const flat = plotArea([{ label: 'a', value: 0 }, { label: 'b', value: 0 }], 300, 100);
  yes('a flat zero run produces no NaN', !/NaN/.test(flat.line + flat.area));
  is('and draws along the bottom', [flat.dots[0]!.y, flat.dots[1]!.y], [100, 100]);
}
{
  const one = plotArea([{ label: 'a', value: 5 }], 300, 100);
  yes('a single point does not divide by zero', !/NaN/.test(one.line));
  is('and sits in the middle', one.dots[0]!.x, 150);
}
{
  const none = plotArea([], 300, 100);
  is('no points is an empty path rather than a crash', [none.line, none.area], ['', '']);
}

console.log('\n--- slicing a ring ---');
{
  const arcs = ringArcs(
    [
      { key: 'live', value: 50 },
      { key: 'cancelled', value: 25 },
      { key: 'draft', value: 25 },
    ],
    400,
  );
  is('the shares add to one', Math.round(arcs.reduce((sum, a) => sum + a.share, 0) * 1000) / 1000, 1);
  is('a half is half the circumference', arcs[0]!.dash, 200);
  is('the first slice starts at the top', arcs[0]!.offset, 0);
  // Each one begins where the last ended, or the ring has a gap in it.
  is('the second starts where the first ended', arcs[1]!.offset, -200);
  is('and the third where the second did', arcs[2]!.offset, -300);
}
{
  /*
    An empty status keeps its place in the legend. One that vanishes when it
    empties reads as a status that was removed.
  */
  const withEmpty = ringArcs([{ key: 'live', value: 3 }, { key: 'cancelled', value: 0 }], 400);
  is('an empty slice is still listed', withEmpty.length, 2);
  is('with no share', withEmpty[1]!.share, 0);
}
{
  const allEmpty = ringArcs([{ key: 'live', value: 0 }, { key: 'draft', value: 0 }], 400);
  yes('a ring of nothing produces no NaN', allEmpty.every((a) => Number.isFinite(a.share)));
  is('and no stroke at all', allEmpty.map((a) => a.dash), [0, 0]);
}
{
  // A negative cannot happen from a count, and must not invert the ring if it does.
  const negative = ringArcs([{ key: 'a', value: -5 }, { key: 'b', value: 5 }], 400);
  is('a negative is treated as nothing', negative[0]!.share, 0);
  is('and the rest is the whole ring', negative[1]!.dash, 400);
}

console.log('\n--- axis labels ---');
is('a peak of nothing is a single zero', axisTicks(0), [0]);
yes('ticks start at zero', axisTicks(1847)[0] === 0);
yes('and reach past the peak', axisTicks(1847).at(-1)! >= 1847);
// Readable, not exact: an axis saying 1847.33 is a real number and a useless
// label.
yes('the step is a round number', axisTicks(1847).every((t) => t % 500 === 0));

console.log(failures === 0 ? '\n  all passed\n' : `\n  ${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
