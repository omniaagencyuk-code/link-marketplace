import { Check, Minus, X } from 'lucide-react';

/**
 * The drawings beside /digital-pr's long read.
 *
 * CSS and SVG only. The rule the whole file is written to is the one this
 * page's own "Setting realistic expectations" section states: coverage is
 * decided by an editor and may not happen. So nothing here shows a result,
 * a ranking, a named publication or a figure presented as measured - the
 * drawings illustrate what the process is, never what it returned.
 *
 * All are `aria-hidden`, with the words beside them doing the explaining.
 */

/**
 * A brand noticed inside somebody else's article.
 *
 * Sits beside "What digital PR means here", whose point is that the link is
 * a by-product of the coverage. So the drawing is the coverage: a piece
 * somebody else wrote, with one phrase in it that happens to be you.
 */
export function NewsroomIllustration() {
  return (
    <figure className="m-0">
      <div aria-hidden="true" className="relative">
        <div className="rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)]">
          <p className="text-center font-masthead text-[1.35rem] leading-none font-black tracking-tight text-ink">
            The Daily Squawk
          </p>
          <div className="mt-2.5 border-y border-ink/15 py-1 text-center text-[9px] tracking-[0.18em] text-muted uppercase">
            Business
          </div>

          <p className="mt-4 text-[13px] leading-snug font-semibold text-ink">
            New research highlights key industry trends
          </p>

          <p className="mt-3 text-[12px] leading-relaxed text-ink-soft">
            Figures published this week point to a shift in how buyers compare suppliers.{' '}
            {/*
              The mention. Painted as a finished highlight and animated in by
              the stylesheet, not the other way round, so it is already
              highlighted if nothing ever runs.
            */}
            <span data-pp-dpr="mention">Your brand</span> was among those cited by the report&rsquo;s
            authors.
          </p>

          <div className="mt-3 space-y-1.5">
            {['w-full', 'w-11/12', 'w-full', 'w-9/12'].map((width, index) => (
              <span key={width + index} className={`block h-1.5 rounded bg-surface-sunken ${width}`} />
            ))}
          </div>
        </div>

        {/* Two more pieces, because a story that lands rarely lands once -
            which is what the page's own copy says about clusters. */}
        <div className="mt-4 grid grid-cols-2 gap-4">
          {[
            ['Tech Insight', 'Commentary'],
            ['Lifestyle Daily', 'Feature'],
          ].map(([outlet, kind]) => (
            <div
              key={outlet}
              className="rounded-[var(--radius-card)] border border-line bg-white p-3.5 shadow-[var(--shadow-card)]"
            >
              <p className="flex items-center gap-1.5 text-[11px] font-semibold text-ink">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-accent-600" />
                {outlet}
              </p>
              <div className="mt-2.5 space-y-1.5">
                {['w-full', 'w-10/12'].map((width, index) => (
                  <span
                    key={width + index}
                    className={`block h-1.5 rounded bg-surface-sunken ${width}`}
                  />
                ))}
              </div>
              <p className="mt-2.5 inline-flex rounded bg-accent-50 px-1.5 py-0.5 text-[9px] font-medium tracking-wide text-accent-800 uppercase">
                {kind}
              </p>
            </div>
          ))}
        </div>
      </div>

      <figcaption className="mt-3 text-[12px] text-muted">
        An illustration of a brand mentioned inside an article somebody else wrote. The
        publications and the story are invented for the drawing.
      </figcaption>
    </figure>
  );
}

/**
 * What a campaign can be worth, beside what it cannot promise.
 *
 * Sits beside "When digital PR is worth the extra effort". Every line here
 * is something the coverage *is* rather than something it produces: an
 * audience read it, an editor chose it, a reader may click. There is
 * deliberately no backlink, no ranking and no traffic figure, because the
 * section it illustrates is the one arguing for a thing whose return nobody
 * can promise in advance - and the last line says so in the drawing rather
 * than only in the prose.
 */
const WORTH = [
  'Brand visibility with that publication’s readers',
  'A readership that is already interested in the subject',
  'Credibility that comes from an editor choosing it',
  'Referral traffic, where readers follow it up',
];

export function CoverageIllustration() {
  return (
    <figure className="m-0">
      <div
        aria-hidden="true"
        className="rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)]"
      >
        <div className="rounded-lg border border-line bg-surface p-4">
          <p className="font-masthead text-[1.1rem] leading-none font-black tracking-tight text-ink">
            The Business Post
          </p>
          <p className="mt-2.5 text-[12px] leading-snug font-semibold text-ink">
            Industry expert shares five key trends
          </p>
          <div className="mt-2.5 space-y-1.5">
            {['w-full', 'w-10/12', 'w-full'].map((width, index) => (
              <span
                key={width + index}
                className={`block h-1.5 rounded bg-surface-sunken ${width}`}
              />
            ))}
          </div>
        </div>

        <ul data-reveal-items="" className="mt-4 space-y-2.5">
          {WORTH.map((item) => (
            <li
              key={item}
              className="flex items-start gap-2 rounded-lg border border-line bg-white px-3 py-2 text-[12px] leading-snug text-ink-soft"
            >
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-600" />
              {item}
            </li>
          ))}
        </ul>

        <p className="mt-4 border-t border-line pt-3 text-[11px] leading-snug text-muted">
          None of it is a given: an editor decides whether to publish, and some approaches do not
          land at all.
        </p>
      </div>

      <figcaption className="mt-3 text-[12px] text-muted">
        An illustration of what editorial coverage can be worth. It is not a list of outcomes we
        promise.
      </figcaption>
    </figure>
  );
}

