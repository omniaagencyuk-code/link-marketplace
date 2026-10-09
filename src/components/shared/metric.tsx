import { cn } from '@/lib/utils/cn';

/** Domain Rating chip, colour-coded by strength. */
/**
 * Domain rating as a ring.
 *
 * A number in a tinted pill said the same thing, and said it worse: the
 * three bands it coloured by were invisible unless you already knew them,
 * and a DR of 64 and a DR of 65 looked like different kinds of site rather
 * than one point apart. The ring is the figure itself - the arc is the
 * value out of 100 - so the comparison a buyer is making while scanning a
 * column is the one being drawn.
 *
 * Pure SVG and no animation: there are up to a hundred of these on a page
 * and they are not the content.
 *
 * `aria-hidden` on the ring with the number as real text, so a screen
 * reader hears "DR 64" rather than a description of a circle.
 */
export function DomainRating({ value, className }: { value: number; className?: string }) {
  const safe = Math.max(0, Math.min(100, Math.round(value)));
  // 0-100 onto the circumference of an r=15.5 circle, drawn as a dash.
  const circumference = 2 * Math.PI * 15.5;
  const tone = safe >= 65 ? 'text-accent-600' : safe >= 40 ? 'text-accent-500/80' : 'text-muted-soft';

  return (
    <span
      className={cn('relative inline-flex h-9 w-9 items-center justify-center', className)}
      title={`Domain rating ${safe} out of 100`}
    >
      <svg viewBox="0 0 36 36" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="2.5" className="stroke-surface-sunken" />
        <circle
          cx="18"
          cy="18"
          r="15.5"
          fill="none"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={`${(safe / 100) * circumference} ${circumference}`}
          className={cn('stroke-current', tone)}
        />
      </svg>
      <span className="tabular relative text-[12px] font-semibold text-ink">{safe}</span>
      <span className="sr-only">domain rating</span>
    </span>
  );
}

export function MetricLabelValue({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-[12px] font-medium tracking-wide text-muted uppercase">{label}</dt>
      <dd className="tabular mt-1 text-lg font-semibold text-ink">{value}</dd>
      {hint ? <p className="text-[12px] text-muted">{hint}</p> : null}
    </div>
  );
}
