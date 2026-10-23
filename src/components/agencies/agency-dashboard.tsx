import { Search } from 'lucide-react';
import { OrderStatusBadge } from '@/components/shared/status-badge';
import { acceptedNicheLabel } from '@/lib/config/accepted-niches';
import { currencySymbol } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import type { OrderStatus } from '@/lib/types';

/**
 * A board of client campaigns, drawn.
 *
 * The hero's picture of the problem this page is about: one agency, several
 * clients, each with its own shortlist, its own spend and its own progress.
 *
 * ## Why this one is CSS and not Motion
 *
 * /content-writing's editor uses Motion because its overlays arrive on top
 * of an article that is already finished - the brief card, the retracting
 * cover, the review notice. Nothing it hides carries a word the page needs,
 * which is what makes a visit with no JavaScript a finished article rather
 * than an empty box.
 *
 * This drawing is the other shape. The words *are* the drawing - five
 * clients, their niches, their link counts and their spend - and a Motion
 * entrance on them renders `opacity: 0` into the server HTML, which is an
 * empty hero for anybody whose bundle has not arrived and an unpainted
 * largest element for whatever is measuring LCP. So the sequence is the one
 * /niche-edits and /digital-pr use: delays on a single timeline, every
 * keyframe carrying only a `from`, all of it `both`-filled. The finished
 * board is the element's own style, the animation is the approach to it, and
 * `prefers-reduced-motion` turning the animations off lands on the finished
 * board rather than on a shorter sequence.
 *
 * ## Every client on it is invented, and labelled as such
 *
 * "Client A" through "Client E" are placeholders on purpose: a board with
 * plausible agency names on it is a customer list we have not been given
 * permission to publish, and a board with real ones is worse. The figures
 * are a shape rather than a measurement, and the caption says so.
 *
 * ## It does not promise a screen that does not exist
 *
 * This is the part worth being careful about. The page's own FAQs say, in
 * as many words, that per-client workspaces and user seats are on the
 * roadmap rather than live - so a drawing captioned as the product would
 * contradict the paragraph four screens below it.
 *
 * What is drawn is therefore what an agency genuinely does here today:
 * filter one marketplace, save a shortlist per client, order, and track
 * each placement to a live URL. The niches, the statuses and the columns
 * are the real ones. The arrangement into a per-client board is the
 * illustration, and the caption calls it one.
 */

/**
 * A row of the board.
 *
 * The niche is a slug and the status is an `OrderStatus`, so neither can be
 * a word the product does not have. The first draft of this file typed them
 * in, and typing them in got two of them wrong: it offered a niche called
 * "Ecommerce", which the marketplace cannot filter by, and a status called
 * "Scheduled", which no order has ever been in. A drawing that shows a state
 * the software has no name for is the same mistake as a drawing that shows a
 * feature it does not have, and it is the one nobody notices.
 */
interface Campaign {
  client: string;
  /** A slug from `accepted-niches.ts`, drawn with that file's own label. */
  niche: string;
  /** Placements live, of placements ordered. */
  done: number;
  ordered: number;
  spend: number;
  status: OrderStatus;
}

const CAMPAIGNS: Campaign[] = [
  { client: 'Client A', niche: 'finance', done: 12, ordered: 15, spend: 1240, status: 'in-progress' },
  { client: 'Client B', niche: 'sports', done: 8, ordered: 10, spend: 860, status: 'live' },
  { client: 'Client C', niche: 'legal', done: 10, ordered: 12, spend: 1020, status: 'in-progress' },
  { client: 'Client D', niche: 'travel', done: 6, ordered: 8, spend: 680, status: 'awaiting-content' },
  { client: 'Client E', niche: 'automotive', done: 9, ordered: 10, spend: 950, status: 'live' },
];

/**
 * The two figures in the corner card, added up from the rows beside them.
 *
 * Derived rather than typed, because a drawing whose total contradicts the
 * rows above it is the one defect in an illustration that a reader can
 * actually catch - and `verify:agencies` adds the same sums independently.
 */
export const BOARD_TOTALS = {
  ordered: CAMPAIGNS.reduce((total, row) => total + row.ordered, 0),
  live: CAMPAIGNS.filter((row) => row.status === 'live').reduce((total, row) => total + row.done, 0),
};

/** How far along a row's bar sits, from the two figures beside it. */
export function progress(row: Pick<Campaign, 'done' | 'ordered'>): number {
  if (!row.ordered) return 0;
  return Math.round((row.done / row.ordered) * 100);
}

