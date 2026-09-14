import Image from 'next/image';
import Link from 'next/link';
import { brand } from '@/lib/config/brand';
import { cn } from '@/lib/utils/cn';

/**
 * Path to the logo lockup, or empty when no artwork has been added.
 *
 * Resolved at build time in `next.config.ts` (see LOGO_CANDIDATES there) so a
 * missing file can never render as a broken image, and so this component stays
 * usable inside client components.
 */
const brandLogo = process.env.NEXT_PUBLIC_BRAND_LOGO ?? '';

/**
 * Fallback brand mark: a parrot head in a rounded navy tile.
 *
 * Drawn inline so there is no image request on first paint. Used until a real
 * logo file exists.
 */
export function ParrotMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn('h-7 w-7', className)}
      role="presentation"
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="8" fill="var(--color-navy-900)" />
      {/* crest, attached to the head so it reads as plumage */}
      <path
        d="M15 11.2c1-3.6 3.9-5.9 7.1-5.8-.1 3.4-2.2 6.2-5.2 7.3z"
        fill="var(--color-accent-300)"
      />
      {/* head */}
      <circle cx="18.2" cy="16.4" r="6.8" fill="var(--color-accent-400)" />
      {/* hooked beak */}
      <path
        d="M12.6 13.2 6.9 15.8c-.9.4-.9 1.7 0 2.1l4.3 2c.7.3 1.4-.3 1.2-1l-.5-2a1.4 1.4 0 0 1 .1-.9l.8-1.8c.3-.6-.4-1.2-1-.9Z"
        fill="var(--color-coral-500)"
      />
      {/* eye */}
      <circle cx="19.8" cy="14.9" r="1.8" fill="var(--color-navy-900)" />
      <circle cx="20.4" cy="14.3" r=".55" fill="#ffffff" />
    </svg>
  );
}

export function Logo({
  className,
  tone = 'dark',
  href = '/',
}: {
  className?: string;
  tone?: 'dark' | 'light';
  href?: string | null;
}) {
  // "Press" carries the navy, "Parrot" the green.
  const [firstWord, ...rest] = brand.name.split(' ');
  const restOfName = rest.join(' ');

  const content = brandLogo ? (
    <Image
      src={brandLogo}
      alt={brand.name}
      width={2098}
      height={749}
      priority
      // Height is fixed and width follows the artwork's own aspect ratio.
      className={cn('h-11 w-auto', className)}
    />
  ) : (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <ParrotMark />
      <span className="text-[17px] font-semibold tracking-tight">
        <span className={tone === 'dark' ? 'text-ink' : 'text-white'}>{firstWord}</span>
        {restOfName ? <span className="text-accent-600"> {restOfName}</span> : null}
      </span>
    </span>
  );

  if (!href) return content;
  return (
    <Link href={href} aria-label={`${brand.name} home`} className="inline-flex rounded-md">
      {content}
    </Link>
  );
}
