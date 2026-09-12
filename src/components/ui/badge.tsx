import { cn } from '@/lib/utils/cn';
import type { HTMLAttributes } from 'react';

export type BadgeTone =
  | 'neutral'
  | 'accent'
  | 'navy'
  | 'positive'
  | 'warning'
  | 'negative'
  | 'info'
  | 'coral'
  | 'outline';

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-surface-sunken text-ink-soft',
  accent: 'bg-accent-50 text-accent-700',
  navy: 'bg-navy-900 text-white',
  positive: 'bg-accent-50 text-accent-700',
  warning: 'bg-amber-50 text-amber-700',
  negative: 'bg-red-50 text-red-700',
  info: 'bg-blue-50 text-blue-700',
  coral: 'bg-coral-50 text-coral-700',
  outline: 'border border-line-strong text-ink-soft bg-white',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  size?: 'sm' | 'md';
}

export function Badge({ className, tone = 'neutral', size = 'sm', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
