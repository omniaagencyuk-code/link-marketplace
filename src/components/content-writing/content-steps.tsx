import { ClipboardList, FileCheck2, MessageSquare, PenLine } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * How ordering content works, across the page rather than down it.
 *
 * Not `OrderSteps`, which /link-building and /niche-edits draw: those four
 * are how you buy a placement from the marketplace, and these four are how
 * you brief an article. Same reason /digital-pr has its own - two bands
 * describing different things, shared only where they are the same thing.
 *
 * The words are the CMS's. This component owns the icons and the drawing and
 * nothing else: an editor changing "Brief the article" changes what the band
 * says, and the step it says it about is still the second one.
 *
 * The connecting line uses `data-pp-draw`, the attribute /niche-edits' trend
 * line and /digital-pr's stage line already have: same dash counted down to
 * nothing, same `Reveal` deciding when. It is drawn only where the steps sit
 * side by side; stacked on a phone, a horizontal line between them points at
 * nothing.
 */

/** One icon per step, in the order the steps ship. */
const ICONS: LucideIcon[] = [ClipboardList, PenLine, MessageSquare, FileCheck2];

export interface ContentStep {
  step: string;
  title: string;
  body: string;
}

export function ContentSteps({ steps }: { steps: ContentStep[] }) {
  return (
    <div className="relative">
      <svg
        aria-hidden="true"
        viewBox="0 0 1000 2"
        preserveAspectRatio="none"
        className="absolute top-6 right-[12.5%] left-[12.5%] hidden h-px w-[75%] lg:block"
      >
        <line
          data-pp-draw=""
          style={{ '--pp-draw-length': '1000' } as React.CSSProperties}
          x1="0"
          y1="1"
          x2="1000"
          y2="1"
          stroke="var(--color-accent-300)"
          strokeWidth="2"
        />
      </svg>

      <ol data-reveal-items="" className="relative grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((entry, index) => {
          const Icon = ICONS[index % ICONS.length];
          return (
            <li key={entry.title || index} className="text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-accent-100 bg-white text-accent-700 shadow-[var(--shadow-card)]">
                {Icon ? <Icon className="h-5 w-5" aria-hidden="true" /> : null}
              </span>
              {/* The number is the editor's, not a count of the list: a step
                  renumbered in the builder should renumber here. */}
              <p className="tabular mt-4 text-[11px] font-semibold tracking-[0.1em] text-muted uppercase">
                Step {entry.step}
              </p>
              <p className="mt-1 text-[15px] font-semibold text-ink">{entry.title}</p>
              <p className="mx-auto mt-2 max-w-[22rem] text-[13px] leading-relaxed text-muted">
                {entry.body}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
