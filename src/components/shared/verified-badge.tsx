import { BadgeCheck } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/** Marks websites that have passed manual editorial vetting. */
export function VerifiedBadge({
  className,
  withLabel = false,
}: {
  className?: string;
  withLabel?: boolean;
}) {
  if (withLabel) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full bg-accent-50 px-2 py-0.5 text-[11px] font-medium text-accent-700',
          className,
        )}
      >
        <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
        Vetted
      </span>
    );
  }
  return (
    <span title="Manually vetted by our editorial team" className="inline-flex">
      <BadgeCheck
        className={cn('h-3.5 w-3.5 text-accent-600', className)}
        aria-label="Manually vetted website"
        role="img"
      />
    </span>
  );
}
