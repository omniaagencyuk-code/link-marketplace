import { cn } from '@/lib/utils/cn';

/**
 * A publisher's mark, drawn rather than fetched.
 *
 * The obvious way to put a logo beside a domain is a favicon service, and
 * every one of them is somebody else's server. Using one would send a request
 * naming the publisher to a third party every time a customer looks at their
 * shortlist - which hands that company a list of which publishers each of our
 * customers is considering. That is browsing history about our customers and
 * our inventory, given away for a 16-pixel picture.
 *
 * Fetching `/favicon.ico` from the publishers themselves avoids the third
 * party and swaps it for a few hundred requests that mostly 404, which is a
 * grid of broken images.
 *
 * So it is drawn here: the first letter of the domain, on a tint picked from
 * the domain itself. No request, nothing to leak, the same size every time,
 * and it cannot break.
 */
const TINTS = [
  'bg-accent-50 text-accent-700',
  'bg-blue-50 text-blue-700',
  'bg-violet-50 text-violet-700',
  'bg-amber-50 text-amber-700',
  'bg-coral-50 text-coral-700',
  'bg-navy-900/5 text-navy-700',
] as const;

export function SiteMark({ domain, className }: { domain: string; className?: string }) {
  const name = domain.replace(/^www\./, '');
  const letter = (name[0] ?? '?').toUpperCase();

  /*
    Stable across renders and across machines: the same domain is always the
    same colour, so a publisher is recognisable in a list without reading it.
    A random or index-based tint would re-colour the grid on every sort.
  */
  let hash = 0;
  for (const character of name) hash = (hash * 31 + character.charCodeAt(0)) % 100_000;

  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[13px] font-semibold',
        TINTS[hash % TINTS.length],
        className,
      )}
    >
      {letter}
    </span>
  );
}
