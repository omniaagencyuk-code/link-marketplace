import { ArrowRight, Check, FileText, Link2 } from 'lucide-react';

/**
 * The two drawings beside /content-writing's long read.
 *
 * Server-rendered CSS and SVG, no Motion: these sit below the fold, they are
 * reached by scrolling rather than on load, and the page's own `Reveal`
 * already decides when something below the fold arrives. Motion is for the
 * hero's sequence, which has four stages and a timeline; a card fading up
 * does not need a library.
 *
 * Neither drawing shows a result. There is no ranking, no traffic figure and
 * no score, because this page sells writing rather than an outcome and the
 * copy beside each drawing is careful about the difference.
 */

/**
 * An article and the page it points at.
 *
 * Sits beside "Content and link building work better together", whose
 * argument is that a link is wasted on a page that cannot hold a ranking.
 * So the drawing is both halves: the article going out, and the page it
 * lands on - with the second one's own content drawn in, because that is the
 * part the section says people forget.
 */
export function ContentAndLinks() {
  return (
    <div
      aria-hidden="true"
      className="rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)]"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
        {/* The article */}
        <div className="rounded-lg border border-line bg-surface p-3">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold text-ink">
            <FileText className="h-3 w-3 text-accent-700" />
            The article
          </p>
          <div className="mt-2.5 space-y-1.5">
            {['w-full', 'w-10/12', 'w-full'].map((width, index) => (
              <span key={width + index} className={`block h-1.5 rounded bg-surface-sunken ${width}`} />
            ))}
            <span className="mt-1 inline-flex rounded bg-accent-100 px-1 py-0.5 text-[9px] font-medium text-accent-800">
              your link
            </span>
          </div>
        </div>

        <ArrowRight className="h-4 w-4 shrink-0 text-accent-600" />

        {/* The page it points at */}
        <div className="rounded-lg border border-accent-200 bg-accent-50/60 p-3">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold text-ink">
            <Link2 className="h-3 w-3 text-accent-700" />
            The page it lands on
          </p>
          <div className="mt-2.5 space-y-1.5">
            {['w-full', 'w-11/12', 'w-full', 'w-9/12'].map((width, index) => (
              <span key={width + index} className={`block h-1.5 rounded bg-white ${width}`} />
            ))}
          </div>
        </div>
      </div>

      <p className="mt-4 border-t border-line pt-3 text-[11px] leading-snug text-muted">
        A link is only worth what the page it points at can hold. Briefing both against the same
        keyword is what keeps the two from being written past each other.
      </p>
    </div>
  );
}

/**
 * What a brief turns into.
 *
 * Sits beside "What good SEO content looks like now", whose point is that
 * coverage of a subject beats keyword density. So the checks are about
 * coverage - the follow-up questions, the comparisons, the caveats - rather
 * than about counting a phrase, and there is no score, because a number
 * against an invented article is a measurement of nothing.
 */
const COVERAGE = [
  'The main question, answered first',
  'The follow-up questions a reader will have',
  'The comparisons they are weighing up',
  'The caveats an expert would mention',
] as const;

export function ArticleQuality() {
  return (
    <figure className="m-0">
      <div
        aria-hidden="true"
        className="rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)]"
      >
        <div className="overflow-hidden rounded-lg border border-line">
          <div className="flex items-center gap-1.5 border-b border-line bg-surface px-3 py-2">
            <span className="h-2 w-2 rounded-full bg-coral-200" />
            <span className="h-2 w-2 rounded-full bg-sun-400/70" />
            <span className="h-2 w-2 rounded-full bg-accent-300" />
          </div>
          <div className="p-3.5">
            <p className="text-[12px] leading-snug font-semibold text-ink">
              The Complete Guide to Home Workouts
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-ink-soft">
              <span
                data-pp-highlight=""
                className="rounded px-0.5 text-[11px] font-medium text-accent-800"
              >
                Home workouts
              </span>{' '}
              are a flexible way to stay fit without a gym membership.
            </p>
            <div className="mt-2.5 space-y-1.5">
              {['w-full', 'w-10/12', 'w-full', 'w-8/12'].map((width, index) => (
                <span
                  key={width + index}
                  className={`block h-1.5 rounded bg-surface-sunken ${width}`}
                />
              ))}
            </div>
          </div>
        </div>

        <p className="mt-4 text-[11px] font-semibold tracking-[0.1em] text-muted uppercase">
          Briefed to cover
        </p>
        <ul data-reveal-items="" className="mt-2.5 space-y-2">
          {COVERAGE.map((item) => (
            <li key={item} className="flex items-start gap-2 text-[11px] leading-snug text-ink-soft">
              <Check className="mt-0.5 h-3 w-3 shrink-0 text-accent-600" />
              {item}
            </li>
          ))}
        </ul>
      </div>

      <figcaption className="mt-3 text-[12px] text-muted">
        An illustration of what a brief asks an article to cover. The article is an example, and
        nothing here is a ranking or a score.
      </figcaption>
    </figure>
  );
}
