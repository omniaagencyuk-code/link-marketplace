import { cn } from '@/lib/utils/cn';

/**
 * Decorative tropical foliage.
 *
 * Inline SVG rather than images: a few hundred bytes, no extra requests, and
 * it inherits the brand greens. Always hidden from assistive technology, and
 * kept low-contrast so it reads as texture rather than content.
 */

export function MonsteraLeaf({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={cn('text-accent-500', className)} aria-hidden="true">
      <path
        fill="currentColor"
        d="M60 6c-7 18-21 27-38 31 6 9 6 20 2 30 14-2 24 3 31 13 7-12 17-18 31-18-6-9-7-20-2-30-10-3-19-12-24-26Z"
        opacity=".5"
      />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        d="M60 6v108M60 40 34 26M60 40l26-14M60 66 32 56M60 66l28-10M60 90l-22-6M60 90l22-6"
        opacity=".55"
      />
    </svg>
  );
}

export function PalmFrond({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 140 90" className={cn('text-accent-600', className)} aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        d="M4 84C40 74 96 50 136 8"
        opacity=".6"
      />
      {Array.from({ length: 9 }).map((_, index) => {
        const t = index / 8;
        const x = 4 + t * 132;
        const y = 84 - t * 76;
        return (
          <path
            key={index}
            d={`M${x} ${y}c10-14 22-20 34-20-8 12-20 19-34 20Z`}
            fill="currentColor"
            opacity={0.18 + t * 0.16}
          />
        );
      })}
    </svg>
  );
}

export function Feather({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 90" className={cn('text-accent-500', className)} aria-hidden="true">
      <path
        fill="currentColor"
        d="M20 2c14 16 16 40 6 60-4 8-9 15-14 20 1-9-1-17-6-24C-2 40 6 16 20 2Z"
        opacity=".35"
      />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        d="M20 4c2 26-1 52-8 78"
        opacity=".6"
      />
    </svg>
  );
}

/**
 * Foliage anchored to a corner of a section. `position` picks the corner and
 * the rotation, so callers only choose where it goes.
 */
export function CornerFoliage({
  position,
  className,
}: {
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  className?: string;
}) {
  const placement: Record<typeof position, string> = {
    'top-left': '-top-10 -left-12 -rotate-12',
    'top-right': '-top-12 -right-10 rotate-[200deg]',
    'bottom-left': '-bottom-12 -left-10 rotate-[160deg]',
    'bottom-right': '-bottom-10 -right-12 rotate-[20deg]',
  };

  return (
    <div
      aria-hidden="true"
      className={cn('pointer-events-none absolute select-none', placement[position], className)}
    >
      <PalmFrond className="h-auto w-44 opacity-[0.13] lg:w-56" />
    </div>
  );
}
