'use client';

import { Input } from '@/components/ui/input';
import { acceptedNicheLabel } from '@/lib/config/accepted-niches';
import { SERVICE_TYPES } from './website-services-editor';
import type { LinkTypeSlug, Website } from '@/lib/types';

/**
 * What a niche costs on this site, where it differs.
 *
 * A rate card is not one number. The publisher who takes a technology guest
 * post at the list price wants two or three times that for gambling, and
 * before this the difference was settled by email - which is the thing this
 * marketplace exists to replace.
 *
 * Only the niches the publisher has ticked appear, and only the placements
 * this site sells, so the grid is as small as the site is simple. A blank box
 * is not a price of zero: it means this niche costs what the placement costs,
 * and the listing says nothing about it.
 */
export function WebsiteNichePricesEditor({
  website,
  niches,
  types,
  currency,
}: {
  website?: Website;
  /** The niches ticked above, live. */
  niches: string[];
  /** The placements ticked above, live. */
  types: Set<LinkTypeSlug>;
  currency: string;
}) {
  const offered = SERVICE_TYPES.filter((entry) => types.has(entry.type));

  if (niches.length === 0 || offered.length === 0) {
    return (
      <p className="text-[13px] text-muted">
        Tick the niches this publisher accepts and the placements it sells, and they appear here to
        be priced.
      </p>
    );
  }

  const existing = new Map(
    (website?.nichePrices ?? []).map((price) => [`${price.niche}:${price.linkType}`, price.priceMinor]),
  );

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Price overrides per niche and placement</caption>
          <thead>
            <tr>
              <th className="border-b border-line py-2 pr-3 text-left text-[11px] font-semibold tracking-wide text-muted uppercase">
                Niche
              </th>
              {offered.map((entry) => (
                <th
                  key={entry.type}
                  className="border-b border-line px-2 py-2 text-left text-[11px] font-semibold tracking-wide text-muted uppercase"
                >
                  {entry.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {niches.map((niche) => (
              <tr key={niche}>
                <td className="border-b border-line py-2 pr-3 text-[13px] text-ink">
                  {acceptedNicheLabel(niche)}
                </td>
                {offered.map((entry) => {
                  const name = `nichePrice_${niche}_${entry.type}`;
                  const minor = existing.get(`${niche}:${entry.type}`);
                  return (
                    <td key={entry.type} className="border-b border-line px-2 py-2">
                      <Input
                        id={name}
                        name={name}
                        type="number"
                        min={0}
                        step={5}
                        aria-label={`${acceptedNicheLabel(niche)} ${entry.label.toLowerCase()} price`}
                        defaultValue={typeof minor === 'number' ? String(minor / 100) : ''}
                        placeholder="Standard"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[12px] text-muted">
        Prices are in {currency}. Leave a box empty for the standard placement price - an empty box
        publishes nothing, and a zero would publish the niche as free.
      </p>
    </div>
  );
}
