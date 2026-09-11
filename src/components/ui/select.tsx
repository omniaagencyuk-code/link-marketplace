import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { SelectHTMLAttributes } from 'react';

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  /** Visual size. Shadows the native numeric `size` attribute deliberately. */
  size?: 'sm' | 'md';
}

/** Native select styled to match the design system - accessible by default. */
export function Select({ className, children, size = 'md', ...props }: SelectProps) {
  return (
    <div className="relative">
      <select
        className={cn(
          'w-full appearance-none rounded-md border border-line-strong bg-white pr-8 font-medium text-ink',
          'transition-colors hover:border-muted-soft focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20',
          'disabled:cursor-not-allowed disabled:bg-surface-sunken',
          size === 'sm' ? 'h-8 pl-2.5 text-[13px]' : 'h-10 pl-3 text-sm',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted"
        aria-hidden="true"
      />
    </div>
  );
}
