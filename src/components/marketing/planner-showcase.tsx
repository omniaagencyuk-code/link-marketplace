'use client';

import { useEffect, useReducer, useRef, useState } from 'react';
import { motion, useInView, useReducedMotion } from 'motion/react';
import { Check } from 'lucide-react';
import { formatCompactNumber, formatPrice } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import {
  DEMO_LISTINGS,
  DEMO_PLAN,
  DEMO_PLAN_MEASURED,
  DEMO_PLAN_MONTH,
  DEMO_PLAN_NEW,
  DEMO_PLAN_PROJECT,
  DEMO_PLAN_STATUSES,
  type DemoPlanRow,
} from '@/lib/marketing/demo-data';
import type { ShowcaseStepCopy } from '@/components/home/marketplace-showcase';

/**
 * The planner filling in one row, and the totals that follow from it.
 *
 * Six beats on a loop, each changing exactly one thing: a plan with four rows
 * in it, a domain typed into the fifth, the metrics we already hold arriving
 * against it, the month and price set, the status moved to Live by hand, and
 * the committed figure moving while the paid figure does not.
 *
 * ## Why the last beat is the point
 *
 * Because it is the rule the feature is built on and the one a demonstration
 * would most easily get wrong. `reports.tsx` prints "a link going live does
 * not make it paid" under the real figures, so an animation where Live moved
 * money would teach the opposite of what the product does. The third row goes
 * live still unpaid; committed rises, paid sits still.
 *
 * The same discipline covers the beat before it. The status is moved *by
 * somebody*, and the caption beside it says so, because the planner checks
 * nothing: no crawl, no link checking, no lost-link detection. An animation
 * of a link "going live" on its own would be the one claim this feature
 * refuses to make.
 *
 * ## Why it is not the marketplace showcase
 *
 * That one narrows a list to a publisher - a filter rail, a match count, a
 * bookmark. This is a spreadsheet gaining a row and a total, which is a
 * different argument in a different shape: no filtering, nothing excluded,
 * and the figures underneath are the subject rather than the metrics inside
 * a row. What they share is the arrangement - editable captions beside a
 * panel that cannot move - and the publishers, which are the same invented
 * five on reserved domains.
 *
 * ## The three rules it keeps, the same three that one does
 *
 * **It stops when nobody is looking.** `useInView` gates the timer.
 *
 * **It respects reduced motion.** Asked for stillness it renders the last
 * beat - row filled, live, totals settled - and never moves. That is the
 * state the sequence exists to arrive at.
 *
 * **It cannot shift the layout, structurally rather than by measurement.**
 * The marketplace panel needed its height measuring because rows arrive and
 * leave inside it. Nothing arrives here: all five rows are in the markup
 * from the first frame, the third drawn as an empty slot until it is filled,
 * and every cell that fills has a fixed-width track. So the only thing any
 * beat changes is the text inside a box whose size is already decided, and
 * the panel's height is the sum of its parts rather than a sampled figure:
 * header 3.25rem, column heads 1.5rem, five rows at 3rem, the totals strip
 * 3.25rem and the footnote 3rem - two lines of it at phone width - plus
 * 0.25rem of padding, so 26rem, which is
 * what the panel is set to. Checked in a browser at 1440, 820 and 390 across
 * a full loop: one height at all three, and nothing overflowing it.
 *
 * ## Why the totals are at the bottom
 *
 * They were in the header, which put the subject of the last beat in the one
 * strip a phone's sticky site header covers as the panel scrolls into view -
 * and under the "Example data" badge, which sits top right and was drawn over
 * the word "Paid". At the foot of a table is also where a spreadsheet keeps
 * its sums, which is the thing this panel is pretending to be.
 */

const STEPS = ['plan', 'domain', 'lookup', 'price', 'live', 'totals'] as const;
type Step = (typeof STEPS)[number];

/** How long each beat holds, in milliseconds. */
const HOLD: Record<Step, number> = {
  plan: 2000,
  // Long enough to watch a domain being typed rather than appear.
  domain: 2400,
  lookup: 2600,
  price: 2400,
  live: 2200,
  // The one worth lingering on: it is the rule the panel exists to show.
  totals: 3800,
};

