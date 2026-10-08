import { axisTicks, plotArea, ringArcs, type Point } from '@/lib/admin/chart-geometry';
import { formatPrice } from '@/lib/utils/format';

/**
 * The dashboard's three drawings, as SVG.
 *
 * Server components: they take numbers and return markup, with no interaction
 * beyond the browser's own tooltips. That keeps the whole dashboard a server
 * render - no charting library in the bundle, and no second request to fill
 * the charts in after the page arrives.
 *
 * The arithmetic is in `lib/admin/chart-geometry`, where it is checked without
 * a browser. A chart with a wrong denominator still slopes and still has a
 * peak; it is wrong in a way nobody can see by looking.
 */

const AREA_W = 760;
const AREA_H = 200;

export function RevenueArea({ points }: { points: Point[] }) {
  const plot = plotArea(points, AREA_W, AREA_H);
  const ticks = axisTicks(plot.peak);

  if (points.length === 0) {
    return <EmptyChart message="No orders in this period." height={AREA_H} />;
  }

  return (
    <div className="flex gap-3">
      {/* Labelled in money rather than in minor units, top value first. */}
      <ul className="tabular flex w-16 shrink-0 flex-col-reverse justify-between py-1 text-right text-[10px] text-muted">
        {ticks.map((tick) => (
          <li key={tick}>{formatPrice(tick)}</li>
        ))}
      </ul>

      <div className="min-w-0 flex-1">
        <svg
          viewBox={`0 0 ${AREA_W} ${AREA_H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`Revenue per day. Highest ${formatPrice(plot.peak)}.`}
          className="h-48 w-full"
        >
          <defs>
            <linearGradient id="revenue-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-accent-500)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--color-accent-500)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {ticks.map((tick) => {
            const y = AREA_H - (plot.peak > 0 ? (tick / plot.peak) * AREA_H : 0);
            return (
              <line
                key={tick}
                x1="0"
                x2={AREA_W}
                y1={y}
                y2={y}
                stroke="var(--color-line)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}

          <path d={plot.area} fill="url(#revenue-fill)" />
          <path
            d={plot.line}
            fill="none"
            stroke="var(--color-accent-600)"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {/*
          Three labels, not one per day. Ninety days of dates under a chart is
          a grey smear; the ends and the middle are what somebody reads.
        */}
        <div className="mt-1 flex justify-between text-[10px] text-muted">
          <span>{points[0]?.label}</span>
          {points.length > 2 ? <span>{points[Math.floor(points.length / 2)]?.label}</span> : null}
          <span>{points[points.length - 1]?.label}</span>
        </div>
      </div>
    </div>
  );
}

export function Sparkline({ points }: { points: Point[] }) {
  const plot = plotArea(points, 100, 28);
  if (points.length < 2) return null;

  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true" className="h-7 w-full">
      <path
        d={plot.line}
        fill="none"
        stroke="var(--color-accent-500)"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

const RING_R = 54;
const RING_C = 2 * Math.PI * RING_R;

export function StatusRing({
  slices,
  total,
}: {
  slices: { key: string; label: string; value: number; colour: string }[];
  total: number;
}) {
  const arcs = ringArcs(slices, RING_C);

  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative h-40 w-40 shrink-0">
        <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90" role="img" aria-label="Orders by status">
          <circle
            cx="70"
            cy="70"
            r={RING_R}
            fill="none"
            stroke="var(--color-surface-sunken)"
            strokeWidth="16"
          />
          {arcs.map((arc, index) => (
            <circle
              key={arc.key}
              cx="70"
              cy="70"
              r={RING_R}
              fill="none"
              stroke={slices[index]!.colour}
              strokeWidth="16"
              strokeDasharray={`${arc.dash} ${RING_C - arc.dash}`}
              strokeDashoffset={arc.offset}
            />
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="tabular text-[22px] font-semibold text-ink">
            {total.toLocaleString('en-GB')}
          </span>
          <span className="text-[11px] text-muted">Total orders</span>
        </div>
      </div>

      <ul className="min-w-0 flex-1 space-y-2">
        {slices.map((slice, index) => (
          <li key={slice.key} className="flex items-center gap-2 text-[13px]">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: slice.colour }}
            />
            <span className="min-w-0 flex-1 truncate text-ink-soft">{slice.label}</span>
            <span className="tabular shrink-0 font-medium text-ink">
              {slice.value.toLocaleString('en-GB')}
            </span>
            <span className="tabular w-12 shrink-0 text-right text-muted">
              {(arcs[index]!.share * 100).toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function EmptyChart({ message, height }: { message: string; height: number }) {
  return (
    <div
      style={{ minHeight: height }}
      className="flex items-center justify-center rounded-lg border border-dashed border-line text-[13px] text-muted"
    >
      {message}
    </div>
  );
}
