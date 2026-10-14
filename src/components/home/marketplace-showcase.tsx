'use client';

import { useEffect, useReducer, useRef } from 'react';
import { AnimatePresence, motion, useInView, useReducedMotion } from 'motion/react';
import { Bookmark, Check, ChevronDown, Search, SlidersHorizontal } from 'lucide-react';
import { Flag } from '@/components/shared/flag';
import { Sparkline } from '@/components/ui/sparkline';
import { formatCompactNumber, formatPrice } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import {
  DEMO_FILTERS,
  DEMO_LISTINGS,
  DEMO_NICHES,
  demoFeatured,
  type DemoListing,
} from '@/lib/marketing/demo-data';

/**
 * The marketplace, narrowing itself down to one publisher.
 *
 * Six beats on a loop, and each one changes something: a niche is chosen, the
 * metric filters arrive and the list narrows, the columns you compare on are
 * revealed, a listing opens, its traffic and audience and keywords draw
 * themselves, and it is saved. That is the whole job the marketplace does,
 * shown rather than described - which is the point of the section's heading.
 *
 * ## Why this is not the /guest-posts panel
 *
 * That one is five beats of searching and ordering, tuned to a 24rem frame
 * sitting beside a hero headline. This is a different argument in a different
 * shape: no search box being typed into, a filter rail that bites, a match
 * count, and a bookmark rather than a basket - because the homepage is selling
 * "you can find the right site", not "you can buy a placement". The row markup
 * rhymes with it on purpose; both rhyme with the real marketplace row, which
 * neither of them can import. The real one takes a `WebsiteListItem`, talks to
 * the order draft provider and links into routes that need an account, so a
 * signed-out visitor clicking an animation would land on a login screen.
 *
 * ## The three rules it keeps
 *
 * **It stops when nobody is looking.** `useInView` gates the timer, so a
 * visitor who has scrolled past is not paying for a loop they cannot see.
 *
 * **It respects reduced motion.** Asked for stillness it renders the last
 * beat - listing open, metrics out, saved - and never moves. That is the state
 * the sequence exists to arrive at, so the section still says the same thing.
 *
 * **It cannot shift the layout.** The panel is one fixed height at every
 * breakpoint and every row that arrives or leaves does so inside it.
 *
 * Both numbers are measured rather than guessed, and both first guesses were
 * wrong. Sampled every 190ms through the whole loop at 1440, 820 and 390px,
 * with the list's top a constant 176px below the panel's at all three, the
 * rows fill between 204px and 235px - the opening five, and the five with the
 * rule and an open listing among them. So the list is 15rem, which is 240px:
 * every beat fills at least 85% of it and none of them overflows.
 *
 * It was 17rem, and before that the rows were removed as soon as a filter
 * excluded them, which left 79px of content in a frame built for 215 - a third
 * of the panel empty for five seconds in every seventeen.
 *
 * One state does overflow, and it is not a beat: the quarter second where the
 * loop returns to the start, with three rows coming back while the open one is
 * still collapsing, reaches 317px. It is clipped inside the list, where there
 * is nothing to see it happen. That is what the fixed height on the list is
 * for; before it, the same overlap pushed the fifth row under the footer four
 * times a minute.
 *
 * The panel is then the list's own bottom edge plus the footer over it:
 * 176 + 240 + 12 of padding + 44, so 472px, which is 29.5rem. A round 29 put
 * the padding under the footer - nothing is drawn in padding, so it showed as
 * nothing, which is exactly why this comes off a measurement.
 */

/**
 * The beats, in order. The loop returns to `browse` after the last.
 *
 * `browse` carries no caption of its own. It is the state before anything has
 * been chosen, and it has to be a beat rather than an assumption: on a loop
 * there is no "before" unless something shows it, and the first version filled
 * the Finance chip on the opening frame, so the one thing beat two was for -
 * watching a niche get picked - never happened.
 */
const STEPS = ['browse', 'niche', 'filters', 'compare', 'expand', 'metrics', 'save'] as const;
export type ShowcaseStep = (typeof STEPS)[number];

/** How long each beat holds, in milliseconds. */
const HOLD: Record<ShowcaseStep, number> = {
  browse: 1700,
  niche: 2200,
  filters: 2400,
  compare: 2400,
  expand: 2000,
  // The one worth lingering on: it is the argument the section is making.
  metrics: 3600,
  save: 2600,
};

/**
 * Which caption a beat belongs to.
 *
 * Six captions, seven beats, and the mapping is written out rather than
 * arithmetic on an index - `browse` and `niche` are both "choose a niche", and
 * an off-by-one here would highlight the wrong sentence rather than fail.
 */
const CAPTION: Record<ShowcaseStep, number> = {
  browse: 0,
  niche: 0,
  filters: 1,
  compare: 2,
  expand: 3,
  metrics: 4,
  save: 5,
};

