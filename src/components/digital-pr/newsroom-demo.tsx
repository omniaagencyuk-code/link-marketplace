import Image from 'next/image';
import { cn } from '@/lib/utils/cn';

/**
 * A newsroom, drawn.
 *
 * The hero's picture of what this page is selling: a front page, and the
 * coverage around it. The other two redrawn service pages each got a drawing
 * of the thing they sell - a marketplace table, an article with a link going
 * into it - and this is the third.
 *
 * ## The publications are invented, and have to be
 *
 * "The Daily Squawk" is the house paper and the three cards around it are
 * obviously made up: a technology title, a finance title, a lifestyle title,
 * carrying headlines about nothing in particular. That is the point. The
 * honest alternative - real mastheads with real headlines - would be
 * claiming coverage we have not been given permission to claim, and this
 * page's own copy says plainly that coverage is never guaranteed. A hero
 * showing logos a reader recognises is the page contradicting its own
 * "Setting realistic expectations" section four screens further down.
 *
 * So the whole illustration is `aria-hidden` with a caption saying what it
 * is, the way `ArticleDemo` and `MarketplaceMock` are.
 *
 * ## The animation
 *
 * The front page arrives, then the three cards in sequence from three
 * directions, then they drift. All of it is CSS with `both` fill, so the
 * finished arrangement is painted at the first frame and stays there if
 * nothing runs - and `prefers-reduced-motion` turns the lot off rather than
 * leaving a card mid-flight. See `globals.css`.
 */

/**
 * Three publications, each a different kind of coverage the page's own copy
 * describes: a story from research, expert commentary, a brand noticed by a
 * section editor. The names are plainly fictional on purpose.
 */
const CARDS: { outlet: string; headline: string; kind: string; corner: string; stage: string }[] = [
  {
    outlet: 'Tech Insight',
    headline: 'Expert shares key trends for the year ahead',
    kind: 'Commentary',
    corner: '-top-12 left-0 lg:-left-4',
    stage: 'one',
  },
  {
    outlet: 'The Finance Post',
    headline: 'Industry expert weighs in on market changes',
    kind: 'Quoted source',
    corner: 'top-36 right-0',
    stage: 'two',
  },
  {
    outlet: 'Lifestyle Daily',
    headline: 'Sustainable brands gain momentum',
    kind: 'Feature',
    corner: 'bottom-4 right-0 lg:-right-2',
    stage: 'three',
  },
];

export function NewsroomDemo({ className }: { className?: string }) {
  return (
    <figure className={cn('m-0', className)}>
      {/*
        Padded rather than tight: the three cards sit above and below the
        front page, and a container with no room for them clips the first
        one against the top of the hero.

        The masthead is the drawing's identity and the caption is the
        sentence that keeps it honest, so nothing is allowed to land on
        either. Measured in a browser rather than guessed: the first card
        clears the top of the paper, the second starts below the masthead
        rule, and the third sits in the padding under the paper rather than
        over the caption.
      */}
      <div aria-hidden="true" className="relative px-2 pt-14 pb-28 sm:px-6">
        {/* --------------------------------------------- the front page */}
        <div
          data-pp-dpr="paper"
          className="relative mx-auto max-w-[21rem] rounded-xl border border-line bg-white p-5 shadow-[var(--shadow-pop)]"
        >
          <p className="text-center text-[10px] font-semibold tracking-[0.3em] text-muted uppercase">
            Est. 2026 · Edition 1
          </p>

          <p className="mt-1 text-center font-masthead text-[1.75rem] leading-none font-black tracking-tight text-ink sm:text-[2rem]">
            The Daily Squawk
          </p>

          <div className="mt-3 border-y border-ink/15 py-1 text-center text-[9px] tracking-[0.18em] text-muted uppercase">
            Brands that earn coverage go further
          </div>

          <div className="mt-4 grid grid-cols-[1fr_auto] items-start gap-4">
            <div className="min-w-0">
              <p className="text-[13px] leading-snug font-semibold text-ink">
                New research highlights key industry trends
              </p>
              <div className="mt-2.5 space-y-1.5">
                {['w-full', 'w-11/12', 'w-full', 'w-10/12', 'w-full'].map((width, index) => (
                  <span
                    key={width + index}
                    className={`block h-1.5 rounded bg-surface-sunken ${width}`}
                  />
                ))}
              </div>
            </div>

            {/* A chart on the front page, which is the shape of the story
                this page keeps recommending: data somebody else wants. */}
            <svg viewBox="0 0 96 64" className="h-16 w-24 shrink-0" role="presentation">
              <rect x="0" y="0" width="96" height="64" rx="4" className="fill-accent-50" />
              {[
                [10, 40],
                [27, 30],
                [44, 34],
                [61, 20],
                [78, 10],
              ].map(([x, y], index) => (
                <rect
                  key={x}
                  x={x}
                  y={y}
                  width="9"
                  height={54 - y!}
                  rx="1.5"
                  className={index === 4 ? 'fill-accent-600' : 'fill-accent-300'}
                />
              ))}
            </svg>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4 border-t border-line pt-3">
            {[0, 1].map((column) => (
              <div key={column} className="space-y-1.5">
                {['w-full', 'w-10/12', 'w-full'].map((width, index) => (
                  <span
                    key={width + index}
                    className={`block h-1.5 rounded bg-surface-sunken ${width}`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* ------------------------------------------- the coverage around it */}
        {CARDS.map((card) => (
          <div key={card.outlet} className={`absolute ${card.corner} hidden sm:block`}>
            <div
              data-pp-dpr="card"
              data-pp-dpr-stage={card.stage}
              className="w-40 rounded-lg border border-line bg-white p-3 shadow-[var(--shadow-pop)] lg:w-44"
            >
              <p className="flex items-center gap-1.5 text-[10px] font-semibold text-ink">
                <span className="h-3 w-3 shrink-0 rounded-sm bg-accent-600" />
                {card.outlet}
              </p>
              <p className="mt-1.5 text-[11px] leading-snug text-muted">{card.headline}</p>
              <p className="mt-2 inline-flex rounded bg-accent-50 px-1.5 py-0.5 text-[9px] font-medium tracking-wide text-accent-800 uppercase">
                {card.kind}
              </p>
            </div>
          </div>
        ))}

        {/* Decorative: the words beside it say everything it says. Beside
            the paper rather than over it - a mascot on top of the headline
            reads as a mistake rather than as a mascot. */}
        <div
          data-pp-float=""
          style={{ '--pp-float': '8s' } as React.CSSProperties}
          className="pointer-events-none absolute bottom-2 left-0 hidden lg:block"
        >
          <Image
            src="/images/parrots/gambling-parrot.webp"
            alt=""
            width={160}
            height={160}
            aria-hidden="true"
            className="h-20 w-20 object-contain"
          />
        </div>
      </div>

      <figcaption className="text-[12px] text-muted">
        An illustration of editorial coverage. The publications and headlines are invented for the
        drawing — this page does not show real coverage, and no placement is guaranteed.
      </figcaption>
    </figure>
  );
}
