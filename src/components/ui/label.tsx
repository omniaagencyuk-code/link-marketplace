import { cn } from '@/lib/utils/cn';
import type { LabelHTMLAttributes } from 'react';

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn('block text-[13px] font-medium text-ink-soft', className)}
      {...props}
    />
  );
}