const stepIndex = (step: ShowcaseStep) => STEPS.indexOf(step);

export interface ShowcaseStepCopy extends Record<string, unknown> {
  label: string;
  body: string;
}

export function MarketplaceShowcase({ steps }: { steps: ShowcaseStepCopy[] }) {
  const panel = useRef<HTMLDivElement>(null);
  // `amount` rather than the default: a sliver of the panel at the bottom of
  // the screen is not somebody watching it.
  const onScreen = useInView(panel, { amount: 0.35 });
  const still = useReducedMotion();

  const [step, advance] = useReducer(
    (current: ShowcaseStep) => STEPS[(stepIndex(current) + 1) % STEPS.length]!,
    'browse',
  );

  useEffect(() => {
    // Stillness means the end state, held. No timer at all.
    if (still || !onScreen) return;
    const timer = setTimeout(advance, HOLD[step]);
    return () => clearTimeout(timer);
  }, [step, onScreen, still]);

  const shown: ShowcaseStep = still ? 'save' : step;
  const at = stepIndex(shown);

  const featured = demoFeatured();
  const chosen = at >= stepIndex('niche');
  const filtering = at >= stepIndex('filters');
  const caption = CAPTION[shown];

  const matches = (listing: DemoListing) =>
    (!chosen || listing.niche === featured.niche) &&
    (!filtering || DEMO_FILTERS.every((filter) => filter.test(listing)));

  /*
    What a filter removes stays on screen until the listing opens.

    Removing it immediately was the first build and it emptied the panel: the
    niche leaves two publishers out of five, so two of the seven beats were a
    pair of rows in a frame sized for the beat with a listing open in it - a
    third of the panel white, for five seconds of every seventeen.

    Sinking them under a rule instead keeps the frame full and says something
    truer about what a filter does. They leave when the detail opens and needs
    the room, which is also the moment they stop being the subject.
  */
  const narrowed = at >= stepIndex('expand');
  const rows = narrowed
    ? DEMO_LISTINGS.filter(matches)
    : [...DEMO_LISTINGS].sort((a, b) => Number(matches(b)) - Number(matches(a)));
  const matching = DEMO_LISTINGS.filter(matches).length;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-10">
      {/*
        The captions, and they are ordinary content: editable, server-rendered,
        readable with the animation stopped or never started. The highlight is
        the only thing the sequence does to them.
      */}
      {steps.length ? (
        <ol className="order-2 space-y-1 lg:order-1">
          {steps.map((copy, index) => {
            const current = index === caption;
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
            A fixed height, not a min-height. The rows inside change on every
            beat and the panel must not: the captions sit beside it, and a
            container that grew by a row would nudge them twelve times a
            minute - and on a phone it would move the whole page below it.
          */
          className="relative h-[29.5rem] w-full overflow-hidden rounded-[var(--radius-card)] border border-line bg-white shadow-[var(--shadow-pop)]"
          aria-hidden="true"
        >
          <ShowcaseChrome filtering={filtering} />

          <div className="px-3 pb-3 sm:px-4">
            <ShowcaseNiches active={chosen ? featured.niche : 'all'} still={Boolean(still)} />
            <ShowcaseFilters on={filtering} still={Boolean(still)} />

            <ShowcaseCount
              count={matching}
              filtered={chosen}
              comparing={at >= stepIndex('compare')}
              still={Boolean(still)}
            />

            {/* 15rem and clipped: see the measurements above. The overlap in
                the wrap lands inside this box rather than under the footer. */}
            <div className="mt-1.5 h-[15rem] space-y-1 overflow-hidden">
              <AnimatePresence initial={false} mode="popLayout">
                {rows.flatMap((listing, index) => {
                  const dropped = !matches(listing);
                  // The rule goes above the first one a filter removed, and
                  // only while there is something under it.
                  const rule =
                    dropped && index > 0 && matches(rows[index - 1]!) ? (
                      <motion.p
                        key="dropped"
                        layout={still ? false : 'position'}
                        initial={still ? false : { opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="px-0.5 pt-2 pb-1 text-[10px] tracking-wide text-muted uppercase"
                      >
                        Filtered out
                      </motion.p>
                    ) : null;

                  return [
                    rule,
                    <motion.div
                      key={listing.id}
                      layout={still ? false : 'position'}
                      initial={still ? false : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <ShowcaseRow
                        listing={listing}
                        dropped={dropped}
                        comparing={at >= stepIndex('compare')}
                        open={at >= stepIndex('expand') && listing.id === featured.id}
                        showMetrics={at >= stepIndex('metrics') && listing.id === featured.id}
                        saved={at >= stepIndex('save') && listing.id === featured.id}
                        still={Boolean(still)}
                      />
                    </motion.div>,
                  ].filter(Boolean);
                })}
              </AnimatePresence>
            </div>
          </div>

          <ShowcaseFooter saved={at >= stepIndex('save')} still={Boolean(still)} />

          {/*
            Said on the panel, not only in the prose beside it. Somebody
            screenshotting this has to carry the caveat with the picture.
          */}
          <p className="pointer-events-none absolute top-2.5 right-3 rounded-full bg-navy-900/85 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white/90 uppercase">
            Example data
          </p>
        </div>
      </div>
    </div>
  );
}

/** The search bar and the filter button along the top. */
function ShowcaseChrome({ filtering }: { filtering: boolean }) {
  return (
    /*
      Right padding the width of the "Example data" badge, which is positioned
      over this bar. Reserving the space is what stops it landing on top of the
      Filters chip.
    */
    <div className="flex items-center gap-2 border-b border-line py-3 pr-[6.75rem] pl-3 sm:pl-4">
      <div className="relative flex h-9 min-w-0 flex-1 items-center rounded-md border border-line-strong bg-white pl-8">
        <Search
          className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-muted"
          aria-hidden="true"
        />
        <span className="truncate text-[13px] text-muted">Search 12,000+ publishers</span>
      </div>
      <span
        className={cn(
          // Hidden on a phone, where the chips below already say which filter
          // is on and the bar has no room for both.
          'hidden h-9 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-medium transition-colors duration-300 sm:flex',
          filtering
            ? 'border-accent-200 bg-accent-50 text-accent-700'
            : 'border-line-strong bg-white text-ink-soft',
        )}
      >
        <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
        Filters
        {filtering ? (
          <span className="ml-0.5 rounded-full bg-accent-700 px-1.5 text-[10px] text-white">
            {DEMO_FILTERS.length}
          </span>
        ) : null}
      </span>
    </div>
  );
}

/** The niche chips, with the chosen one filled. */
function ShowcaseNiches({ active, still }: { active: string; still: boolean }) {
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
              on ? 'border-accent-700 bg-accent-700 text-white' : 'border-line bg-white text-muted',
            )}
          >
            {niche.label}
          </motion.span>
        );
      })}
    </div>
  );
}

