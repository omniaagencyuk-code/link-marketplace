import { ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { WebsiteDurability } from '@/lib/types';

/**
 * How well links on this site have held up.
 *
 * Reads the stored figure and nothing else. The score is computed nightly
 * across every watched link; a component that worked it out per card would be
 * a query per card on a page that renders hundreds.
 *
 * ## No score is not a bad score
 *
 * A listing with too few placements to measure shows "New" and says so on
 * hover. The temptation is to show 0%, or to hide the badge entirely - the
 * first is a libel and the second makes a measured listing look identical to
 * an unmeasured one, which removes the whole point of measuring. So the
 * absence is stated.
 */

/**
 * Green, amber, red.
 *
 * Ninety is the line because that is roughly where a link stops being worth
 * worrying about: one in ten gone over a year is the ordinary attrition of
 * the web. Below seventy-five is a site that loses a quarter of what it
 * publishes, and a buyer should see that before they pay.
 */
function tone(pct: number): { chip: string; text: string } {
  if (pct >= 90) return { chip: 'bg-accent-50', text: 'text-accent-700' };
  if (pct >= 75) return { chip: 'bg-amber-50', text: 'text-amber-700' };
  return { chip: 'bg-red-50', text: 'text-red-700' };
}

function sentence(durability: WebsiteDurability): string {
  const placements = durability.sample === 1 ? '1 placement' : `${durability.sample} placements`;
  return (
    `${durability.pct}% of links we placed here were still live ` +
    `${durability.windowMonths} months later, across ${placements}.`
  );
}

export function DurabilityBadge({
  durability,
  className,
}: {
  durability?: WebsiteDurability;
  className?: string;
}) {
  if (!durability) {
    return (
      <span
        title="Not enough placements on this site yet to measure how well its links hold up."
        className={cn(
          'inline-flex items-center gap-1 rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] font-medium text-ink-soft',
          className,
        )}
      >
        <ShieldCheck className="h-3 w-3 opacity-60" aria-hidden="true" />
        New
      </span>
    );
  }

  const colours = tone(durability.pct);

  return (
    <span
      title={sentence(durability)}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
        colours.chip,
        colours.text,
        className,
      )}
    >
      <ShieldCheck className="h-3 w-3" aria-hidden="true" />
      <span className="tabular">{durability.pct}%</span>
      <span className="font-normal opacity-70">{durability.windowMonths}m</span>
    </span>
  );
}

/**
 * The same figure, with its working shown.
 *
 * For the listing page, where there is room to say what the number means and
 * a buyer is deciding about this one site rather than scanning fifty.
 */
export function DurabilityPanel({ durability }: { durability?: WebsiteDurability }) {
  if (!durability) {
    return (
      <div className="rounded-lg border border-line bg-surface-sunken/50 p-3">
        <p className="text-[13px] font-medium text-ink">Link durability</p>
        <p className="mt-1 text-[12px] leading-relaxed text-muted">
          Not measured yet. We check every link we place weekly for twelve months, and this
          site has not carried enough placements for the figure to mean anything.
        </p>
      </div>
    );
  }

  const colours = tone(durability.pct);

  return (
    <div className="rounded-lg border border-line p-3">
      <p className="text-[13px] font-medium text-ink">Link durability</p>
      <p className={cn('tabular mt-1 text-[22px] font-semibold', colours.text)}>
        {durability.pct}%
      </p>
      <p className="mt-1 text-[12px] leading-relaxed text-muted">{sentence(durability)}</p>
    </div>
  );
}
