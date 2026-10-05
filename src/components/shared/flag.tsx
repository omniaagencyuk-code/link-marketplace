import { Globe } from 'lucide-react';
import { countryName } from '@/lib/data/countries';
import { cn } from '@/lib/utils/cn';
import type { CountryCode } from '@/lib/types';

/**
 * A country's flag.
 *
 * An SVG served from `public/flags`, not an emoji. Flag emoji are regional
 * indicator pairs, and Windows has no font that draws them - it renders the
 * two letters instead. So the same marketplace row reads as a flag on a Mac
 * and as "GB" on most of our customers' machines, which is exactly the
 * inconsistency worth avoiding.
 *
 * Served rather than bundled: there are 265 of them and a page shows a handful,
 * so importing the set would put a megabyte of SVG into the JavaScript bundle
 * to draw six flags. As images the browser fetches only what it draws and
 * caches them across the whole session.
 *
 * ## Accessibility
 *
 * The image is always decorative - `alt=""` - because a flag is never the only
 * thing saying which country this is. Where the name is on screen beside it,
 * that is the label; where it is not, `label` renders it for screen readers
 * and as a tooltip. A flag that announced "flag of United Kingdom" next to the
 * words "United Kingdom" would read it twice.
 */
export function Flag({
  country,
  label = false,
  className,
}: {
  country: CountryCode | string;
  /** True where no country name is visible beside it, as in the table. */
  label?: boolean;
  className?: string;
}) {
  const code = (country ?? '').trim().toUpperCase();
  const name = code ? countryName(code as CountryCode) : '';

  // Anything that is not a plain two-letter code has no flag file to serve,
  // and a broken image is worse than no flag.
  if (!/^[A-Z]{2}$/.test(code)) {
    return <Globe className={cn('h-3.5 w-3.5 text-muted', className)} aria-hidden="true" />;
  }

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/flags/${code}.svg`}
        alt=""
        width={18}
        height={13}
        loading="lazy"
        decoding="async"
        {...(label ? { title: name } : {})}
        className={cn('inline-block h-[13px] w-[18px] rounded-[2px] object-cover', className)}
      />
      {label ? <span className="sr-only">{name}</span> : null}
    </>
  );
}

/** The combined row, for countries we group rather than name. */
export function OtherCountriesIcon({ className }: { className?: string }) {
  return <Globe className={cn('h-3.5 w-3.5 text-muted', className)} aria-hidden="true" />;
}
