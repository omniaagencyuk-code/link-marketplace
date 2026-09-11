'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';
import { Slot } from './slot';

interface DropdownProps {
  /** Rendered inside the trigger button. */
  trigger: ReactNode;
  children: (close: () => void) => ReactNode;
  align?: 'start' | 'end';
  className?: string;
  triggerClassName?: string;
  label: string;
}

/** Lightweight popover menu with outside-click and Escape handling. */
export function Dropdown({
  trigger,
  children,
  align = 'end',
  className,
  triggerClassName,
  label,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md border border-line-strong bg-white px-3 text-sm font-medium text-ink transition-colors hover:border-muted-soft',
          triggerClassName,
        )}
      >
        {trigger}
      </button>
      {open ? (
        <div
          role="menu"
          className={cn(
            'absolute z-40 mt-1.5 min-w-44 rounded-lg border border-line bg-white p-1 shadow-[var(--shadow-pop)]',
            align === 'end' ? 'right-0' : 'left-0',
            className,
          )}
        >
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}

export function DropdownItem({
  className,
  active,
  asChild,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      {...(asChild ? {} : { type: 'button' as const })}
      role="menuitem"
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] text-ink-soft transition-colors hover:bg-surface-sunken hover:text-ink',
        active && 'bg-accent-50 text-accent-700 hover:bg-accent-50 hover:text-accent-700',
        className,
      )}
      {...props}
    />
  );
}