/**
 * The metric filters, arriving one after another.
 *
 * A fixed-height strip whether or not anything is in it, so the rows below do
 * not move when the pills appear - the one thing this panel is not allowed to
 * do.
 */
function ShowcaseFilters({ on, still }: { on: boolean; still: boolean }) {
  return (
    <div className="mt-2 flex h-7 items-center gap-1.5 overflow-hidden">
      {DEMO_FILTERS.map((filter, index) => (
        <motion.span
          key={filter.label}
          initial={still ? false : { opacity: 0, y: 6 }}
          animate={on ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
          transition={{ duration: 0.3, delay: still || !on ? 0 : index * 0.12 }}
          className="flex shrink-0 items-center gap-1 rounded-md border border-accent-200 bg-accent-50 px-2 py-1 text-[11px] font-medium text-accent-700"
        >
          <Check className="h-3 w-3" aria-hidden="true" />
          {filter.label}
        </motion.span>
      ))}
    </div>
  );
}

/** How many publishers are left, and the column headings they are compared on. */
function ShowcaseCount({
  count,
  filtered,
  comparing,
  still,
}: {
  count: number;
  filtered: boolean;
  comparing: boolean;
  still: boolean;
}) {
  return (
    <div className="mt-2.5 flex items-baseline justify-between gap-3 border-b border-line pb-1.5">
      <p className="text-[11px] text-muted">
        <span className="tabular font-semibold text-ink">{count}</span>{' '}
        {count === 1 ? 'publisher' : 'publishers'}
        {filtered ? ' match' : ''}
      </p>
      <motion.span
        className="flex shrink-0 items-center gap-3 text-[10px] tracking-wide text-muted uppercase"
        initial={still ? false : { opacity: 0 }}
        animate={comparing ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.35 }}
      >
        <span className="w-7 text-right">DR</span>
        <span className="hidden w-12 text-right sm:inline">Traffic</span>
        <span className="w-14 text-right">Price</span>
        <span className="w-3.5" aria-hidden="true" />
      </motion.span>
    </div>
  );
}

