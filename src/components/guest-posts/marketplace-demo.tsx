'use client';

import { useEffect, useReducer, useRef } from 'react';
import { AnimatePresence, motion, useInView, useReducedMotion } from 'motion/react';
import { Bookmark, Check, ChevronDown, Search, SlidersHorizontal } from 'lucide-react';
import { Flag } from '@/components/shared/flag';
import { Sparkline } from '@/components/ui/sparkline';
import { formatCompactNumber, formatPrice } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import {
  DEMO_LISTINGS,
  DEMO_NICHES,
  DEMO_SEARCH_TERM,
  demoFeatured,
  type DemoListing,
} from '@/lib/marketing/demo-data';

/**
 * The marketplace, demonstrating itself.
 *
 * Five beats on a loop: type a search, filter by niche, open a listing, read
 * its metrics, add it to an order. It is the marketplace's own row, chevron,
 * category pill, flag and save control, at the marketplace's own sizes -
 * rebuilt here rather than imported because the real components take a
 * `WebsiteListItem`, talk to the order draft provider and link into routes
 * that need an account. Importing them would mean a signed-out visitor
 * clicking a row and landing on a login screen from an animation.
 *
 * ## Three rules it has to keep
 *
 * **It stops when nobody is looking.** `useInView` gates the timer, so a
 * visitor who has scrolled past is not paying for a loop they cannot see.
 *
 * **It respects reduced motion.** Asked for stillness, it renders the final
 * beat - the listing open, its metrics out, the placement chosen - and never
 * moves. That is the state the animation exists to arrive at, so the page
 * still says the same thing.
 *
 * **It cannot shift the layout.** The panel is a fixed height at every
 * breakpoint and every row that appears or disappears does so inside it.
 * An animation that resized its own container on each beat would move the
 * copy beside it and the whole page below it, twelve times a minute.
 */

/** The beats, in order. The loop returns to `search` after the last. */
const STEPS = ['search', 'filter', 'expand', 'metrics', 'select'] as const;
type Step = (typeof STEPS)[number];

/** How long each beat holds, in milliseconds. */
const HOLD: Record<Step, number> = {
  // Long enough to read the term being typed into the box.
  search: 2600,
  filter: 2200,
  expand: 2000,
  // The one worth lingering on: it is the argument the page is making.
  metrics: 3400,
  select: 2600,
};

const stepIndex = (step: Step) => STEPS.indexOf(step);

