/**
 * The arithmetic behind the dashboard's charts.
 *
 * Drawn as SVG rather than with a charting library. Three shapes are wanted -
 * an area, a ring and a sparkline - and the smallest of the usual libraries is
 * a few hundred kilobytes of JavaScript shipped to a page that renders three
 * of them. This codebase already draws its own parrot.
 *
 * Separated from the components because this is where the mistakes are. An
 * area chart with a wrong denominator is still a plausible-looking chart: it
 * slopes, it has a peak, and it is wrong in a way nobody can see. The numbers
 * are checked here instead, without a browser.
 */

/** A point on the area chart, already in the order it is drawn. */
export interface Point {
  label: string;
  value: number;
}

export interface Plot {
  /** The line, as an SVG path in the 0..width by 0..height box. */
  line: string;
  /** The same line closed down to the baseline, for the gradient fill. */
  area: string;
  /** Where each point landed, for dots and hit areas. */
  dots: { x: number; y: number; point: Point }[];
  /** The largest value, which is what the axis is labelled with. */
  peak: number;
}

/**
 * Lay points out across a box.
 *
 * The vertical scale starts at zero rather than at the smallest value. A chart
 * scaled to its own range turns a wobble between £980 and £1,000 into a
 * mountain, which is the single most common way a revenue chart lies.
 */
export function plotArea(points: readonly Point[], width: number, height: number): Plot {
  if (points.length === 0) {
    return { line: '', area: '', dots: [], peak: 0 };
  }

  const peak = Math.max(...points.map((p) => p.value), 0);

  /*
    A flat run of zeros draws along the bottom rather than through the middle.

    Dividing by a peak of zero is the classic NaN path: every coordinate
    becomes NaN, the path attribute is rejected, and the chart silently does
    not appear. A denominator of one puts every point at zero height, which is
    what "nothing sold" should look like.
  */
  const scale = peak > 0 ? peak : 1;

  // One point has no width to spread across, so it sits in the middle rather
  // than dividing by zero and landing at NaN.
  const step = points.length > 1 ? width / (points.length - 1) : 0;
  const dots = points.map((point, index) => ({
    x: points.length > 1 ? index * step : width / 2,
    // SVG y grows downwards, so the tallest value is the smallest y.
    y: height - (point.value / scale) * height,
    point,
  }));

  const line = dots
    .map((dot, index) => `${index === 0 ? 'M' : 'L'}${round(dot.x)},${round(dot.y)}`)
    .join(' ');

  const area =
    dots.length > 0
      ? `${line} L${round(dots[dots.length - 1]!.x)},${height} L${round(dots[0]!.x)},${height} Z`
      : '';

  return { line, area, dots, peak };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** One arc of the ring, as a stroke-dash offset around a circle. */
export interface Arc {
  key: string;
  value: number;
  /** Portion of the whole, 0..1. */
  share: number;
  /** Length of the visible stroke, in the circle's own units. */
  dash: number;
  /** Where the stroke starts, in the same units. */
  offset: number;
}

/**
 * Slice a ring.
 *
 * `stroke-dasharray` on one circle per slice rather than arc paths: the maths
 * is one subtraction instead of four trigonometric calls, and the result is
 * the same ring.
 *
 * Slices with no value are kept, with a share of zero. A legend that drops its
 * empty entries changes shape between one day and the next, and an admin
 * reading it cannot tell a status that is empty from one that was removed.
 */
export function ringArcs(
  slices: readonly { key: string; value: number }[],
  circumference: number,
): Arc[] {
  const total = slices.reduce((sum, slice) => sum + Math.max(0, slice.value), 0);
  let used = 0;

  return slices.map((slice) => {
    const value = Math.max(0, slice.value);
    const share = total > 0 ? value / total : 0;
    const dash = share * circumference;
    // Drawn clockwise from the top: the offset counts backwards from the
    // start of the circle, so each slice begins where the last one ended.
    const arc: Arc = { key: slice.key, value, share, dash, offset: -used };
    used += dash;
    return arc;
  });
}

/**
 * The tick values for an axis, from zero to the peak.
 *
 * Rounded up to something readable, so an axis says £2,000 rather than
 * £1,847.33 - which is a real number and a useless label.
 */
export function axisTicks(peak: number, count = 4): number[] {
  if (peak <= 0) return [0];

  const rough = peak / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((n) => n * magnitude).find((n) => n >= rough) ?? magnitude * 10;

  const ticks: number[] = [];
  for (let value = 0; value <= peak + step / 2; value += step) ticks.push(value);
  return ticks;
}
