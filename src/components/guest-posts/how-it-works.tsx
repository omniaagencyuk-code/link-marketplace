'use client';

import { useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'motion/react';
import { ClipboardCheck, LineChart, Search, type LucideIcon } from 'lucide-react';

/**
 * Three steps, arriving one after another.
 *
 * Motion rather than the site's own `Reveal` for this one section, because
 * the thing being animated is the *sequence*: the cards are a numbered
 * process and they land in order, with the rule between them drawing across
 * as each one settles. `Reveal` does one element at a time with a CSS
 * transition and has no way to say "after that one".
 *
 * Everywhere else on this page that is simply fading in as you scroll uses
 * `Reveal`, which is cheaper and - more to the point - never hides anything
 * when JavaScript has not run. The copy here is short and repeated in the
 * body text below, so a card that stayed invisible would cost a visitor
 * nothing they cannot read further down.
 */

const ICONS: LucideIcon[] = [Search, LineChart, ClipboardCheck];

export interface HowItWorksStep extends Record<string, unknown> {
  title: string;
  body: string;
}

export function HowItWorks({ steps }: { steps: HowItWorksStep[] }) {
  const list = useRef<HTMLOListElement>(null);
  // Once. A process diagram that replays every time you scroll past is a
  // distraction, not a feature.
  const seen = useInView(list, { once: true, amount: 0.25 });
  const still = useReducedMotion();

  if (steps.length === 0) return null;

  return (
    <ol ref={list} className="mt-10 grid gap-5 md:grid-cols-3">
      {steps.map((step, index) => {
        const Icon = ICONS[index % ICONS.length]!;
        return (
          <motion.li
            key={step.title || index}
            initial={still ? false : { opacity: 0, y: 14 }}
            animate={still || seen ? { opacity: 1, y: 0 } : undefined}
            transition={{
              duration: 0.5,
              delay: still ? 0 : index * 0.12,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="group relative rounded-[var(--radius-card)] border border-line bg-white p-6 transition-colors duration-200 hover:border-line-strong"
          >
            {/*
              The connector, drawn between cards rather than under them. Only
              on the two that have a card to their right, and only where the
              grid is actually three across - stacked on a phone it would be a
              line pointing at nothing.
            */}
            {index < steps.length - 1 ? (
              <motion.span
                aria-hidden="true"
                className="absolute top-12 -right-5 hidden h-px bg-line md:block"
                initial={still ? false : { width: 0 }}
                animate={still || seen ? { width: '1.25rem' } : undefined}
                transition={{ duration: 0.4, delay: still ? 0 : 0.35 + index * 0.12 }}
              />
            ) : null}

            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-50 text-accent-700 transition-colors duration-200 group-hover:bg-accent-100">
                <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
              </span>
              <span className="tabular text-[12px] font-semibold text-muted">
                Step {index + 1}
              </span>
            </div>

            <h3 className="mt-4 text-[17px] font-semibold text-ink">{step.title}</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-muted">{step.body}</p>
          </motion.li>
        );
      })}
    </ol>
  );
}