const stepIndex = (step: Step) => STEPS.indexOf(step);

/**
 * One caption per beat, so the index is the mapping.
 *
 * The marketplace showcase writes its mapping out because it has seven beats
 * against six captions. Here they are one to one, and a `Record` repeating
 * `0,1,2,3,4,5` would be a second place for them to disagree.
 */
const CAPTIONS = STEPS.length;

/**
 * A domain appearing a character at a time, as the search box does on
 * /guest-posts.
 *
 * Its own component, mounted only for the beat that types, so the count
 * starts at nothing because the component is new rather than because an
 * effect reset it. The first version was a hook that set the count back to
 * zero inside its effect, which React's own lint rule refuses - a
 * synchronous setState in an effect is a second render of everything around
 * it, and the panel re-renders on every tick of this interval.
 */
function Typed({ text, still }: { text: string; still: boolean }) {
  const [shown, setShown] = useState(still ? text.length : 0);

  useEffect(() => {
    if (still) return;
    const timer = setInterval(
      () => setShown((count) => (count >= text.length ? count : count + 1)),
      45,
    );
    return () => clearInterval(timer);
  }, [text, still]);

  return (
    <>
      {text.slice(0, shown)}
      {/* The caret, while there is something still to type. */}
      {!still && shown < text.length ? (
        <span className="ml-px inline-block h-[0.9em] w-px translate-y-[0.1em] bg-accent-600" />
      ) : null}
    </>
  );
}

const listingFor = (row: DemoPlanRow) =>
  DEMO_LISTINGS.find((listing) => listing.id === row.listingId);

