import { Bookmark, Plus, Search } from 'lucide-react';
import { nicheName } from '@/lib/data/categories';
import { linkTypeLabels } from '@/lib/utils/labels';
import { cn } from '@/lib/utils/cn';
import type { PreviewRow } from '@/lib/services/marketplace-preview';
import type { LinkTypeSlug, NicheSlug } from '@/lib/types';

/**
 * The marketplace, drawn rather than run.
 *
 * A still of the real interface for a page that is selling it: the search
 * box, the filters the marketplace actually has, and the table's real
 * columns - Website, Niche, Country, DR, Organic Traffic, Price - with the
 * row action it actually offers.
 *
 * ## Every figure in it is real
 *
 * The rows are the same redacted preview rows the rest of this page uses:
 * masked domain, rounded DR, banded traffic, banded price. Nothing here is
 * invented, which is the only way to draw a product screenshot honestly -
 * a mock full of made-up domains at made-up prices is a claim about the
 * inventory, and this one makes none.
 *
 * ## What each row is for sale as
 *
 * `linkTypes` says whether a listing offers a guest post, a niche edit, a
 * digital PR placement, or more than one. /digital-pr asks for that column
 * (`showLinkTypes`) because without it the table reads as a list of digital
 * PR opportunities, and most of the inventory is not - a page about
 * editorial coverage showing guest-post listings unlabelled is the page
 * making a claim the rows do not support. The other pages leave it off and
 * are drawn exactly as before.
 *
 * ## It does nothing, and says so
 *
 * Not a second marketplace: there are no controls, no links and nothing
 * focusable. The whole thing is `aria-hidden` with a caption for anybody not
 * looking at it, because a screen reader walking a table of dots and dashes
 * is being given work rather than information. The real marketplace is one
 * button away and that button is a link.
 */
export function MarketplaceMock({
  rows,
  className,
  showLinkTypes = false,
  caption = 'An illustration of the Press Parrot marketplace: a search box, filters for niche, domain rating, traffic, country and price, and a table of publishers with their metrics.',
}: {
  rows: PreviewRow[];
  className?: string;
  /** Print what each listing is for sale as. Off everywhere but /digital-pr. */
  showLinkTypes?: boolean;
  caption?: string;
}) {
  return (
    <figure className={cn('m-0', className)}>
      <div
        aria-hidden="true"
        className="overflow-hidden rounded-xl border border-line bg-white shadow-[var(--shadow-pop)]"
      >
        {/* Search */}
        <div className="border-b border-line p-4">
          <div className="flex items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted" />
            <span className="text-[12px] text-muted">Search by niche, keyword or domain…</span>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {['DR', 'Traffic', 'Price', 'Niche', 'Country'].map((filter) => (
              <span
                key={filter}
                className="inline-flex items-center gap-1 rounded-md border border-line-strong bg-white px-2 py-1 text-[11px] font-medium text-ink-soft"
              >
                {filter}
                <svg viewBox="0 0 10 6" className="h-1.5 w-2.5 fill-none stroke-current">
                  <path d="M1 1l4 4 4-4" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </span>
            ))}
          </div>
        </div>

        {/* Rows */}
        <ul className="divide-y divide-line">
          {rows.map((row) => (
            <li
              key={row.key}
              className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-accent-50/60"
            >
              <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-ink">
                {row.maskedDomain}
              </span>
              {/*
                Link type in the niche column's place rather than beside it.
                The drawing sits in a 32rem column, which has room for one
                category and not two: added as a seventh cell the badges
                pushed the row's "Add" button past the card's own edge, where
                the band's clipping hid it. The filters listed beside the
                drawing still name both.
              */}
              {showLinkTypes ? (
                <span className="hidden w-24 shrink-0 gap-1 truncate sm:flex">
                  {(() => {
                    /*
                      One badge, and where a listing offers more than one
                      thing the named one is the digital PR. Not a thumb on
                      the scale: the column is only drawn on the page about
                      digital PR, and naming the guest post on a listing that
                      also sells the thing the reader came for would be the
                      drawing hiding the answer. A listing without it still
                      says what it is.
                    */
                    const named = row.linkTypes.includes('digital-pr')
                      ? 'digital-pr'
                      : row.linkTypes[0];
                    if (!named) return null;
                    return (
                      <>
                        <span
                          className={
                            named === 'digital-pr'
                              ? 'truncate rounded border border-accent-200 bg-accent-50 px-1.5 py-0.5 text-[10px] font-medium text-accent-800'
                              : 'truncate rounded border border-line bg-surface px-1.5 py-0.5 text-[10px] font-medium text-muted'
                          }
                        >
                          {linkTypeLabels[named as LinkTypeSlug] ?? named}
                        </span>
                        {row.linkTypes.length > 1 ? (
                          <span className="self-center text-[10px] text-muted">
                            +{row.linkTypes.length - 1}
                          </span>
                        ) : null}
                      </>
                    );
                  })()}
                </span>
              ) : (
                <span className="hidden w-20 shrink-0 truncate text-[11px] text-muted sm:block">
                  {row.niche ? nicheName(row.niche as NicheSlug) : '—'}
                </span>
              )}
              <span className="tabular w-12 shrink-0 text-[11px] text-ink-soft">
                DR {row.domainRating}
              </span>
              <span className="tabular hidden w-14 shrink-0 text-right text-[11px] text-ink-soft md:block">
                {row.traffic}
              </span>
              <span className="tabular w-20 shrink-0 text-right text-[11px] font-semibold text-ink">
                {row.priceBand}
              </span>
              <span className="hidden shrink-0 text-muted sm:block">
                <Bookmark className="h-3.5 w-3.5" />
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-accent-700 px-2 py-1 text-[11px] font-semibold text-white">
                <Plus className="h-3 w-3" />
                Add
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/*
        The note the redacted preview has always carried, kept rather than
        dropped in the redrawing: it is the sentence that explains why every
        domain on this page is dots, and it answers the question the page's
        own FAQ asks two sections further down.
      */}
      <figcaption className="mt-3 text-[12px] text-muted">
        Website names are not shown to signed-out visitors.
        <span className="sr-only"> {caption}</span>
      </figcaption>
    </figure>
  );
}
