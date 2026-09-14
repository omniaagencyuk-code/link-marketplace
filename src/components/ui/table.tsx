import { cn } from '@/lib/utils/cn';
import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';

export function TableWrap({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'overflow-x-auto rounded-[var(--radius-card)] border border-line bg-white shadow-[var(--shadow-card)]',
        className,
      )}
      {...props}
    />
  );
}

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return <table className={cn('w-full border-collapse text-sm', className)} {...props} />;
}

export function Th({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        'overflow-hidden border-b border-line bg-surface/70 px-2.5 py-2.5 text-left text-[10px] font-semibold tracking-[0.04em] text-muted uppercase',
        className,
      )}
      {...props}
    />
  );
}

export function Td({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn('border-b border-line px-2.5 py-2.5 align-middle', className)} {...props} />
  );
}

export function Tr({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={cn('transition-colors last:[&>td]:border-b-0 hover:bg-surface', className)} {...props} />
  );
}
