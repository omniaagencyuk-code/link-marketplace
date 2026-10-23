import { ClipboardList, MousePointerClick, PackageCheck, SlidersHorizontal } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * How an order runs, in four steps.
 *
 * One copy, because it is one marketplace and one order flow. /link-building
 * and /niche-edits both draw this band, and two pages describing the same
 * four steps in their own words would be two descriptions to keep true -
 * which in practice means one of them stops being true and nobody notices,
 * because nobody reads two service pages side by side.
 *
 * What each page keeps is its own heading above the band. The steps, their
 * icons and their order are here.
 */
export const ORDER_STEPS: { icon: LucideIcon; label: string }[] = [
  { icon: SlidersHorizontal, label: 'Filter the marketplace' },
  { icon: MousePointerClick, label: 'Choose the sites that fit' },
  { icon: ClipboardList, label: 'Add them to an order' },
  { icon: PackageCheck, label: 'Track each one to a live URL' },
];

/**
 * The band itself, without its heading.
 *
 * Sits inside the caller's `Reveal` so the page decides how it arrives - the
 * stagger wants `data-reveal-items` on the repeating group, which is the
 * `<ol>` here.
 */
export function OrderSteps() {
  return (
    /*
      The connecting line is drawn behind the row and only on a wide screen,
      where the steps are side by side. Stacked on a phone, a horizontal line
      between them would point at nothing.
    */
    <div className="relative">
      <div
        aria-hidden="true"
        className="absolute top-6 right-[12.5%] left-[12.5%] hidden h-px bg-gradient-to-r from-accent-200 via-accent-300 to-accent-200 lg:block"
      />
      <ol data-reveal-items="" className="relative grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {ORDER_STEPS.map((step, index) => (
          <li key={step.label} className="text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-accent-100 bg-white text-accent-700 shadow-[var(--shadow-card)]">
              <step.icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <p className="mt-4 text-[11px] font-semibold tracking-[0.1em] text-muted uppercase">
              Step {index + 1}
            </p>
            <p className="mt-1 text-[15px] font-semibold text-ink">{step.label}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
