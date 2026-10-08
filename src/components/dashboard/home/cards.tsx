import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { ArrowRight, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/**
 * The four figures across the top, and the tiles under them.
 *
 * Server components: they take numbers and links and return markup. The only
 * client islands on this dashboard are the two things that genuinely need the
 * browser - the saved shortlist, which lives in its storage, and the top bar.
 */

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
  href,
}: {
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
  tone: 'accent' | 'info' | 'violet' | 'amber';
  /** Where the card goes. Every one of these leads somewhere real. */
  href: string;
}) {
  const tones = {
    accent: 'bg-accent-50 text-accent-700',
    info: 'bg-blue-50 text-blue-700',
    violet: 'bg-violet-50 text-violet-700',
    amber: 'bg-amber-50 text-amber-700',
  } as const;

  return (
    <Link
      href={href}
      className="group rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)] transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <span className={cn('inline-flex rounded-lg p-2.5', tones[tone])}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <ChevronRight
          className="h-4 w-4 text-muted-soft transition-transform group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </div>
      <p className="mt-3 text-[13px] font-medium text-muted">{label}</p>
      <p className="tabular mt-1 text-[28px] leading-none font-semibold text-ink">{value}</p>
      {/*
        The hint is the honest part of a KPI: "0" on its own reads as
        something broken, and "No orders yet" reads as a starting point.
      */}
      <p className="mt-2 text-[12px] text-muted">{hint}</p>
    </Link>
  );
}

export function QuickActionTile({
  label,
  href,
  icon: Icon,
  tone,
}: {
  label: string;
  href: string;
  icon: LucideIcon;
  tone: 'accent' | 'mint' | 'peach' | 'sky' | 'lilac' | 'sand';
}) {
  // One prominent tile and five quiet ones, so the first thing a new
  // customer should do is the first thing they see.
  const tones = {
    accent: 'bg-accent-600 text-white hover:bg-accent-700',
    mint: 'bg-accent-50 text-accent-800 hover:bg-accent-100',
    peach: 'bg-coral-50 text-coral-700 hover:bg-coral-100',
    sky: 'bg-blue-50 text-blue-700 hover:bg-blue-100',
    lilac: 'bg-violet-50 text-violet-700 hover:bg-violet-100',
    sand: 'bg-amber-50 text-amber-700 hover:bg-amber-100',
  } as const;

  return (
    <Link
      href={href}
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-xl px-3 py-5 text-center text-[12px] font-semibold transition-colors',
        tones[tone],
      )}
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
      {label}
    </Link>
  );
}

export function SectionHeader({
  title,
  description,
  icon: Icon,
  action,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: { label: string; href: string };
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
      <div className="flex min-w-0 items-center gap-3">
        {Icon ? (
          <span className="inline-flex rounded-lg bg-surface-sunken p-2 text-ink-soft">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
        ) : null}
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-semibold text-ink">{title}</h2>
          {description ? <p className="mt-0.5 text-[12px] text-muted">{description}</p> : null}
        </div>
      </div>
      {action ? (
        <Link
          href={action.href}
          className="inline-flex shrink-0 items-center gap-1 text-[13px] font-medium text-accent-700 hover:underline"
        >
          {action.label}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}

/**
 * What a section shows when the customer has nothing in it yet.
 *
 * Every one of these is a route onward rather than an apology. Most customers
 * reading this dashboard for the first time have no orders, no saved sites
 * and no spend, and a row of zeroes with nothing to press is a dead end on
 * the page that is supposed to start them off.
 */
export function PanelEmpty({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  action?: { label: string; href: string };
}) {
  return (
    <div className="flex flex-col items-center px-5 py-10 text-center">
      <span className="inline-flex rounded-full bg-accent-50 p-3 text-accent-700">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <p className="mt-3 text-[14px] font-medium text-ink">{title}</p>
      <p className="mt-1 max-w-sm text-[13px] text-muted">{body}</p>
      {action ? (
        <Link
          href={action.href}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-accent-700"
        >
          {action.label}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}
