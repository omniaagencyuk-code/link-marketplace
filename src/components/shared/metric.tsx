import { cn } from '@/lib/utils/cn';

/** Domain Rating chip, colour-coded by strength. */
export function DomainRating({ value, className }: { value: number; className?: string }) {
  const tone =
    value >= 65
      ? 'bg-accent-50 text-accent-700'
      : value >= 50
        ? 'bg-blue-50 text-blue-700'
        : 'bg-surface-sunken text-ink-soft';
  return (
    <span
      className={cn(
        'tabular inline-flex min-w-10 items-center justify-center rounded px-1.5 py-0.5 text-[12px] font-semibold',
        tone,
        className,
      )}
    >
      {value}
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