/**
 * Digital PR beside guest posts.
 *
 * Each row restates something the section's own copy says - who decides, who
 * writes it, whether a story is needed, how long it takes, whether it is
 * certain. Which is also why the "better" column is not always the same one:
 * the page says plainly that a guest post is the better choice when there is
 * no story, so a table where digital PR wins every row would contradict the
 * paragraph above it.
 *
 * `neither` is a third state on purpose. Price is not a contest here: the
 * page's own FAQ says PR is priced per placement like other listings and
 * that campaigns are quoted individually, which is a different shape of
 * answer, not a cheaper or dearer one.
 */
const COMPARISON: { label: string; pr: string; guest: string; better: 'pr' | 'guest' | 'neither' }[] =
  [
    {
      label: 'Who decides',
      pr: 'An editor, who need not publish',
      guest: 'The site, from a slot it offers',
      better: 'guest',
    },
    {
      label: 'Control of the piece',
      pr: 'The publication frames it',
      guest: 'You commission and control it',
      better: 'guest',
    },
    {
      label: 'Needs a newsworthy angle',
      pr: 'Yes — data, expertise, a story',
      guest: 'No',
      better: 'guest',
    },
    {
      label: 'Turnaround',
      pr: 'Longer, and less certain',
      guest: 'Shown on the listing',
      better: 'guest',
    },
    {
      label: 'Certainty of publication',
      pr: 'Never guaranteed',
      guest: 'The placement is what you buy',
      better: 'guest',
    },
    {
      label: 'Brand visibility',
      pr: 'The readership matters as much as the link',
      guest: 'Mostly the link',
      better: 'pr',
    },
    {
      label: 'Harder to replicate',
      pr: 'Not available on demand',
      guest: 'A competitor can buy the same slot',
      better: 'pr',
    },
    {
      label: 'Pricing',
      pr: 'Per placement; campaigns quoted',
      guest: 'Per placement, shown upfront',
      better: 'neither',
    },
  ];

function Mark({ state }: { state: 'yes' | 'no' | 'neither' }) {
  if (state === 'neither') {
    return <Minus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-soft" aria-hidden="true" />;
  }
  return state === 'yes' ? (
    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-600" aria-hidden="true" />
  ) : (
    <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-soft" aria-hidden="true" />
  );
}

export function Comparison() {
  /*
    No minimum width and no sideways scroll: at 390px the table is cramped
    but both columns are on the screen, and a column a phone reader cannot
    see is a comparison with one side missing.
  */
  return (
    <table className="w-full border-collapse text-left">
      <caption className="sr-only">
        How digital PR and guest posts differ, drawn from the section above. Neither is better in
        every row.
      </caption>
      <thead>
        <tr>
          <th scope="col" className="w-[26%] pb-3 text-[12px] font-semibold text-muted" />
          <th
            scope="col"
            className="rounded-t-lg bg-accent-50 px-2.5 pt-3 pb-3 text-[13px] font-semibold text-accent-800 sm:px-4"
          >
            Digital PR
          </th>
          <th scope="col" className="px-2.5 pb-3 text-[13px] font-semibold text-ink sm:px-4">
            Guest posts
          </th>
        </tr>
      </thead>
      <tbody data-reveal-items="">
        {COMPARISON.map((row) => (
          <tr key={row.label} className="border-t border-line">
            <th
              scope="row"
              className="py-3 pr-2.5 text-[12px] font-medium text-ink-soft sm:pr-4 sm:text-[13px]"
            >
              {row.label}
            </th>
            <td className="bg-accent-50/60 px-2.5 py-3 text-[12px] text-ink sm:px-4 sm:text-[13px]">
              <span className="flex items-start gap-2">
                <Mark
                  state={row.better === 'neither' ? 'neither' : row.better === 'pr' ? 'yes' : 'no'}
                />
                {row.pr}
              </span>
            </td>
            <td className="px-2.5 py-3 text-[12px] text-muted sm:px-4 sm:text-[13px]">
              <span className="flex items-start gap-2">
                <Mark
                  state={
                    row.better === 'neither' ? 'neither' : row.better === 'guest' ? 'yes' : 'no'
                  }
                />
                {row.guest}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * The thing that makes this page different from the other two.
 *
 * Sits beside "Setting realistic expectations", and is the only drawing here
 * whose subject is a campaign not working. A page selling editorial coverage
 * with no picture of the outcome where nothing is published is a page a
 * customer reads once and never trusts again.
 */
export function ExpectationsIllustration() {
  return (
    <div
      aria-hidden="true"
      className="rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)]"
    >
      <p className="text-[11px] font-semibold tracking-[0.1em] text-muted uppercase">
        One campaign, several approaches
      </p>

      <ul className="mt-4 space-y-2.5">
        {(
          [
            ['Picked up', 'yes'],
            ['Picked up elsewhere, from the same story', 'yes'],
            ['Read, not used', 'no'],
            ['No reply', 'no'],
          ] as const
        ).map(([outcome, state]) => (
          <li key={outcome} className="flex items-center gap-2.5">
            <span
              className={
                state === 'yes'
                  ? 'flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-100 text-accent-700'
                  : 'flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-muted-soft'
              }
            >
              {state === 'yes' ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
            </span>
            <span
              className={
                state === 'yes' ? 'text-[12px] text-ink' : 'text-[12px] text-muted line-through'
              }
            >
              {outcome}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-4 border-t border-line pt-3 text-[11px] leading-snug text-muted">
        An illustration of how a campaign tends to go, not a success rate. We would rather say a
        story is not there than run one that quietly fails.
      </p>
    </div>
  );
}
