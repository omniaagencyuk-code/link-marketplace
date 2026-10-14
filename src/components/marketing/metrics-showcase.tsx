'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useInView, useReducedMotion } from 'motion/react';
import { Flag } from '@/components/shared/flag';
import { formatCompactNumber } from '@/lib/utils/format';
import { demoFeatured } from '@/lib/marketing/demo-data';

/**
 * The four figures a buyer actually checks, drawn rather than listed.
 *
 * Shared by /guest-posts and the homepage, which is why it lives in
 * `marketing/` rather than under either of them. One copy of the drawing: the
 * traffic line, the counters and the country bars are the fiddly part, and two
 * of them would drift the first time one was tuned.
 *
 * Every number here belongs to the same invented publisher the hero panel
 * opens - `northfieldfinance.example`, a domain RFC 2606 reserves so that it
 * can never be a real site. Using one publisher throughout means the page
 * reads as one example rather than four unrelated screenshots, and the
 * figures stay consistent with each other.
 *
 * The animation is the drawing: the traffic line draws left to right, the
 * domain rating counts up, the country bars grow and the keyword figure
 * ticks. All four start only when the section is on screen, all four run
 * once, and under reduced motion every one of them is simply rendered at its
 * final value.
 */

export function MetricsShowcase({ layout = 'wide' }: { layout?: 'wide' | 'stacked' }) {
  const section = useRef<HTMLDivElement>(null);
  const seen = useInView(section, { once: true, amount: 0.3 });
  const still = useReducedMotion();
  const live = Boolean(still) || seen;
  const listing = demoFeatured();
  /*
    `stacked` is the same four panels in one column, for a section that puts
    this beside its own copy rather than across the page. A prop rather than a
    second component: the arrangement is all that differs, and the half worth
    getting right - the draw, the counters, the bars - is the half that would
    have been copied.
  */
  const narrow = layout === 'stacked';

  return (
    <div
      ref={section}
      className={narrow ? 'grid gap-4' : 'grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]'}
    >
      <TrafficPanel trend={listing.trend} live={live} still={Boolean(still)} />

      <div className={narrow ? 'grid gap-4 sm:grid-cols-2' : 'grid gap-5 sm:grid-cols-2 lg:grid-cols-1'}>
        <RatingPanel rating={listing.domainRating} live={live} still={Boolean(still)} />
        <KeywordsPanel keywords={listing.keywords} live={live} still={Boolean(still)} />
      </div>

      {/* Full width in the wide arrangement; in one column there is nothing to
          span, and `lg:col-span-2` would ask the grid for a column it does not
          have. */}
      <div className={narrow ? undefined : 'lg:col-span-2'}>
        <CountriesPanel audience={listing.audience} live={live} still={Boolean(still)} />
      </div>
    </div>
  );
}

