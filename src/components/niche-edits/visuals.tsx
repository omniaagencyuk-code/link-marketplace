import { Check, X } from 'lucide-react';

/**
 * The drawings beside the long read.
 *
 * CSS and SVG only - no photography, no screenshots, nothing to download.
 * Each one illustrates the section it sits beside and none of them carries a
 * figure presented as a measurement: where numbers appear they are labelled
 * as an example, because a publisher's real metrics are inventory and a made
 * up one dressed as real is a claim.
 *
 * All are `aria-hidden` with the words beside them doing the explaining.
 */

/** The same paragraph, before and after a link is added to it. */
export function BeforeAfter() {
  const lines = ['w-full', 'w-11/12', 'w-full', 'w-9/12'];

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {(['before', 'after'] as const).map((state) => (
        <div
          key={state}
          aria-hidden="true"
          className="rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)]"
        >
          <span
            className={
              state === 'after'
                ? 'inline-flex rounded bg-accent-100 px-2 py-0.5 text-[10px] font-semibold tracking-[0.1em] text-accent-800 uppercase'
                : 'inline-flex rounded bg-surface-sunken px-2 py-0.5 text-[10px] font-semibold tracking-[0.1em] text-muted uppercase'
            }
          >
            {state}
          </span>

          <p className="mt-4 text-[13px] leading-snug font-semibold text-ink">
            The Complete Guide to Home Workouts
          </p>

          <div className="mt-3 space-y-2">
            {lines.map((width, index) => (
              <span key={width + index} className={`block h-2 rounded bg-surface-sunken ${width}`} />
            ))}

            {/*
              The only difference between the two cards, which is the whole
              point of showing them side by side: one sentence now carries a
              link, and nothing else about the page has changed.
            */}
            {state === 'after' ? (
              <span className="flex items-center gap-1.5 pt-1">
                <span className="block h-2 w-10 rounded bg-surface-sunken" />
                <span className="rounded bg-accent-100 px-1.5 py-0.5 text-[10px] font-medium text-accent-800 underline decoration-accent-400 underline-offset-2">
                  resistance bands
                </span>
                <span className="block h-2 w-8 rounded bg-surface-sunken" />
              </span>
            ) : (
              <span className="flex items-center gap-1.5 pt-1">
                <span className="block h-2 w-10 rounded bg-surface-sunken" />
                <span className="block h-2 w-20 rounded bg-surface-sunken" />
                <span className="block h-2 w-8 rounded bg-surface-sunken" />
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Niche edits beside guest posts.
 *
 * Every row restates something the section's own copy says - the article
 * already exists, the turnaround is shorter, a guest post gives control of
 * the whole piece, the page is established - rather than introducing a claim
 * the page does not make. There is no row about rankings, and the cost row
 * carries the FAQ's qualifier rather than the FAQ's answer stripped of it.
 */
const COMPARISON: { label: string; edit: string; post: string; editWins: boolean }[] = [
  {
    label: 'The article',
    edit: 'Already published',
    post: 'Written for the placement',
    editWins: true,
  },
  {
    label: 'The page carrying it',
    edit: 'Already indexed',
    post: 'Starts from new',
    editWins: true,
  },
  {
    label: 'Turnaround',
    edit: 'Usually shorter',
    post: 'Includes writing and approval',
    editWins: true,
  },
  {
    label: 'Control of the piece',
    edit: 'The sentence already exists',
    post: 'You shape the whole article',
    editWins: false,
  },
  {
    label: 'Anchor',
    edit: 'Has to fit the sentence',
    post: 'Written alongside the copy',
    editWins: false,
  },
  {
    label: 'Price',
    edit: 'Often lower, per listing',
    post: 'Includes the article',
    editWins: true,
  },
];

export function Comparison() {
  /*
    No minimum width and no sideways scroll: at 390px the table is cramped
    but both columns are on the screen, and a column a phone reader cannot
    see is a comparison with one side missing - they would have to notice a
    scrollbar inside the page to find it.
  */
  return (
    <table className="w-full border-collapse text-left">
      <caption className="sr-only">
        How niche edits and guest posts differ, drawn from the section above.
      </caption>
      <thead>
        <tr>
          <th scope="col" className="w-[28%] pb-3 text-[12px] font-semibold text-muted" />
          <th
            scope="col"
            className="rounded-t-lg bg-accent-50 px-2.5 pt-3 pb-3 text-[13px] font-semibold text-accent-800 sm:px-4"
          >
            Niche edits
          </th>
          <th scope="col" className="px-2.5 pb-3 text-[13px] font-semibold text-ink sm:px-4">
            Guest posts
          </th>
        </tr>
      </thead>
      <tbody data-reveal-items="">
        {COMPARISON.map((row) => (
          <tr key={row.label} className="border-t border-line">
            <th scope="row" className="py-3 pr-2.5 text-[12px] font-medium text-ink-soft sm:pr-4 sm:text-[13px]">
              {row.label}
            </th>
            <td className="bg-accent-50/60 px-2.5 py-3 text-[12px] text-ink sm:px-4 sm:text-[13px]">
              <span className="flex items-start gap-2">
                {row.editWins ? (
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-600" aria-hidden="true" />
                ) : (
                  <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-soft" aria-hidden="true" />
                )}
                {row.edit}
              </span>
            </td>
            <td className="px-2.5 py-3 text-[12px] text-muted sm:px-4 sm:text-[13px]">
              <span className="flex items-start gap-2">
                {row.editWins ? (
                  <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-soft" aria-hidden="true" />
                ) : (
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-600" aria-hidden="true" />
                )}
                {row.post}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * What a listing shows about the host page, with the trend line drawing
 * itself once when it is scrolled to.
 *
 * The figures are an example and the caption says so. The line is an SVG
 * path with its own length in a custom property, so the dash animation has
 * something exact to count down from rather than a guess. 282 is the figure
 * the browser returns for `getTotalLength()` on that path and the sum of its
 * six segments; a guess above it spends the start of the animation drawing
 * nothing, and one below it leaves a sliver showing before it begins.
 */
export function MetricsIllustration() {
  return (
    <figure className="m-0">
      <div
        aria-hidden="true"
        className="rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)]"
      >
        <p className="text-[11px] font-semibold tracking-[0.1em] text-muted uppercase">
          The host page
        </p>

        <div className="mt-4 grid grid-cols-3 gap-3">
          {[
            ['DR', '72'],
            ['Traffic', '48K'],
            ['Keywords', '3.1K'],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-surface p-3">
              <p className="text-[10px] tracking-wide text-muted uppercase">{label}</p>
              <p className="tabular mt-1 text-[16px] font-semibold text-ink">{value}</p>
            </div>
          ))}
        </div>

        <div className="mt-5">
          <p className="text-[11px] text-muted">Organic traffic, last 12 months</p>
          <svg viewBox="0 0 300 70" className="mt-2 h-16 w-full" role="presentation">
            <path
              data-pp-draw=""
              style={{ '--pp-draw-length': '282' } as React.CSSProperties}
              d="M4 58 L50 52 L96 54 L142 40 L188 34 L234 22 L280 10"
              fill="none"
              stroke="var(--color-accent-500)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <ul className="mt-4 space-y-2 border-t border-line pt-4">
          {[
            'Relevant to the page you are linking to',
            'Indexed, with traffic of its own',
            'Few commercial outbound links already',
          ].map((item) => (
            <li key={item} className="flex items-start gap-2 text-[11px] leading-snug text-muted">
              <Check className="mt-0.5 h-3 w-3 shrink-0 text-accent-600" />
              {item}
            </li>
          ))}
        </ul>
      </div>

      <figcaption className="mt-3 text-[12px] text-muted">
        An illustration of the figures a listing shows about a host page. The values are an
        example, not a publisher&rsquo;s.
      </figcaption>
    </figure>
  );
}

/**
 * The anchor, inside the sentence it has to fit.
 *
 * The section beside this one makes a specific point - the wording already
 * exists, so the anchor bends to the sentence rather than the sentence to
 * the anchor - and the drawing is that sentence with two of its phrases
 * marked: the one that fits, and the one that would not.
 */
export function AnchorIllustration() {
  return (
    <div
      aria-hidden="true"
      className="rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)]"
    >
      <p className="text-[11px] font-semibold tracking-[0.1em] text-muted uppercase">
        The sentence that is already there
      </p>

      <p className="mt-4 text-[13px] leading-relaxed text-ink-soft">
        Many people now choose{' '}
        <span className="rounded bg-accent-100 px-1 py-0.5 font-medium text-accent-800 underline decoration-accent-400 underline-offset-2">
          resistance bands
        </span>{' '}
        for their versatility and ease of use.
      </p>

      <div className="mt-5 space-y-2.5 border-t border-line pt-4">
        <p className="flex items-start gap-2 text-[11px] leading-snug text-muted">
          <Check className="mt-0.5 h-3 w-3 shrink-0 text-accent-600" />
          Reads as part of the sentence
        </p>
        <p className="flex items-start gap-2 text-[11px] leading-snug text-muted-soft">
          <X className="mt-0.5 h-3 w-3 shrink-0" />
          <span>
            <span className="line-through">best resistance bands uk cheap</span> — bolted into
            wording that does not want it
          </span>
        </p>
      </div>
    </div>
  );
}
