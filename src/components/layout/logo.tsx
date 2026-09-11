import Link from 'next/link';
import { brand } from '@/lib/config/brand';
import { cn } from '@/lib/utils/cn';

/**
 * Brand mark. Drawn inline so there is no image request on first paint.
 * Swap for an <Image> when a real logo file is supplied - see brand.logo.
 */
export function Logo({
  className,
  tone = 'dark',
  href = '/',
}: {
  className?: string;
  tone?: 'dark' | 'light';
  href?: string | null;
}) {
  const content = (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span
        aria-hidden="true"
        className="flex h-7 w-7 items-center justify-center rounded-[7px] bg-navy-900"
      >
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
          <path
            d="M4.5 11.5 8 8l3.5 3.5"
            stroke="var(--color-accent-400)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M8.5 15.5h5a3 3 0 0 0 0-6h-1"
            stroke="white"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <span
        className={cn(
          'text-[17px] font-semibold tracking-tight',
          tone === 'dark' ? 'text-ink' : 'text-white',
        )}
      >
        {brand.name}
      </span>
    </span>
  );

  if (!href) return content;
  return (
    <Link href={href} aria-label={`${brand.name} home`} className="rounded-md">
      {content}
    </Link>
  );
}
