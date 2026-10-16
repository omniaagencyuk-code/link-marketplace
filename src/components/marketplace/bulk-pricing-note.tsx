import Link from 'next/link';
import { ArrowRight, Layers } from 'lucide-react';

/**
 * A line above the listings saying a bigger order can be discussed.
 *
 * Deliberately small. The marketplace is where somebody buys, and the thing
 * that must not happen is a promotional band pushing the first publisher
 * below the fold or sitting between the filters and the results. It is one
 * row, outside the filter and listing components entirely, and it links out
 * rather than opening anything.
 *
 * It does not say what a discount would be, because there is not one to
 * name: every buyer pays the listed price, and a promo code is the only
 * thing that changes it. A banner promising a figure the pricing code does
 * not apply is a figure we would have to honour or retract.
 */
export function BulkPricingNote() {
  return (
    <aside className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--radius-card)] border border-line bg-white px-4 py-3">
      <span
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent-50 text-accent-700"
        aria-hidden="true"
      >
        <Layers className="h-3.5 w-3.5" />
      </span>

      <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-ink-soft">
        <strong className="font-semibold text-ink">Ordering multiple placements?</strong>{' '}
        <span className="text-muted">
          We may be able to offer better rates for bulk purchases and regular orders.
        </span>
      </p>

      <Link
        href="/pricing#enquiry"
        className="inline-flex shrink-0 items-center gap-1 text-[13px] font-medium text-accent-700 hover:underline"
      >
        Ask about custom pricing
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </aside>
  );
}
