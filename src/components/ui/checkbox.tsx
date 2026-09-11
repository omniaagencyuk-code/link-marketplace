'use client';

import { Check, Minus } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { InputHTMLAttributes } from 'react';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  indeterminate?: boolean;
}

export function Checkbox({ className, indeterminate, checked, ...props }: CheckboxProps) {
  return (
    <span className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center">
      <input
        type="checkbox"
        checked={checked}
        className={cn(
          'peer h-4 w-4 cursor-pointer appearance-none rounded border border-line-strong bg-white transition-colors',
          'checked:border-accent-600 checked:bg-accent-600 hover:border-muted-soft',
          indeterminate && 'border-accent-600 bg-accent-600',
          className,
        )}
        {...props}
      />
      {indeterminate ? (
        <Minus className="pointer-events-none absolute h-3 w-3 text-white" aria-hidden="true" />
      ) : (
        <Check
          className="pointer-events-none absolute hidden h-3 w-3 text-white peer-checked:block"
          aria-hidden="true"
        />
      )}
    </span>
  );
}
