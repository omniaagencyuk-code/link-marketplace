import { cn } from '@/lib/utils/cn';

export function Avatar({
  initials,
  className,
  tone = 'navy',
}: {
  initials: string;
  className?: string;
  tone?: 'navy' | 'accent';
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold',
        tone === 'navy' ? 'bg-navy-900 text-white' : 'bg-accent-100 text-accent-700',
        className,
      )}
    >
      {initials}
    </span>
  );
}
