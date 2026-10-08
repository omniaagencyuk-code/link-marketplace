import { cn } from '@/lib/utils/cn';

/**
 * The shape of something that has not arrived yet.
 *
 * Shapes rather than a spinner, and the same shapes as the real thing. A
 * spinner says "wait"; a skeleton says "a table of rows is coming", and when
 * the rows land they land where the grey bars were instead of shoving the
 * page down. That jump is the thing being avoided here, not the waiting.
 *
 * `animate-pulse` is Tailwind's own - no library, one keyframe. It is also
 * the only animation on these screens.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded bg-surface-sunken', className)} />;
}

/** A page's heading block, while the page itself is still being built. */
export function SkeletonTitle() {
  return (
    <div className="mb-6 space-y-2">
      <Skeleton className="h-7 w-56" />
      <Skeleton className="h-4 w-80 max-w-full" />
    </div>
  );
}

export function SkeletonCards({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)]"
        >
          <Skeleton className="h-9 w-9 rounded-lg" />
          <Skeleton className="mt-3 h-3 w-24" />
          <Skeleton className="mt-2 h-7 w-20" />
        </div>
      ))}
    </div>
  );
}

/**
 * A table, roughly the shape of the one coming.
 *
 * `rows` is deliberately a guess rather than a count: nobody knows how many
 * rows are coming until they arrive, and a skeleton of eight that becomes
 * fifty still beats a blank screen that becomes fifty.
 */
export function SkeletonTable({ rows = 8 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-white shadow-[var(--shadow-card)]">
      <div className="border-b border-line bg-surface px-4 py-3">
        <Skeleton className="h-3 w-32" />
      </div>
      <div className="divide-y divide-line">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="flex items-center gap-4 px-4 py-3">
            <Skeleton className="h-4 w-4 shrink-0 rounded" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="hidden h-4 w-24 sm:block" />
            <Skeleton className="hidden h-4 w-16 md:block" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
