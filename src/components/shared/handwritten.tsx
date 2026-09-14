import { cn } from '@/lib/utils/cn';

/**
 * Hand-drawn annotation: a handwritten note plus a curved arrow.
 *
 * Deliberately reads as a margin scribble rather than UI text. The arrow is
 * stroke-drawn so it can animate itself in without a JavaScript library.
 */
export function HandwrittenNote({
  children,
  className,
  arrow = 'down-right',
}: {
  children: React.ReactNode;
  className?: string;
  arrow?: 'down-right' | 'down-left' | 'none';
}) {
  return (
    <div className={cn('pointer-events-none select-none', className)}>
      <p className="font-handwritten text-[19px] leading-[1.15] text-ink-soft sm:text-[22px]">
        {children}
      </p>
      {arrow !== 'none' ? (
        <CurvedArrow
          className={cn(
            'mt-1 h-auto w-16 text-muted sm:w-20',
            arrow === 'down-left' && '-scale-x-100',
          )}
        />
      ) : null}
    </div>
  );
}

export function CurvedArrow({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 56" fill="none" className={className} aria-hidden="true">
      <path
        d="M4 6c22 2 44 14 58 38"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className="animate-draw"
        pathLength={1}
      />
      <path
        d="M50 44c6 1 10 1 13-1M62 30c1 6 2 11 1 13"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
