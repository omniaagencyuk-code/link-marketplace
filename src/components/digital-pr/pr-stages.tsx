import { FileSearch, Send, ShieldQuestion, Telescope } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * What a digital PR campaign involves, in four stages.
 *
 * Deliberately **not** `OrderSteps`, which /link-building and /niche-edits
 * both draw. Those four are how you buy a placement from the marketplace:
 * filter, choose, order, track to a live URL. These four are how a campaign
 * runs, and this page's own copy is explicit that the two are different
 * things - "Digital PR is a campaign rather than a single order". Drawing
 * the marketplace's four here would be the page contradicting its own
 * paragraph.
 *
 * ## What it does not claim
 *
 * Nothing here describes software. There is no outreach tool, no pitch
 * tracker and no automated coverage report in this codebase, so the stages
 * are written as what the work is rather than as features - the difference
 * between "we research publications and angles" and "our platform finds
 * journalists for you", and only the first is true.
 *
 * The third stage carries the whole honest point of the page: an editor
 * decides. It is the stage a marketing diagram normally calls "Get
 * published", and calling it that here would promise the one thing
 * "Setting realistic expectations" exists to say we cannot.
 */
export const PR_STAGES: { icon: LucideIcon; label: string; body: string }[] = [
  {
    icon: FileSearch,
    label: 'Research and strategy',
    body: 'Which publications cover your market, and what in your business is worth their readers’ time.',
  },
  {
    icon: Send,
    label: 'Outreach and pitching',
    body: 'The story or the expert goes to the journalists and editors it actually suits.',
  },
  {
    icon: ShieldQuestion,
    label: 'Editorial consideration',
    body: 'An editor decides. Some approaches are published, some are read and not used, some get no reply.',
  },
  {
    icon: Telescope,
    label: 'Tracking and reporting',
    body: 'What was published, where, and how it was framed — including the approaches that went nowhere.',
  },
];

/**
 * The band itself, without its heading, so the page decides how it arrives.
 *
 * The connecting line is an SVG rather than a border because it draws itself
 * when scrolled to, through the same `data-pp-draw` attribute /niche-edits'
 * trend line uses. It is only drawn where the stages are side by side -
 * stacked on a phone, a horizontal line between them points at nothing.
 */
export function PrStages() {
  return (
    <div className="relative">
      <svg
        aria-hidden="true"
        viewBox="0 0 1000 2"
        preserveAspectRatio="none"
        className="absolute top-6 right-[12.5%] left-[12.5%] hidden h-px w-[75%] lg:block"
      >
        <line
          data-pp-draw=""
          style={{ '--pp-draw-length': '1000' } as React.CSSProperties}
          x1="0"
          y1="1"
          x2="1000"
          y2="1"
          stroke="var(--color-accent-300)"
          strokeWidth="2"
        />
      </svg>

      <ol data-reveal-items="" className="relative grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {PR_STAGES.map((stage, index) => (
          <li key={stage.label} className="text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-accent-100 bg-white text-accent-700 shadow-[var(--shadow-card)]">
              <stage.icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <p className="mt-4 text-[11px] font-semibold tracking-[0.1em] text-muted uppercase">
              Stage {index + 1}
            </p>
            <p className="mt-1 text-[15px] font-semibold text-ink">{stage.label}</p>
            <p className="mx-auto mt-2 max-w-[22rem] text-[13px] leading-relaxed text-muted">
              {stage.body}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}