export function MarketplaceDemo() {
  const panel = useRef<HTMLDivElement>(null);
  // `amount` rather than the default: a sliver of the panel at the bottom of
  // the screen is not somebody watching it.
  const onScreen = useInView(panel, { amount: 0.4 });
  const still = useReducedMotion();

  const [step, advance] = useReducer(
    (current: Step) => STEPS[(stepIndex(current) + 1) % STEPS.length]!,
    'search',
  );

  useEffect(() => {
    // Stillness means the end state, held. No timer at all.
    if (still || !onScreen) return;
    const timer = setTimeout(advance, HOLD[step]);
    return () => clearTimeout(timer);
  }, [step, onScreen, still]);

  const shown: Step = still ? 'select' : step;
  const at = stepIndex(shown);

  const featured = demoFeatured();
  const filtering = at >= stepIndex('filter');
  const rows = filtering
    ? DEMO_LISTINGS.filter((listing) => listing.niche === featured.niche)
    : DEMO_LISTINGS;

  const typed = at >= stepIndex('filter') ? DEMO_SEARCH_TERM : undefined;
  const open = at >= stepIndex('expand');
  const chosen = at >= stepIndex('select');

  return (
    <div
      ref={panel}
      /*
        A fixed height, not a min-height. The rows inside change on every
        beat and the panel must not: this sits beside the headline, and a
        container that grew by a row would nudge the h1 on a loop.

        24rem because the tallest beat - five rows, or two rows with one of
        them open - measures 327px of content plus the 48px footer at every
        breakpoint. The first version was 27rem rising to 30rem and left a
        third of the panel empty on the beats that matter most.
      */
      className="relative h-[24rem] w-full overflow-hidden rounded-[var(--radius-card)] border border-line bg-white shadow-[var(--shadow-pop)]"
      aria-hidden="true"
    >
      <DemoChrome typed={typed} filtering={filtering} />

      <div className="px-3 pb-3 sm:px-4">
        <DemoNiches active={filtering ? featured.niche : 'all'} still={Boolean(still)} />

        <div className="mt-2.5 space-y-1">
          <AnimatePresence initial={false} mode="popLayout">
            {rows.map((listing) => (
              <motion.div
                key={listing.id}
                layout={still ? false : 'position'}
                initial={still ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              >
                <DemoRow
                  listing={listing}
                  open={open && listing.id === featured.id}
                  chosen={chosen && listing.id === featured.id}
                  showMetrics={at >= stepIndex('metrics') && listing.id === featured.id}
                  still={Boolean(still)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      <DemoFooter chosen={chosen} price={featured.priceMinor} still={Boolean(still)} />

      {/*
        Said on the panel, not only in the prose beside it. Somebody
        screenshotting this has to carry the caveat with the picture.
      */}
      <p className="pointer-events-none absolute top-2.5 right-3 rounded-full bg-navy-900/85 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white/90 uppercase">
        Example data
      </p>
    </div>
  );
}

/** The search bar and filter button along the top. */
function DemoChrome({ typed, filtering }: { typed?: string; filtering: boolean }) {
  return (
    /*
      Right padding the width of the "Example data" badge, which is
      positioned over this bar. Reserving the space is what stops it landing
      on top of the Filters chip - the first version had it doing exactly
      that, which is a label made illegible by the thing it labels.
    */
    <div className="flex items-center gap-2 border-b border-line py-3 pr-[6.75rem] pl-3 sm:pl-4">
      <div className="relative flex h-9 min-w-0 flex-1 items-center rounded-md border border-line-strong bg-white pl-8">
        <Search
          className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-muted"
          aria-hidden="true"
        />
        <span className="truncate text-[13px] text-ink">
          {typed ? (
            typed
          ) : (
            <TypedTerm />
          )}
        </span>
      </div>
      <span
        className={cn(
          // Hidden on a phone: the panel is 358px there and the niche chips
          // below already say which filter is on.
          'hidden h-9 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-medium transition-colors duration-300 sm:flex',
          filtering
            ? 'border-accent-200 bg-accent-50 text-accent-700'
            : 'border-line-strong bg-white text-ink-soft',
        )}
      >
        <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
        Filters
        {filtering ? (
          <span className="ml-0.5 rounded-full bg-accent-700 px-1.5 text-[10px] text-white">1</span>
        ) : null}
      </span>
    </div>
  );
}

/**
 * The search term appearing a character at a time.
 *
 * A CSS step animation on `width` over a monospaced-by-character span would
 * be cheaper, but it cannot be read at small sizes: the clip lands mid-glyph.
 * This is one state update every 110ms for seven characters, then nothing.
 */
function TypedTerm() {
  const [count, tick] = useReducer((n: number) => Math.min(n + 1, DEMO_SEARCH_TERM.length), 0);

  useEffect(() => {
    if (count >= DEMO_SEARCH_TERM.length) return;
    const timer = setTimeout(tick, 110);
    return () => clearTimeout(timer);
  }, [count]);

  return (
    <>
      {DEMO_SEARCH_TERM.slice(0, count)}
      <motion.span
        className="ml-px inline-block h-3.5 w-px translate-y-0.5 bg-accent-700"
        animate={{ opacity: [1, 0, 1] }}
        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
      />
    </>
  );
}

/** The niche chips, with the active one filled. */
function DemoNiches({ active, still }: { active: string; still: boolean }) {
  return (
    <div className="flex gap-1.5 overflow-hidden pt-3">
      {DEMO_NICHES.map((niche) => {
        const on = niche.slug === active;
        return (
          <motion.span
            key={niche.slug}
            animate={still ? undefined : { scale: on ? 1 : 0.98 }}
            transition={{ duration: 0.25 }}
            className={cn(
              'shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors duration-300',
              on
                ? 'border-accent-700 bg-accent-700 text-white'
                : 'border-line bg-white text-muted',
            )}
          >
            {niche.label}
          </motion.span>
        );
      })}
    </div>
  );
}

/** One listing: the marketplace's row, and the panel that opens under it. */
function DemoRow({
  listing,
  open,
  chosen,
  showMetrics,
  still,
}: {
  listing: DemoListing;
  open: boolean;
  chosen: boolean;
  showMetrics: boolean;
  still: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border transition-colors duration-300',
        chosen ? 'border-accent-200 bg-accent-50/60' : 'border-line bg-white',
      )}
    >
      <div className="flex items-center gap-2 px-2.5 py-2">
        <span
          className={cn(
            'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors duration-300',
            chosen ? 'border-accent-700 bg-accent-700 text-white' : 'border-line-strong bg-white',
          )}
        >
          {chosen ? <Check className="h-2.5 w-2.5" aria-hidden="true" /> : null}
        </span>

        <span className="flex min-w-0 flex-1 items-center gap-1">
          <ChevronDown
            className={cn(
              'h-3 w-3 shrink-0 text-muted transition-transform duration-300',
              open && 'rotate-180',
            )}
            aria-hidden="true"
          />
          <span className="truncate text-[13px] font-semibold text-ink">{listing.domain}</span>
        </span>

        <span className="hidden shrink-0 rounded-md bg-surface-sunken px-1.5 py-0.5 text-[10px] font-medium text-ink-soft sm:inline">
          {listing.nicheLabel}
        </span>
        <Flag country={listing.country} className="hidden h-3 w-4 shrink-0 rounded-[2px] sm:block" />
        <span className="tabular w-7 shrink-0 text-right text-[12px] font-semibold text-ink">
          {listing.domainRating}
        </span>
        <span className="tabular hidden w-12 shrink-0 text-right text-[12px] text-ink-soft sm:block">
          {formatCompactNumber(listing.traffic)}
        </span>
        <span className="tabular w-14 shrink-0 text-right text-[12px] font-semibold text-ink">
          {formatPrice(listing.priceMinor)}
        </span>
        <Bookmark
          className={cn(
            'h-3.5 w-3.5 shrink-0 transition-colors duration-300',
            chosen ? 'fill-accent-700 text-accent-700' : 'text-muted-soft',
          )}
          aria-hidden="true"
        />
      </div>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={still ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <DemoDetail listing={listing} showMetrics={showMetrics} still={still} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** What the marketplace shows under an opened row, at this scale. */
function DemoDetail({
  listing,
  showMetrics,
  still,
}: {
  listing: DemoListing;
  showMetrics: boolean;
  still: boolean;
}) {
  const figures = [
    { label: 'Referring domains', value: formatCompactNumber(listing.referringDomains) },
    { label: 'Keywords', value: formatCompactNumber(listing.keywords) },
    {
      label: 'Turnaround',
      value: `${listing.turnaroundDays[0]}-${listing.turnaroundDays[1]} days`,
    },
    { label: 'Link', value: listing.linkType === 'dofollow' ? 'Dofollow' : 'Nofollow' },
  ];

  return (
    <div className="border-t border-line bg-surface/70 px-2.5 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold tracking-wide text-muted uppercase">
            Organic traffic
          </p>
          <Sparkline values={listing.trend} width={132} height={30} filled className="mt-1" />
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-x-3 gap-y-1.5">
          {figures.map((figure, index) => (
            <motion.div
              key={figure.label}
              initial={still ? false : { opacity: 0, y: 4 }}
              animate={showMetrics ? { opacity: 1, y: 0 } : { opacity: 0.35, y: 0 }}
              transition={{ duration: 0.3, delay: still ? 0 : index * 0.07 }}
            >
              <p className="text-[9px] tracking-wide text-muted uppercase">{figure.label}</p>
              <p className="tabular text-[11px] font-semibold text-ink">{figure.value}</p>
            </motion.div>
          ))}
        </div>
      </div>

      <div className="mt-2 flex items-center gap-1.5 overflow-hidden">
        <span className="text-[10px] text-muted">Readers:</span>
        {listing.audience.map((entry, index) => (
          <motion.span
            key={entry.country}
            className="flex shrink-0 items-center gap-1 text-[10px] text-ink-soft"
            initial={still ? false : { opacity: 0 }}
            animate={showMetrics ? { opacity: 1 } : { opacity: 0.35 }}
            transition={{ duration: 0.3, delay: still ? 0 : 0.28 + index * 0.06 }}
          >
            <Flag country={entry.country} className="h-2.5 w-3.5 rounded-[1px]" />
            {entry.share}%
          </motion.span>
        ))}
      </div>
    </div>
  );
}

/** The bar that slides in once a placement is chosen. */
function DemoFooter({
  chosen,
  price,
  still,
}: {
  chosen: boolean;
  price: number;
  still: boolean;
}) {
  return (
    <div className="absolute inset-x-0 bottom-0 h-12 border-t border-line bg-white px-3 sm:px-4">
      <AnimatePresence initial={false} mode="wait">
        {chosen ? (
          <motion.div
            key="chosen"
            initial={still ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="flex h-12 items-center justify-between gap-3"
          >
            <span className="text-[12px] text-ink-soft">
              <span className="font-semibold text-ink">1 placement</span> selected
            </span>
            <span className="flex items-center gap-2">
              <span className="tabular text-[13px] font-semibold text-ink">
                {formatPrice(price)}
              </span>
              <span className="rounded-md bg-accent-700 px-2.5 py-1.5 text-[11px] font-semibold text-white">
                Add to order
              </span>
            </span>
          </motion.div>
        ) : (
          <motion.p
            key="idle"
            initial={still ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="flex h-12 items-center text-[12px] text-muted"
          >
            Filter, compare and pick the publisher yourself.
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
