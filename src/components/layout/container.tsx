import { cn } from '@/lib/utils/cn';
import type { HTMLAttributes } from 'react';

/** Page gutter. `wide` is used by the marketplace, `default` everywhere else. */
export function Container({
  className,
  size = 'default',
  ...props
}: HTMLAttributes<HTMLDivElement> & { size?: 'default' | 'wide' | 'narrow' }) {
  return (
    <div
      className={cn(
        'mx-auto w-full px-4 sm:px-6 lg:px-8',
        size === 'wide' ? 'max-w-[92rem]' : size === 'narrow' ? 'max-w-3xl' : 'max-w-7xl',
        className,
      )}
      {...props}
    />
  );
}
