'use client';

import { useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'motion/react';
import { Bold, Check, Italic, List, Underline } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/**
 * An article being written, drawn rather than described.
 *
 * The hero's picture of what this page sells. The three other redrawn
 * service pages each got a drawing of the thing they sell - a marketplace
 * table, a link going into an article, a front page - and this is the
 * fourth: a brief arriving, a draft appearing under it, the keyword work
 * landing, and the piece going out for review.
 *
 * Motion drives it, the way `MetricsShowcase` and `MarketplaceShowcase`
 * drive theirs: `useInView` once, `useReducedMotion` to skip straight to the
 * end. No second animation library.
 *
 * ## What is animated, and what is deliberately not
 *
 * Everything that is *text* is plain markup at full opacity from the server.
 * Motion only ever adds things on top: the brief card, a white cover that
 * retracts off the paragraph, the keyword's highlight, the four checks and
 * the review notice. So the failure mode of no JavaScript is a finished
 * article sitting in a finished editor - not an empty box - and the same is
 * true if the bundle is slow, blocked or broken.
 *
 * That is the inversion worth keeping. Animating the article text itself
 * would have been easier to write and would have hidden the one thing on the
 * drawing a reader needs to see.
 *
 * ## It is an example, and says so
 *
 * The brief, the article and the checks are invented - a home workouts
 * piece, the same subject /niche-edits uses - and the whole illustration is
 * `aria-hidden` with a caption saying so. There is no score out of a
 * hundred: a checklist is a list of checks, but a number is a measurement,
 * and a measurement of an invented article measures nothing.
 */

/** What the brief card shows, in the order the order form asks for it. */
const BRIEF = [
  ['Topic', 'The complete guide to home workouts'],
  ['Target keyword', 'home workouts'],
  ['Word count', '1,500 words'],
] as const;

/** The checks a writer works through. Checks, not scores. */
const CHECKS = [
  'Keyword in title',
  'Keyword in H2',
  'Meta description',
  'Good readability',
  'Original content',
] as const;

/* One timeline, in milliseconds, so the four stages are readable in one place. */
const AT = {
  brief: 0.25,
  write: 0.55,
  highlight: 1.9,
  checks: 2.25,
  review: 3.25,
} as const;

export function EditorDemo({ className }: { className?: string }) {
  const frame = useRef<HTMLDivElement>(null);
  const seen = useInView(frame, { once: true, amount: 0.3 });
  const still = useReducedMotion();
  /* Reduced motion lands on the finished state immediately, as the other
     showcases do - not a shorter animation, no animation. */
  const live = Boolean(still) || seen;
  const run = (delay: number, duration = 0.5) =>
    still ? { duration: 0 } : { duration, delay, ease: [0.22, 0.61, 0.36, 1] as const };

  return (
    <figure className={cn('m-0', className)} ref={frame}>
      {/*
        Padded, and padded asymmetrically.

        The cards have to overlap the document - three of them and a readable
        document do not both fit across 32rem - so what matters is *what*
        they cover. Measured in a browser rather than guessed: the brief
        stands off to the left in the gap between the hero's two columns, and
        the checks and the review notice sit over the skeleton lines at the
        foot of the article. Nothing lands on the title, the paragraph or the
        keyword, which are the three things the drawing is of.
      */}
      <div aria-hidden="true" className="relative px-2 pt-4 pb-28 sm:pl-16 sm:pr-6 sm:pb-24">
        {/* ------------------------------------------------- the document */}
        <div className="relative mx-auto max-w-[23rem] overflow-hidden rounded-xl border border-line bg-white shadow-[var(--shadow-pop)]">
          {/* Chrome */}
          <div className="flex items-center gap-1.5 border-b border-line bg-surface px-4 py-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-coral-200" />
            <span className="h-2.5 w-2.5 rounded-full bg-sun-400/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-accent-300" />
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-2 border-b border-line px-4 py-2">
            <span className="flex items-center gap-1 rounded border border-line-strong px-1.5 py-0.5 text-[10px] text-ink-soft">
              Normal Text
              <svg viewBox="0 0 10 6" className="h-1.5 w-2.5 fill-none stroke-current">
                <path d="M1 1l4 4 4-4" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </span>
            <span className="ml-1 flex items-center gap-2 text-muted">
              <Bold className="h-3 w-3" />
              <Italic className="h-3 w-3" />
              <Underline className="h-3 w-3" />
              <List className="h-3 w-3" />
            </span>
          </div>

          {/* The article. Plain markup: this is the part that must survive. */}
          <div className="relative p-5">
            <h3 className="text-[15px] leading-snug font-semibold text-ink">
              The Complete Guide to Home Workouts
            </h3>

            <p className="mt-3 text-[12px] leading-relaxed text-ink-soft">
              <motion.span
                className="rounded px-0.5"
                style={{
                  backgroundImage:
                    'linear-gradient(var(--color-accent-100), var(--color-accent-100))',
                  backgroundRepeat: 'no-repeat',
                }}
                initial={{ backgroundSize: '0% 100%' }}
                animate={{ backgroundSize: live ? '100% 100%' : '0% 100%' }}
                transition={run(AT.highlight, 0.6)}
              >
                Home workouts
              </motion.span>{' '}
              are a flexible and effective way to stay fit, build strength and improve your mental
              health, without the need for a gym membership. Whether you are a complete beginner or
              looking to switch up your routine, this guide will help you get started.
            </p>

            <div className="mt-3 space-y-1.5">
              {['w-full', 'w-11/12', 'w-10/12', 'w-full', 'w-9/12', 'w-full'].map((width, index) => (
                <span key={width + index} className={`block h-1.5 rounded bg-surface-sunken ${width}`} />
              ))}
            </div>

            {/*
              The cover, not the text. It starts over the paragraph and
              retracts to the right, so the words appear from the left the way
              they would be typed - and when nothing runs there is simply no
              cover, rather than no article.
            */}
            <motion.span
              className="pointer-events-none absolute inset-x-5 top-[3.25rem] bottom-5 origin-right bg-white"
              initial={{ scaleX: 1 }}
              animate={{ scaleX: live ? 0 : 1 }}
              transition={still ? { duration: 0 } : { duration: 1.15, delay: AT.write, ease: 'easeInOut' }}
            />
          </div>
        </div>

        {/* --------------------------------------------------- the brief */}
        <motion.div
          className="absolute top-8 left-0 hidden w-36 sm:-left-14 lg:-left-16 rounded-lg border border-line bg-white p-3 shadow-[var(--shadow-pop)] sm:block"
          initial={{ opacity: 0, x: -18, y: 8 }}
          animate={live ? { opacity: 1, x: 0, y: 0 } : { opacity: 0, x: -18, y: 8 }}
          transition={run(AT.brief, 0.55)}
        >
          <p className="text-[10px] font-semibold text-ink">Article Brief</p>
          <dl className="mt-2 space-y-1.5">
            {BRIEF.map(([label, value]) => (
              <div key={label}>
                <dt className="text-[9px] tracking-wide text-muted uppercase">{label}</dt>
                <dd className="text-[10px] leading-snug text-ink-soft">{value}</dd>
              </div>
            ))}
          </dl>
        </motion.div>

        {/* ------------------------------------------------- the checks */}
        <motion.div
          className="absolute right-0 bottom-8 hidden w-44 rounded-lg border border-line bg-white p-3 shadow-[var(--shadow-pop)] sm:block"
          initial={{ opacity: 0, x: 18 }}
          animate={live ? { opacity: 1, x: 0 } : { opacity: 0, x: 18 }}
          transition={run(AT.checks, 0.5)}
        >
          <p className="text-[10px] font-semibold text-ink">SEO checks</p>
          <ul className="mt-2 space-y-1.5">
            {CHECKS.map((check, index) => (
              <motion.li
                key={check}
                className="flex items-center gap-1.5 text-[10px] text-ink-soft"
                initial={{ opacity: 0 }}
                animate={{ opacity: live ? 1 : 0 }}
                transition={run(AT.checks + 0.25 + index * 0.1, 0.3)}
              >
                <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-accent-100 text-accent-700">
                  <Check className="h-2.5 w-2.5" />
                </span>
                {check}
              </motion.li>
            ))}
          </ul>
        </motion.div>

        {/* ------------------------------------------------- the review */}
        <motion.div
          className="absolute bottom-0 left-2 hidden w-52 rounded-lg border border-line bg-white p-3 shadow-[var(--shadow-pop)] sm:block"
          initial={{ opacity: 0, y: 14 }}
          animate={live ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }}
          transition={run(AT.review, 0.5)}
        >
          <p className="text-[10px] font-semibold text-ink">Ready for your review</p>
          <p className="mt-1 text-[10px] leading-snug text-muted">
            Your draft has been written and edited, and is waiting in your dashboard.
          </p>
        </motion.div>
      </div>

      <figcaption className="text-[12px] text-muted">
        An illustration of the content editor: a brief, a draft and the checks a writer works
        through. The article and the brief are an example, and the checks are checks rather than a
        score.
      </figcaption>
    </figure>
  );
}
