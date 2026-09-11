import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

interface SlotProps {
  children?: ReactNode;
  className?: string;
  [key: string]: unknown;
}

/**
 * Minimal `asChild` implementation: merges props onto the single child element
 * so buttons can render as links without an extra wrapper.
 */
export function Slot({ children, className, ...props }: SlotProps) {
  const child = Children.only(children) as ReactElement<{ className?: string }>;
  if (!isValidElement(child)) return null;
  return cloneElement(child, {
    ...props,
    ...child.props,
    className: cn(className, child.props.className),
  } as never);
}