/** One listing: the row, and the panel that opens under it. */
function ShowcaseRow({
  listing,
  dropped,
  comparing,
  open,
  showMetrics,
  saved,
  still,
}: {
  listing: DemoListing;
  /** Still on screen, but a filter has ruled it out. */
  dropped: boolean;
  comparing: boolean;
  open: boolean;
  showMetrics: boolean;
  saved: boolean;
  still: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border transition-all duration-300',
        saved ? 'border-accent-200 bg-accent-50/60' : 'border-line bg-white',
        dropped && 'opacity-45 grayscale',
      )}
    >
      <div className="flex items-center gap-2 px-2.5 py-2">
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

        {/*
          The three figures a publisher is compared on, revealed together on
          the beat that is about comparing them. Dimmed rather than absent
          before it, so the row does not change width when they arrive.
        */}
        <motion.span
          className="flex shrink-0 items-center gap-3"
          initial={still ? false : { opacity: 0.25 }}
          animate={comparing ? { opacity: 1 } : { opacity: 0.25 }}
          transition={{ duration: 0.35 }}
        >
          <span className="tabular w-7 text-right text-[12px] font-semibold text-ink">
            {listing.domainRating}
          </span>
          <span className="tabular hidden w-12 text-right text-[12px] text-ink-soft sm:inline">
            {formatCompactNumber(listing.traffic)}
          </span>
          <span className="tabular w-14 text-right text-[12px] font-semibold text-ink">
            {formatPrice(listing.priceMinor)}
          </span>
        </motion.span>

        <Bookmark
          className={cn(
            'h-3.5 w-3.5 shrink-0 transition-colors duration-300',
            saved ? 'fill-accent-700 text-accent-700' : 'text-muted-soft',
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
            <ShowcaseDetail listing={listing} showMetrics={showMetrics} still={still} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** Organic traffic, where the readers are, and what the site ranks for. */
function ShowcaseDetail({
  listing,
  showMetrics,
  still,
}: {
  listing: DemoListing;
  showMetrics: boolean;
  still: boolean;
}) {
  return (
    <div className="border-t border-line bg-surface/70 px-2.5 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold tracking-wide text-muted uppercase">
            Organic traffic, 12 months
          </p>
          <Sparkline values={listing.trend} width={140} height={32} filled className="mt-1" />
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-x-3 gap-y-1.5">
          {[
            { label: 'Tracked keywords', value: formatCompactNumber(listing.keywords) },
            { label: 'Referring domains', value: formatCompactNumber(listing.referringDomains) },
            {
              label: 'Turnaround',
              value: `${listing.turnaroundDays[0]}-${listing.turnaroundDays[1]} days`,
            },
            { label: 'Link', value: listing.linkType === 'dofollow' ? 'Dofollow' : 'Nofollow' },
          ].map((figure, index) => (
            <motion.div
              key={figure.label}
              initial={still ? false : { opacity: 0, y: 4 }}
              animate={showMetrics ? { opacity: 1, y: 0 } : { opacity: 0.3, y: 0 }}
              transition={{ duration: 0.3, delay: still ? 0 : index * 0.07 }}
            >
              <p className="text-[9px] tracking-wide text-muted uppercase">{figure.label}</p>
              <p className="tabular text-[11px] font-semibold text-ink">{figure.value}</p>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Where the readers are, as bars rather than as four more numbers. */}
      <div className="mt-2.5">
        <p className="text-[9px] tracking-wide text-muted uppercase">Readers by country</p>
        <div className="mt-1 grid grid-cols-4 gap-x-2.5">
          {listing.audience.map((entry, index) => (
            <div key={entry.country} className="min-w-0">
              <div className="flex items-center gap-1">
                <Flag country={entry.country} className="h-2.5 w-3.5 shrink-0 rounded-[1px]" />
                <span className="tabular text-[10px] text-ink-soft">{entry.share}%</span>
              </div>
              <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-surface-sunken">
                <motion.div
                  className="h-full rounded-full bg-accent-500"
                  initial={still ? false : { width: 0 }}
                  animate={showMetrics ? { width: `${entry.share}%` } : { width: 0 }}
                  transition={{
                    duration: 0.7,
                    delay: still ? 0 : 0.2 + index * 0.08,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The bar along the bottom: what the panel is for, then what was saved. */
function ShowcaseFooter({ saved, still }: { saved: boolean; still: boolean }) {
  return (
    <div className="absolute inset-x-0 bottom-0 h-11 border-t border-line bg-white px-3 sm:px-4">
      <AnimatePresence initial={false} mode="wait">
        {saved ? (
          <motion.div
            key="saved"
            initial={still ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="flex h-11 items-center justify-between gap-3"
          >
            <span className="flex items-center gap-1.5 text-[12px] text-ink-soft">
              <Bookmark className="h-3.5 w-3.5 fill-accent-700 text-accent-700" aria-hidden="true" />
              Saved to your shortlist
            </span>
            <span className="rounded-md bg-accent-700 px-2.5 py-1.5 text-[11px] font-semibold text-white">
              Add to order
            </span>
          </motion.div>
        ) : (
          <motion.p
            key="idle"
            initial={still ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="flex h-11 items-center text-[12px] text-muted"
          >
            Filter on the metrics, compare the publishers, shortlist the ones worth buying.
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
