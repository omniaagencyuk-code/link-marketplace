import { ArrowRight, BarChart3, Check, Globe, Link2, Search } from 'lucide-react';

/**
 * Interface-shaped drawings for the long read.
 *
 * Every one of these is CSS and SVG: no photography, no screenshots, no
 * images to download. They are illustrations of the product's own furniture -
 * a metrics panel, a filtered list, a link sitting in a paragraph - so the
 * page has something to look at between sections without claiming anything.
 *
 * Nothing here carries a figure that is not already on the page or already
 * true of the interface. They are `aria-hidden`: the words beside them say
 * what they say, and a screen reader reading a decorative chart is being
 * given work rather than information.
 */

/** The admin work a link costs before it exists: a checklist, half done. */
export function CoordinationVisual() {
  const steps = [
    { label: 'Find relevant sites', done: true },
    { label: 'Check the traffic is real', done: true },
    { label: 'Track down an editor', done: true },
    { label: 'Agree a price', done: false },
    { label: 'Write something publishable', done: false },
    { label: 'Chase, record, reconcile', done: false },
  ];

  return (
    <div
      aria-hidden="true"
      className="rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)]"
    >
      <p className="text-[11px] font-semibold tracking-[0.1em] text-muted uppercase">
        One placement
      </p>
      <ul className="mt-4 space-y-2.5">
        {steps.map((step) => (
          <li key={step.label} className="flex items-center gap-2.5">
            <span
              className={
                step.done
                  ? 'flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-100 text-accent-700'
                  : 'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-dashed border-line-strong text-muted-soft'
              }
            >
              {step.done ? <Check className="h-3 w-3" /> : null}
            </span>
            <span
              className={
                step.done ? 'text-[13px] text-ink-soft line-through' : 'text-[13px] text-muted'
              }
            >
              {step.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** What a listing shows before you commit: the three metrics, as a panel. */
export function MetricsVisual() {
  const metrics = [
    { icon: BarChart3, label: 'Domain Rating', bar: '72%' },
    { icon: Globe, label: 'Organic Traffic', bar: '58%' },
    { icon: Link2, label: 'Referring Domains', bar: '44%' },
  ];

  return (
    <div
      aria-hidden="true"
      className="rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)]"
    >
      <div className="flex items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 py-2">
        <Search className="h-3.5 w-3.5 text-muted" />
        <span className="text-[12px] text-muted">Filter the inventory</span>
      </div>

      <ul className="mt-4 space-y-4">
        {metrics.map((metric) => (
          <li key={metric.label}>
            <div className="flex items-center gap-2 text-[12px] font-medium text-ink-soft">
              <metric.icon className="h-3.5 w-3.5 text-accent-700" />
              {metric.label}
            </div>
            {/* A proportion, not a measurement: there is no number beside it
                and none implied. It is a slider, drawn. */}
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-sunken">
              <div className="h-full rounded-full bg-accent-500" style={{ width: metric.bar }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Where a good link sits: inside the sentence, not in the furniture. */
export function PlacementVisual() {
  return (
    <div
      aria-hidden="true"
      className="rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)]"
    >
      <div className="space-y-2">
        <div className="h-2 w-3/4 rounded bg-surface-sunken" />
        <div className="h-2 w-full rounded bg-surface-sunken" />
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-16 rounded bg-surface-sunken" />
          <span className="rounded bg-accent-100 px-1.5 py-0.5 text-[10px] font-semibold text-accent-800">
            your anchor
          </span>
          <div className="h-2 w-10 rounded bg-surface-sunken" />
        </div>
        <div className="h-2 w-5/6 rounded bg-surface-sunken" />
      </div>

      <div className="mt-5 flex items-center gap-2 border-t border-line pt-4 text-[11px] text-muted">
        <Check className="h-3.5 w-3.5 text-accent-700" />
        In the body of the article
      </div>
      <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-soft">
        <span className="h-3.5 w-3.5 rounded-full border border-dashed border-line-strong" />
        Not the footer, not an author box
      </div>
    </div>
  );
}

/** A profile spread across pages rather than pointed at one. */
export function ProfileVisual() {
  const pages = [
    { label: '/guides', width: 'w-full' },
    { label: '/compare', width: 'w-4/5' },
    { label: '/pricing', width: 'w-3/5' },
    { label: '/blog', width: 'w-2/5' },
  ];

  return (
    <div
      aria-hidden="true"
      className="rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)]"
    >
      <p className="text-[11px] font-semibold tracking-[0.1em] text-muted uppercase">
        Links by page
      </p>
      <ul className="mt-4 space-y-3">
        {pages.map((page) => (
          <li key={page.label} className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-[11px] text-ink-soft">{page.label}</span>
            <span className={`h-2 rounded-full bg-accent-400/70 ${page.width}`} />
          </li>
        ))}
      </ul>
      <p className="mt-4 flex items-center gap-1.5 border-t border-line pt-3 text-[11px] text-muted">
        <ArrowRight className="h-3 w-3 text-accent-700" />
        Steady, across pages, varied anchors
      </p>
    </div>
  );
}

/** The four visuals, in the order the body sections use them. */
export const BODY_VISUALS = [
  CoordinationVisual,
  MetricsVisual,
  PlacementVisual,
  null,
  ProfileVisual,
] as const;