/** A frame with a label, used by all four. */
function Panel({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-white p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[12px] font-semibold tracking-[0.08em] text-muted uppercase">
          {label}
        </h3>
        {hint ? <span className="text-[11px] text-muted-soft">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

/** Twelve months of organic traffic, drawn as it comes into view. */
function TrafficPanel({
  trend,
  live,
  still,
}: {
  trend: number[];
  live: boolean;
  still: boolean;
}) {
  const width = 520;
  const height = 150;
  const top = Math.max(...trend);
  const bottom = Math.min(...trend);
  const span = Math.max(1, top - bottom);

  const points = trend.map((value, index) => {
    const x = (index / (trend.length - 1)) * width;
    // 12px of headroom top and bottom so the line never touches the frame.
    const y = height - 12 - ((value - bottom) / span) * (height - 24);
    return [x, y] as const;
  });

  const line = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x},${y}`).join(' ');
  const area = `${line} L${width},${height} L0,${height} Z`;

  return (
    <Panel label="Organic traffic" hint="12 months">
      <p className="tabular mt-3 text-3xl font-semibold text-ink">
        <Counter to={trend[trend.length - 1]! * 1000} live={live} still={still} compact />
      </p>
      <p className="mt-1 text-[13px] text-muted">
        Monthly visits from search, measured rather than claimed.
      </p>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mt-4 h-[150px] w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label="A traffic line rising across twelve months"
      >
        <defs>
          <linearGradient id="gp-traffic-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent-500)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--color-accent-500)" stopOpacity="0" />
          </linearGradient>
        </defs>

        <motion.path
          d={area}
          fill="url(#gp-traffic-fill)"
          initial={still ? false : { opacity: 0 }}
          /*
            After the line, not alongside it. At a 0.5s delay against a 1.1s
            draw the fill arrived under stretches of chart the line had not
            reached yet, so the area appeared to lead its own boundary.
          */
          animate={live ? { opacity: 1 } : undefined}
          transition={{ duration: 0.5, delay: still ? 0 : 0.95 }}
        />
        {/*
          `pathLength` 0 to 1 rather than a dash-offset calculation: Motion
          normalises it, so the draw works without knowing the path's real
          length in user units.
        */}
        <motion.path
          d={line}
          fill="none"
          stroke="var(--color-accent-600)"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          initial={still ? false : { pathLength: 0 }}
          animate={live ? { pathLength: 1 } : undefined}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
    </Panel>
  );
}

/** Domain rating, counting up to its value. */
function RatingPanel({
  rating,
  live,
  still,
}: {
  rating: number;
  live: boolean;
  still: boolean;
}) {
  return (
    <Panel label="Domain rating" hint="Ahrefs">
      <div className="mt-3 flex items-end gap-4">
        <p className="tabular text-3xl font-semibold text-ink">
          <Counter to={rating} live={live} still={still} />
        </p>
        <div className="mb-2 flex-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-sunken">
            <motion.div
              className="h-full rounded-full bg-accent-600"
              initial={still ? false : { width: 0 }}
              animate={live ? { width: `${rating}%` } : undefined}
              transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-muted">Out of 100</p>
        </div>
      </div>
    </Panel>
  );
}

/** Keywords the publisher ranks for. */
function KeywordsPanel({
  keywords,
  live,
  still,
}: {
  keywords: number;
  live: boolean;
  still: boolean;
}) {
  return (
    <Panel label="Tracked keywords" hint="Top 100">
      <p className="tabular mt-3 text-3xl font-semibold text-ink">
        <Counter to={keywords} live={live} still={still} compact />
      </p>
      <p className="mt-1 text-[13px] text-muted">
        Terms the site already ranks for, which is what makes a link from it worth having.
      </p>
    </Panel>
  );
}

/** Where the readers are, as bars with their flags. */
function CountriesPanel({
  audience,
  live,
  still,
}: {
  audience: { country: string; share: number }[];
  live: boolean;
  still: boolean;
}) {
  return (
    <Panel label="Traffic by country" hint="Share of visits">
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {audience.map((entry, index) => (
          <li key={entry.country}>
            <div className="flex items-center gap-2">
              <Flag country={entry.country} className="h-3.5 w-5 rounded-[2px]" />
              <span className="text-[13px] font-medium text-ink">{entry.country}</span>
              <span className="tabular ml-auto text-[13px] text-ink-soft">{entry.share}%</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-sunken">
              <motion.div
                className="h-full rounded-full bg-accent-500"
                initial={still ? false : { width: 0 }}
                animate={live ? { width: `${entry.share}%` } : undefined}
                transition={{
                  duration: 0.8,
                  delay: still ? 0 : 0.15 + index * 0.1,
                  ease: [0.22, 1, 0.36, 1],
                }}
              />
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/**
 * A number counting up to its value.
 *
 * Not Motion's `animate` on a motion value: this has to render the final
 * figure in the server HTML and when stillness is asked for, and the
 * simplest way to guarantee that is to hold the number in state with the
 * answer as its initial value. It only ever counts *down* to zero and back
 * up if the animation runs, so there is no frame in which the real figure is
 * missing from the document.
 */
function Counter({
  to,
  live,
  still,
  compact = false,
}: {
  to: number;
  live: boolean;
  still: boolean;
  compact?: boolean;
}) {
  const [value, setValue] = useState(to);

  useEffect(() => {
    /*
      Nothing to do, and deliberately no `setValue(to)` here.

      The state already holds the answer - it is the initial value - so
      setting it again would be a synchronous setState inside an effect,
      which renders twice for every change and which this codebase's lint
      refuses. It is the same rule that shaped the admin drawer and the
      three tables before it: store what the state is *about* and derive
      the rest.
    */
    if (still || !live) return;

    const duration = 900;
    const started = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      // Ease out, so it slows into the answer rather than stopping dead.
      const eased = 1 - (1 - progress) ** 3;
      setValue(Math.round(to * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [to, live, still]);

  return <>{compact ? formatCompactNumber(value) : value.toLocaleString('en-GB')}</>;
}
