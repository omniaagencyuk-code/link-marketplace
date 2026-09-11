import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export function Stat({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'default',
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
  tone?: 'default' | 'accent';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-card)] border border-line bg-white p-4 shadow-[var(--shadow-card)]',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] font-medium tracking-wide text-muted uppercase">{label}</p>
        {Icon ? (
          <span
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-md',
              tone === 'accent' ? 'bg-accent-50 text-accent-700' : 'bg-surface-sunken text-muted',
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        ) : null}
      </div>
      <p className="tabular mt-2 text-2xl font-semibold text-ink">{value}</p>
      {hint ? <p className="mt-1 text-[12px] text-muted">{hint}</p> : null}
    </div>
  );
}
