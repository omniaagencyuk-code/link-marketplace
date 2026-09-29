import { cn } from '@/lib/utils/cn';

/**
 * How far through a long job is.
 *
 * Used where a bulk action is sent in pieces, so the number under it is a
 * real count of work finished rather than an animation that means nothing.
 * A bar that moves while nothing happens is worse than no bar: it is the
 * reason somebody waits instead of telling you it is broken.
 *
 * The label is read out as the status, and the bar is marked
 * `aria-hidden` - a progressbar role announcing the same numbers again is
 * noise, not access.
 */
export function ProgressBar({
  done,
  total,
  label,
  className,
}: {
  done: number;
  total: number;
  label: string;
  className?: string;
}) {
  const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;

  return (
    <div className={cn('space-y-1.5', className)}>
      <div
        aria-hidden="true"
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken"
      >
        <div
          className="h-full rounded-full bg-accent-600 transition-[width] duration-300 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p role="status" className="tabular text-[13px] text-ink-soft">
        {label}
      </p>
    </div>
  );
}