export function PlannerShowcase({ steps }: { steps: ShowcaseStepCopy[] }) {
  const panel = useRef<HTMLDivElement>(null);
  // A sliver of the panel at the bottom of the screen is not somebody
  // watching it, which is what the marketplace showcase found too.
  const onScreen = useInView(panel, { amount: 0.35 });
  const still = useReducedMotion();

  const [step, advance] = useReducer(
    (current: Step) => STEPS[(stepIndex(current) + 1) % STEPS.length]!,
    'plan',
  );

  useEffect(() => {
    // Stillness means the end state, held. No timer at all.
    if (still || !onScreen) return;
    const timer = setTimeout(advance, HOLD[step]);
    return () => clearTimeout(timer);
  }, [step, onScreen, still]);

  const shown: Step = still ? 'totals' : step;
  const at = stepIndex(shown);

  const named = at >= stepIndex('domain');
  const measured = at >= stepIndex('lookup');
  const priced = at >= stepIndex('price');
  const live = at >= stepIndex('live');
  const counted = at >= stepIndex('totals');


  /*
    The figures, computed from the rows rather than written down.

    These are the two definitions in `summary.ts`: paid is money that has
    left, committed is a price on work that has not been paid for. Computing
    them here from the same rows the panel draws means the totals cannot
    drift from the plan above them - which is the whole subject of the last
    beat, and would be a strange thing to hardcode.

    The new row only joins the sum once the panel has caught up, so the
    figures move on the beat whose caption says they do.
  */
  const inPlay = DEMO_PLAN.filter((row, index) => index !== DEMO_PLAN_NEW || (priced && counted));
  const paidMinor = inPlay
    .filter((row) => row.paid)
    .reduce((total, row) => total + row.priceMinor, 0);
  const committedMinor = inPlay
    .filter((row) => !row.paid)
    .reduce((total, row) => total + row.priceMinor, 0);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-10">
      {/*
        The captions are ordinary content: editable, server-rendered, and
        readable with the animation stopped or never started. The highlight is
        the only thing the sequence does to them.
      */}
      {steps.length ? (
        <ol className="order-2 space-y-1 lg:order-1">
          {steps.slice(0, CAPTIONS).map((copy, index) => {
            const current = index === at;
            return (
              <li
                key={copy.label || index}
                className={cn(
                  'rounded-lg border px-4 py-3 transition-colors duration-500',
                  current ? 'border-accent-200 bg-white' : 'border-transparent',
                )}
              >
                <p className="flex items-center gap-2.5 text-[14px] font-semibold text-ink">
                  <span
                    className={cn(
                      'tabular flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] transition-colors duration-500',
                      current ? 'bg-accent-700 text-white' : 'bg-white text-muted',
                    )}
                    aria-hidden="true"
                  >
                    {index + 1}
                  </span>
                  {copy.label}
                </p>
                <p className="mt-1 pl-[1.9rem] text-[13px] leading-relaxed text-muted">
                  {copy.body}
                </p>
              </li>
            );
          })}
        </ol>
      ) : null}

      <div className="order-1 min-w-0 lg:order-2">
        <div
          ref={panel}
          /*
            A fixed height, for the reason the marketplace panel has one: the
            captions sit beside it, and a container that grew would nudge them
            ten times a minute - and on a phone it would move the page under
            it. Here nothing inside it resizes either, so the height is
            arithmetic rather than a sampled maximum.
          */
          className="relative h-[26rem] w-full overflow-hidden rounded-[var(--radius-card)] border border-line bg-white shadow-[var(--shadow-pop)]"
          aria-hidden="true"
        >
          {/* The project. Nothing else up here: the badge sits in this strip's
              right-hand end, and anything beside it would be drawn under. */}
          <div className="flex h-[3.25rem] items-center border-b border-line px-3.5 sm:px-4">
            <div className="min-w-0">
              <p className="text-[10px] tracking-[0.1em] text-muted uppercase">Project</p>
              <p className="truncate text-[14px] font-semibold text-ink">{DEMO_PLAN_PROJECT}</p>
            </div>
          </div>

          <div className="px-1.5 sm:px-2">
            {/* The column heads and every row share one template, so a cell
                filling in changes text inside a track rather than the track. */}
            <div className="grid h-[1.5rem] grid-cols-[minmax(0,1fr)_2.75rem_4.25rem_5.5rem] items-center gap-2 px-2 text-[10px] tracking-wide text-muted uppercase sm:grid-cols-[minmax(0,1fr)_2.75rem_3.75rem_4.75rem_4.25rem_5.5rem]">
              <span>Domain</span>
              <span className="text-right">DR</span>
              <span className="hidden text-right sm:block">Traffic</span>
              <span className="hidden sm:block">Month</span>
              <span className="text-right">Price</span>
              <span className="pl-1">Status</span>
            </div>

            {DEMO_PLAN.map((row, index) => {
              const isNew = index === DEMO_PLAN_NEW;
              const listing = listingFor(row);
              const status = isNew
                ? live
                  ? DEMO_PLAN_STATUSES.live
                  : priced
                    ? DEMO_PLAN_STATUSES.planned
                    : null
                : DEMO_PLAN_STATUSES[row.status];

              return (
                <div
                  key={row.domain}
                  className={cn(
                    'grid h-[3rem] grid-cols-[minmax(0,1fr)_2.75rem_4.25rem_5.5rem] items-center gap-2 rounded-lg px-2 sm:grid-cols-[minmax(0,1fr)_2.75rem_3.75rem_4.75rem_4.25rem_5.5rem]',
                    isNew && named && !counted ? 'bg-accent-50/70' : null,
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-ink">
                      {!isNew ? (
                        row.domain
                      ) : shown === 'domain' ? (
                        /* Keyed on the beat: returning to it on the next loop
                           mounts a new one, which is what starts the typing
                           over without an effect reaching back to reset it. */
                        <Typed key="typing" text={row.domain} still={Boolean(still)} />
                      ) : named ? (
                        row.domain
                      ) : (
                        <Slot className="w-28" />
                      )}
                    </p>
                    <p className="truncate text-[11px] text-muted">
                      {isNew ? (named ? row.source : <Slot className="w-14" />) : row.source}
                    </p>
                  </div>

                  <Cell className="text-right" filled={!isNew || measured} width="w-6">
                    {listing?.domainRating}
                  </Cell>
                  <Cell
                    className="hidden text-right sm:block"
                    filled={!isNew || measured}
                    width="w-9"
                  >
                    {listing ? formatCompactNumber(listing.traffic) : null}
                  </Cell>
                  <Cell className="hidden sm:block" filled={!isNew || priced} width="w-12">
                    {isNew ? DEMO_PLAN_MONTH : row.month}
                  </Cell>
                  <Cell className="text-right" filled={!isNew || priced} width="w-10">
                    {formatPrice(row.priceMinor)}
                  </Cell>

                  <div className="pl-1">
                    {status ? (
                      <motion.span
                        key={status.name}
                        initial={still ? false : { opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                        className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-white px-2 py-0.5 text-[11px] font-medium text-ink"
                      >
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: status.colour }}
                        />
                        <span className="truncate">{status.name}</span>
                        {row.paid ? (
                          <Check className="h-3 w-3 shrink-0 text-accent-600" aria-hidden="true" />
                        ) : null}
                      </motion.span>
                    ) : (
                      <Slot className="w-16" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/*
            The sums, where a spreadsheet keeps them, and the two figures the
            last beat is about. Never added together: see `summary.ts`.
          */}
          <div className="absolute inset-x-0 bottom-[3rem] flex h-[3.25rem] items-center justify-end gap-5 border-t border-line bg-white px-3.5 sm:px-4">
            <Figure label="Paid" value={formatPrice(paidMinor)} />
            <Figure label="Committed" value={formatPrice(committedMinor)} moved={counted} accent />
          </div>

          {/*
            The sentence the panel must carry on its own face, because a
            screenshot travels without the prose beside it. Both halves are
            true of the real planner: a status is something a person sets, and
            money is only paid when somebody has paid it.
          */}
          <div className="absolute inset-x-0 bottom-0 flex h-[3rem] items-center gap-2 border-t border-line bg-surface px-3.5 text-[11px] text-muted sm:px-4">
            {measured ? (
              <motion.span
                initial={still ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.35 }}
                className="leading-snug"
              >
                Metrics from Press Parrot, measured {DEMO_PLAN_MEASURED}. Nothing else is checked
                for you.
              </motion.span>
            ) : (
              <span className="leading-snug">You set every field. Nothing here is checked for you.</span>
            )}
          </div>

          {/* Said on the panel, not only in the prose beside it. */}
          <p className="pointer-events-none absolute top-2.5 right-3 rounded-full bg-navy-900/85 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white/90 uppercase">
            Example data
          </p>
        </div>
      </div>
    </div>
  );
}

/** One of the two figures in the panel header. */
function Figure({
  label,
  value,
  moved,
  accent,
}: {
  label: string;
  value: string;
  moved?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="text-right">
      <p className="text-[10px] tracking-[0.08em] text-muted uppercase">{label}</p>
      <motion.p
        key={value}
        initial={false}
        animate={{ scale: moved && accent ? [1, 1.06, 1] : 1 }}
        transition={{ duration: 0.45 }}
        className={cn(
          'tabular text-[14px] font-semibold',
          accent && moved ? 'text-accent-700' : 'text-ink',
        )}
      >
        {value}
      </motion.p>
    </div>
  );
}

/**
 * A cell that is either its value or an empty slot.
 *
 * The slot is the same width as the value it will hold, so filling one in
 * moves nothing: the whole reason this panel's height is arithmetic.
 */
function Cell({
  children,
  filled,
  width,
  className,
}: {
  children: React.ReactNode;
  filled: boolean;
  width: string;
  className?: string;
}) {
  return (
    <div className={cn('tabular text-[12px] text-ink-soft', className)}>
      {filled ? (
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          {children}
        </motion.span>
      ) : (
        <Slot className={width} />
      )}
    </div>
  );
}

/** The grey bar standing in for a field nobody has filled in yet. */
function Slot({ className }: { className?: string }) {
  return (
    <span
      className={cn('inline-block h-[0.55rem] max-w-full rounded-full bg-line', className)}
      aria-hidden="true"
    />
  );
}
