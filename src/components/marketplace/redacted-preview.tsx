import Link from 'next/link';
import { ArrowRight, Lock } from 'lucide-react';
import { nicheName } from '@/lib/data/categories';
import { linkTypeLabels } from '@/lib/utils/labels';
import { cn } from '@/lib/utils/cn';
import type { PreviewRow } from '@/lib/services/marketplace-preview';
import type { LinkTypeSlug } from '@/lib/types';

/**
 * The marketplace, shown without its inventory.
 *
 * Rows arrive already redacted from `toPreviewRows` - this component never
 * receives a domain, so there is nothing here to leak into the HTML, the RSC
 * payload or a view-source. The masking is data, not a CSS filter.
 */
export function RedactedPreview({
  rows,
  title = 'Marketplace Preview',
  note = 'Create an account to view all websites',
  cta,
  className,
  lockPrice = false,
}: {
  rows: PreviewRow[];
  title?: string;
  note?: string;
  cta?: { label: string; href: string; caption?: string };
  className?: string;
  /**
   * Replace the price band with a lock.
   *
   * The band is already anonymised - it is a £100 range, not a listing's
   * price - so pages that want to show what the marketplace looks like keep
   * it. A page whose whole argument is "the numbers are behind the sign-up"
   * says that instead.
   */
  lockPrice?: boolean;
}) {
  return (
    <section
      aria-labelledby="marketplace-preview-heading"
      className={cn(
        'rounded-xl border border-line bg-white shadow-[var(--shadow-pop)]',
        className,
      )}
    >
      <div className="border-b border-line px-5 py-4">
        <h2 id="marketplace-preview-heading" className="text-[15px] font-semibold text-ink">
          {title}
        </h2>
        <p className="mt-1 flex items-center gap-1.5 text-[12px] text-muted">
          <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />
          {note}
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-line px-5 py-3">
        {['Niche', 'DR', 'Traffic', 'Country', 'Price'].map((filter) => (
          <span
            key={filter}
            aria-hidden="true"
            className="inline-flex items-center gap-1 rounded-md border border-line-strong bg-surface px-2 py-1 text-[11px] font-medium text-ink-soft"
          >
            {filter}
            <ChevronGlyph />
          </span>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[22rem] table-fixed">
          <caption className="sr-only">
            An illustration of the marketplace table. Website names are not shown to signed-out
            visitors.
          </caption>
          <colgroup>
            <col className="w-[42%]" />
            <col className="w-[14%]" />
            <col className="w-[22%]" />
            <col className="w-[22%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-line text-[11px] font-semibold tracking-wide text-muted uppercase">
              <th scope="col" className="px-5 py-2 text-left">
                Website
              </th>
              <th scope="col" className="px-2 py-2 text-right">
                DR
              </th>
              <th scope="col" className="px-2 py-2 text-right">
                Traffic
              </th>
              <th scope="col" className="px-5 py-2 text-right">
                Price
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => (
              <tr key={row.key}>
                <td className="px-5 py-2.5">
                  <span className="block truncate font-mono text-[13px] font-medium text-ink-soft">
                    {row.maskedDomain}
                  </span>
                  <span className="block truncate text-[11px] text-muted">
                    {nicheName(row.niche)}
                    {row.linkTypes.length
                      ? ` · ${row.linkTypes
                          .map((type) => linkTypeLabels[type as LinkTypeSlug] ?? type)
                          .join(', ')}`
                      : ''}
                  </span>
                </td>
                <td className="tabular px-2 py-2.5 text-right text-[13px] font-medium text-ink">
                  {row.domainRating}
                </td>
                <td className="tabular px-2 py-2.5 text-right text-[13px] text-ink-soft">
                  {row.traffic}
                </td>
                <td className="px-5 py-2.5 text-right text-[13px] font-medium text-ink">
                  {lockPrice ? (
                    <span className="inline-flex items-center gap-1 text-muted">
                      <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />
                      <span className="text-[12px]">Members</span>
                    </span>
                  ) : (
                    <span className="tabular">{row.priceBand}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {cta ? (
        <div className="border-t border-line p-4">
          <Link
            href={cta.href}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent-600 text-[14px] font-semibold text-white transition-colors hover:bg-accent-700"
          >
            {cta.label}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          {cta.caption ? (
            <p className="mt-2.5 text-center text-[12px] text-muted">{cta.caption}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function ChevronGlyph() {
  return (
    <svg
      viewBox="0 0 12 12"
      className="h-2.5 w-2.5 text-muted-soft"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M3 4.5 6 7.5 9 4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
