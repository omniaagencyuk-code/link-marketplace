import { BarChart3, Check, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/**
 * A link being inserted into an article that already exists.
 *
 * The page's whole argument in one picture: the article was there, it was
 * indexed, somebody was reading it, and now one sentence in it carries a
 * link. Explaining that in prose takes a paragraph - which the page also
 * has, below - and showing it takes four seconds.
 *
 * ## It is a drawing, not a claim
 *
 * The article, its title and its paragraphs are invented and obviously so:
 * a home workouts piece with filler text. That is deliberate. The
 * alternative - a real publisher's article with real figures beside it -
 * would be showing inventory we have not been given permission to show, and
 * putting numbers on it that nobody measured. The figures here are labelled
 * as an example in the caption and the whole illustration is hidden from
 * assistive technology, because a screen reader reading a fake article is
 * being given work rather than information.
 *
 * ## No JavaScript
 *
 * Every stage is a CSS animation with `both` fill on one timeline. The text
 * is in the markup from the first byte and the anchor is styled as a link
 * whether or not anything runs, so a reader who never sees the sequence sees
 * the finished state rather than an empty frame. See `globals.css`.
 *
 * On a phone the sequence is the highlight and the confirmation. The two
 * floating cards are `hidden` until there is room for them, which is also
 * what stops them animating - a card sliding in over a 390px-wide article
 * would be movement for its own sake.
 */
export function ArticleDemo({ className }: { className?: string }) {
  return (
    <figure className={cn('m-0', className)}>
      <div aria-hidden="true" className="relative">
        {/* The article window */}
        <div className="overflow-hidden rounded-xl border border-line bg-white shadow-[var(--shadow-pop)]">
          {/* Browser chrome */}
          <div className="flex items-center gap-1.5 border-b border-line bg-surface px-4 py-3">
            <span className="h-2.5 w-2.5 rounded-full bg-coral-200" />
            <span className="h-2.5 w-2.5 rounded-full bg-sun-400/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-accent-300" />
          </div>

          <div className="p-5 sm:p-6">
            <h3 className="text-[15px] leading-snug font-semibold text-ink sm:text-[17px]">
              The Complete Guide to Home Workouts for a Healthier Lifestyle
            </h3>

            <div className="mt-4 space-y-2">
              <span className="block h-2 w-full rounded bg-surface-sunken" />
              <span className="block h-2 w-11/12 rounded bg-surface-sunken" />
            </div>

            <p className="mt-4 text-[13px] leading-relaxed text-ink-soft">
              Regular exercise is one of the most effective ways to improve your physical and
              mental health. Many people now choose{' '}
              {/*
                The anchor. The stylesheet paints it as a finished link and
                animates the properties in from nothing - not the other way
                round, so it is already a link if nothing ever runs.
              */}
              <span data-pp-ne="anchor">resistance bands</span>{' '}
              for their versatility and ease of use, and they work well for strength training,
              mobility and rehabilitation alike.
            </p>

            <div className="mt-4 space-y-2">
              <span className="block h-2 w-full rounded bg-surface-sunken" />
              <span className="block h-2 w-10/12 rounded bg-surface-sunken" />
              <span className="block h-2 w-full rounded bg-surface-sunken" />
            </div>
          </div>
        </div>

        {/*
          "Link inserted".

          Over the top edge of the window rather than over the paragraph: a
          confirmation sitting on the sentence hides the one sentence the
          whole illustration is about.

          The centring is on the wrapper and the entrance on the child: the
          pop sets `transform`, and an element doing both at once depends on
          how the CSS framework happens to emit its centring that week.
        */}
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <div
            data-pp-ne="toast"
            className="flex items-center gap-1.5 rounded-lg bg-accent-700 px-3 py-2 text-[12px] font-semibold whitespace-nowrap text-white shadow-[var(--shadow-pop)]"
          >
            <Check className="h-3.5 w-3.5" />
            Link inserted
          </div>
        </div>

        {/* The page's metrics, as an example */}
        <div
          data-pp-ne="metrics"
          className="absolute -top-5 -right-3 hidden w-44 rounded-xl border border-line bg-white p-3.5 shadow-[var(--shadow-pop)] sm:block"
        >
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-ink">
            <BarChart3 className="h-3 w-3 text-accent-700" />
            Page metrics
          </p>
          <dl className="mt-2.5 space-y-1.5 text-[11px]">
            {[
              ['Domain Rating', '72'],
              ['Organic traffic', '48K'],
              ['Keywords', '3.1K'],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-2">
                <dt className="text-muted">{label}</dt>
                <dd className="tabular font-semibold text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* What made it the right page */}
        <div
          data-pp-ne="checks"
          className="absolute -right-2 -bottom-6 hidden w-52 rounded-xl border border-line bg-white p-3.5 shadow-[var(--shadow-pop)] lg:block"
        >
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-ink">
            <Link2 className="h-3 w-3 text-accent-700" />
            Relevant placement
          </p>
          <ul className="mt-2.5 space-y-1.5">
            {['In existing content', 'Natural and contextual', 'On an indexed page'].map((item) => (
              <li key={item} className="flex items-center gap-1.5 text-[11px] text-muted">
                <Check className="h-3 w-3 shrink-0 text-accent-600" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <figcaption className="mt-4 text-[12px] text-muted sm:mt-6">
        An illustration of a niche edit: an existing article, with a link added to a sentence
        that was already there. The article and its figures are an example, not a listing.
      </figcaption>
    </figure>
  );
}
