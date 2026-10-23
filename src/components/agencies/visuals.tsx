import {
  Bookmark,
  Check,
  FileText,
  Inbox,
  ListChecks,
  Mail,
  PoundSterling,
  Receipt,
  ShoppingCart,
  Table2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * The drawings beside /link-building-agencies' long read.
 *
 * Plain markup, and `Reveal` decides when each one arrives: these are below
 * the fold, where an entrance that had already happened by the time somebody
 * scrolled to it would be no entrance at all. The hero's board is the only
 * drawing on the page with a timeline of its own, and that one is CSS too -
 * nothing on this page is drawn by a script.
 *
 * ## The rule every one of them is written to
 *
 * This page's own FAQs say, in as many words, that user seats, per-client
 * workspaces, white-label reporting and client-facing reporting are on the
 * roadmap rather than live. So **no drawing here may show one.** The failure
 * mode of a redesign on an agency page is not a lost paragraph - it is a
 * screenshot of a feature the paragraph underneath it denies, which no type
 * check and no build will catch.
 *
 * What the drawings show instead is what an agency genuinely does today, all
 * of it reachable from the dashboard: one marketplace, a shortlist it can
 * save, orders it can place, a queue it can track, content it can brief, and
 * one invoice at the end.
 */

/** A capability, and the screen it is on. */
interface Capability {
  icon: LucideIcon;
  label: string;
  /** The dashboard route that does it. Asserted by `verify:agencies`. */
  href: string;
}

/**
 * What the platform does for an agency today.
 *
 * Each one names the screen it happens on, which is what keeps the list
 * honest: an entry nobody can reach is an entry with nowhere to point, and
 * the suite checks every `href` here against the routes that exist.
 */
export const CAPABILITIES: Capability[] = [
  { icon: Table2, label: 'One marketplace for every client', href: '/marketplace' },
  { icon: Bookmark, label: 'Save and shortlist websites', href: '/dashboard/saved' },
  { icon: ShoppingCart, label: 'Place orders across campaigns', href: '/dashboard/orders' },
  { icon: Inbox, label: 'Track every placement to a live URL', href: '/dashboard/orders' },
  { icon: FileText, label: 'Brief content in the same account', href: '/dashboard/content' },
  { icon: ListChecks, label: 'Plan a campaign per client site', href: '/dashboard/planner' },
  { icon: Receipt, label: 'One account, one invoice', href: '/dashboard/billing' },
];

/**
 * The spreadsheet and the inbox, which is the section's own argument.
 *
 * "Why link building breaks down at agency scale" describes a spreadsheet, a
 * shared inbox and a quiet dependency on whoever remembers which supplier
 * quoted what. So that is what is drawn - the problem, not the product.
 */
export function ScaleProblem() {
  return (
    <div
      aria-hidden="true"
      className="rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)]"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {/* A spreadsheet per client */}
        <div className="rounded-lg border border-line bg-surface p-3">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold text-ink">
            <Table2 className="h-3 w-3 text-muted" />
            clients-q3-final-v4.xlsx
          </p>
          <div className="mt-2.5 space-y-1">
            {[0, 1, 2, 3].map((row) => (
              <span key={row} className="flex gap-1">
                {['w-1/3', 'w-1/4', 'w-1/5'].map((width, index) => (
                  <span
                    key={width + index}
                    className={`block h-1.5 rounded-sm bg-surface-sunken ${width}`}
                  />
                ))}
              </span>
            ))}
          </div>
        </div>

        {/* And a thread per supplier */}
        <div className="rounded-lg border border-line bg-surface p-3">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold text-ink">
            <Mail className="h-3 w-3 text-muted" />
            Re: pricing — can you confirm?
          </p>
          <div className="mt-2.5 space-y-2">
            {['w-full', 'w-10/12', 'w-11/12'].map((width, index) => (
              <span key={width + index} className="flex items-start gap-1.5">
                <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-surface-sunken" />
                <span className={`block h-1.5 rounded bg-surface-sunken ${width}`} />
              </span>
            ))}
          </div>
        </div>
      </div>

      <p className="mt-4 border-t border-line pt-3 text-[11px] leading-snug text-muted">
        A shortlist, an anchor sheet and a price that moved between quotes, per client — and a
        thread somewhere that has the answer.
      </p>
    </div>
  );
}

/**
 * What the platform does, with the screen each thing is on.
 *
 * Also the honest replacement for the mockup's "Trusted by agencies
 * worldwide" row of logos. There are no logos we have permission to show
 * and no testimonials anybody gave, so a row of either would be invented -
 * and the thing it would be standing in for, a reason to believe, is better
 * served by a list of what the software does that a reader can go and check.
 */
export function CapabilityPanel() {
  return (
    <div
      aria-hidden="true"
      className="rounded-[var(--radius-card)] border border-line bg-white p-6 shadow-[var(--shadow-card)]"
    >
      <p className="text-[11px] font-semibold tracking-[0.1em] text-muted uppercase">
        What an agency can do here today
      </p>
      <ul data-reveal-items="" className="mt-4 space-y-2.5">
        {CAPABILITIES.map((item) => (
          <li key={item.label} className="flex items-start gap-2.5 text-[13px] text-ink-soft">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-100 text-accent-700">
              <Check className="h-3 w-3" />
            </span>
            {item.label}
          </li>
        ))}
      </ul>
      <p className="mt-4 border-t border-line pt-3 text-[11px] leading-snug text-muted">
        Every one of these is a screen in the dashboard. What is not here yet is listed as not here
        yet, further down.
      </p>
    </div>
  );
}

/**
 * Content ordered alongside placements.
 *
 * Beside "Content production alongside placements", whose point is that one
 * account covers both halves of the job.
 */
export function ContentAlongside() {
  return (
    <div
      aria-hidden="true"
      className="rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)]"
    >
      <div className="space-y-3">
        {[
          { icon: FileText, label: 'Article briefed', note: 'Keyword and target page' },
          { icon: ShoppingCart, label: 'Placement ordered', note: 'From the same marketplace' },
          { icon: Inbox, label: 'Tracked to a live URL', note: 'In one order queue' },
        ].map((step, index) => (
          <div key={step.label} className="flex items-start gap-3">
            <span className="flex flex-col items-center">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-accent-100 bg-accent-50 text-accent-700">
                <step.icon className="h-3.5 w-3.5" />
              </span>
              {index < 2 ? <span className="mt-1 h-5 w-px bg-line" /> : null}
            </span>
            <span className="pt-1.5">
              <span className="block text-[12px] font-semibold text-ink">{step.label}</span>
              <span className="block text-[11px] text-muted">{step.note}</span>
            </span>
          </div>
        ))}
      </div>

      <p className="mt-4 border-t border-line pt-3 text-[11px] leading-snug text-muted">
        One supplier relationship for both halves, and the brief, the draft and the placement in
        one place.
      </p>
    </div>
  );
}

/**
 * What is live and what is not.
 *
 * Beside "What we are building next for agencies", which is the one section
 * on the page that exists to say what is missing. A drawing that softened
 * that would be worse than no drawing, so this one is a plain two-column
 * list and the right-hand column is deliberately the longer read.
 */
export const LIVE = [
  'One marketplace across every client',
  'Saved shortlists',
  'Orders and live URLs in one queue',
  'Content briefed in the same account',
  'One invoice',
];

export const NOT_YET = [
  'Per-client workspaces',
  'User seats for your team',
  'Client-facing reporting',
  'White-label reports',
];

export function RoadmapPanel() {
  return (
    <div
      aria-hidden="true"
      className="rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)]"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.1em] text-accent-700 uppercase">
            Live today
          </p>
          <ul data-pp-roadmap="live" className="mt-3 space-y-2">
            {LIVE.map((item) => (
              <li key={item} className="flex items-start gap-2 text-[12px] leading-snug text-ink-soft">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-600" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="border-t border-line pt-5 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-5">
          <p className="text-[11px] font-semibold tracking-[0.1em] text-muted uppercase">
            On the roadmap
          </p>
          <ul data-pp-roadmap="not-yet" className="mt-3 space-y-2">
            {NOT_YET.map((item) => (
              <li key={item} className="flex items-start gap-2 text-[12px] leading-snug text-muted">
                <span className="mt-1.5 h-1 w-3 shrink-0 rounded-full bg-line-strong" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Named rather than placed. "The right-hand column" was true at
          1440 and false at 390, where the two lists stack - a caption that
          describes the layout stops being true the first time the layout
          changes. */}
      <p className="mt-4 border-t border-line pt-3 text-[11px] leading-snug text-muted">
        What is on the roadmap is not a preview of it. It is what does not exist yet, kept on the
        page so nobody finds out after signing up.
      </p>
    </div>
  );
}

/**
 * The agency pricing band's drawing.
 *
 * No tiers. The brief that asked for this page asked specifically for no
 * Basic/Pro/Enterprise, and /pricing already says what is genuinely on offer
 * - preferential rates for eligible repeat buyers, custom quotes for larger
 * campaigns, flexible arrangements - which is a conversation rather than a
 * table. So the drawing is the conversation: a quote being asked for and
 * answered, with nothing in it that commits a number.
 */
export function PricingConversation() {
  return (
    <div
      aria-hidden="true"
      className="rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)]"
    >
      <div className="space-y-3">
        <div className="max-w-[85%] rounded-lg rounded-bl-sm border border-line bg-surface p-3">
          <p className="text-[11px] leading-snug text-ink-soft">
            We are placing around forty links a month across six client sites. What can you do on
            rates?
          </p>
        </div>

        <div className="ml-auto max-w-[85%] rounded-lg rounded-br-sm border border-accent-200 bg-accent-50 p-3">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold text-accent-800">
            <PoundSterling className="h-3 w-3" />
            Press Parrot
          </p>
          <p className="mt-1.5 text-[11px] leading-snug text-ink-soft">
            Tell us the niches and the volume and we will come back with terms. No tiers and no
            minimum — it depends what you are buying.
          </p>
        </div>
      </div>

      <p className="mt-4 border-t border-line pt-3 text-[11px] leading-snug text-muted">
        An illustration of the conversation, not a quote. What is on offer is listed on the pricing
        page.
      </p>
    </div>
  );
}