export function AgencyDashboard({ className }: { className?: string }) {
  const symbol = currencySymbol();

  return (
    <figure className={cn('m-0', className)}>
      <div aria-hidden="true" className="relative">
        {/* ----------------------------------------------- the board */}
        <div
          data-pp-ag="board"
          className="overflow-hidden rounded-xl border border-line bg-white shadow-[var(--shadow-pop)]"
        >
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <p className="text-[13px] font-semibold text-ink">Client campaigns</p>
            <span className="hidden items-center gap-1.5 rounded-md border border-line-strong bg-surface px-2 py-1 text-[11px] text-muted sm:flex">
              <Search className="h-3 w-3" />
              Search clients or campaigns…
            </span>
          </div>

          {/* Column headings: the ones the marketplace and the order queue
              genuinely carry. */}
          <div className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-line bg-surface px-4 py-2 text-[10px] font-semibold tracking-[0.08em] text-muted uppercase sm:grid-cols-[1.4fr_0.8fr_0.7fr_0.7fr_auto]">
            <span>Client</span>
            <span className="hidden sm:block">Niche</span>
            <span className="hidden sm:block">Links</span>
            <span className="hidden sm:block">Spend</span>
            <span className="text-right">Status</span>
          </div>

          <ul className="divide-y divide-line">
            {CAMPAIGNS.map((row, index) => (
              <li
                key={row.client}
                data-pp-ag="row"
                style={{ '--pp-ag-row': index } as React.CSSProperties}
                className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3 sm:grid-cols-[1.4fr_0.8fr_0.7fr_0.7fr_auto]"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[12px] font-medium text-ink">
                    {row.client}
                  </span>
                  {/* The bar is the two figures beside it, drawn. Its width is
                      the finished one; the animation scales it up to that. */}
                  <span className="mt-1.5 block h-1 w-full overflow-hidden rounded-full bg-surface-sunken">
                    <span
                      data-pp-ag="bar"
                      style={{ width: `${progress(row)}%` } as React.CSSProperties}
                      className="block h-full rounded-full bg-accent-500"
                    />
                  </span>
                </span>

                <span className="hidden truncate text-[11px] text-muted sm:block">
                  {acceptedNicheLabel(row.niche)}
                </span>
                <span className="tabular hidden text-[11px] text-ink-soft sm:block">
                  {row.done} / {row.ordered}
                </span>
                <span className="tabular hidden text-[11px] font-medium text-ink sm:block">
                  {symbol}
                  {row.spend.toLocaleString('en-GB')}
                </span>

                {/* The real badge, so the drawing cannot invent a status or
                    a colour for one: `OrderStatusBadge` is what the order
                    queue itself draws. */}
                <span
                  data-pp-ag="badge"
                  style={{ '--pp-ag-row': index } as React.CSSProperties}
                  className="justify-self-end"
                >
                  <OrderStatusBadge status={row.status} />
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* --------------------------------------------- the summary
            What an agency can add up for itself from its own order queue:
            placements ordered, and how many are live. Not a performance
            figure - there is no "+42%" here, because nothing measures one.

            In flow under the board rather than floating over its corner,
            which is where it started. Measured at 1440 the floating version
            covered the spend and the status of the last two rows - the same
            defect the newsroom's cards had over their masthead, and the same
            fix. A card positioned to overlap a table has to be kept clear of
            the table's text by arithmetic that nothing checks; one in flow
            cannot cover anything. */}
        <div
          data-pp-ag="summary"
          className="mt-4 ml-auto hidden w-44 rounded-xl border border-line bg-white p-3.5 shadow-[var(--shadow-pop)] lg:block"
        >
          <p className="text-[10px] font-semibold tracking-[0.08em] text-muted uppercase">
            Across the board
          </p>
          <p className="tabular mt-1.5 text-[22px] leading-none font-semibold text-ink">
            {BOARD_TOTALS.ordered}
          </p>
          <p className="mt-1 text-[11px] text-muted">placements ordered</p>
          <p className="mt-2.5 border-t border-line pt-2 text-[11px] text-accent-700">
            {BOARD_TOTALS.live} live so far
          </p>
        </div>
      </div>

      <figcaption className="mt-6 text-[12px] text-muted">
        An illustration of an agency&rsquo;s campaigns laid out side by side. The clients, the
        figures and the arrangement are an example — per-client workspaces are on the roadmap
        rather than live, as the questions below say.
      </figcaption>
    </figure>
  );
}

export { CAMPAIGNS };
