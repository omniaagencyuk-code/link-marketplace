import { cn } from '@/lib/utils/cn';
import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

const fieldStyles =
  'w-full rounded-md border border-line-strong bg-white text-sm text-ink placeholder:text-muted-soft ' +
  'transition-colors hover:border-muted-soft focus:border-accent-500 focus:outline-none ' +
  'focus:ring-2 focus:ring-accent-500/20 disabled:cursor-not-allowed disabled:bg-surface-sunken';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldStyles, 'h-10 px-3', className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldStyles, 'min-h-24 px-3 py-2', className)} {...props} />;
}

export { fieldStyles };
