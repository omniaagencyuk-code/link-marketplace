import { PageTitle } from '@/components/dashboard/page-title';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { websiteService } from '@/lib/services';
import { linkTiers } from '@/lib/config/link-tiers';
import { nicheName } from '@/lib/data/categories';
import { currencySymbol, formatNumber } from '@/lib/utils/format';
import type { PackageDepthRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * Whether a managed package can be sold in a niche, and for how much.
 *
 * A package promises a count, a minimum rating, a minimum traffic and a
 * niche, and then we choose the publishers. Both halves of that need
 * answering before a fee can be set: how many listings could fill it, and
 * what they cost us. Neither was answerable - the admin can see one
 * listing's cost at a time, which says nothing about whether ten DR40
 * finance sites exist or two.
 *
 * Everything here is read by `package_inventory_depth` (0098). Nothing is
 * computed in this file, because a second copy of a costing rule is the one
 * that drifts, and the drifted copy would be the one a fee was set from.
 *
 * ## What a blank cost column means
 *
 * Not "unknown". A publisher's cost is recorded in the publisher's own
 * currency and never converted, so a median across a niche holding both GBP
 * and USD is a figure nobody quoted. The function refuses to produce one,
 * and the row still says how many listings it could not price together. A
 * gap that announces itself beats a number nobody can act on.
 */

/** Traffic a package would promise. The floor the depth is measured at. */
const PROMISED_TRAFFIC = 1_000;

/** Enough listings to fill a package of ten twice over, with room to sell. */
const COMFORTABLE = 30;

function money(minor: number | null): string {
  if (minor === null) return '—';

  return `${currencySymbol()}${formatNumber(Math.round(minor / 100))}`;
}

/** What the middle half costs, where the costs can be read together. */
function costRange(row: PackageDepthRow): string {
  if (row.costCurrency === null) return '—';

  return `${money(row.costLowMinor)} – ${money(row.costHighMinor)}`;
}

export default async function AdminPackagesPage() {
  const rows = await websiteService.packageInventoryDepth(PROMISED_TRAFFIC);

  const niches = [...new Set(rows.map((row) => row.niche))].sort();
  const byKey = new Map(rows.map((row) => [`${row.niche}:${row.drMin}`, row]));

  return (
    <div className="space-y-6">
      <PageTitle
        title="Package inventory"
        description={`Listings with at least ${formatNumber(PROMISED_TRAFFIC)} monthly visits, by niche and minimum domain rating. A package can only promise what this can fill.`}
      />

      {rows.length === 0 ? (
        <p className="text-[14px] text-muted">
          No inventory figures. This view reads the live database and has nothing to show
          from a local clone.
        </p>
      ) : (
        <>
          <TableWrap>
            <Table>
              <thead>
                <Tr>
                  <Th>Niche</Th>
                  {linkTiers.map((tier) => (
                    <Th key={tier.slug}>DR{tier.drMin}+</Th>
                  ))}
                </Tr>
              </thead>
              <tbody>
                {niches.map((niche) => (
                  <Tr key={niche}>
                    <Td>{nicheName(niche as Parameters<typeof nicheName>[0])}</Td>
                    {linkTiers.map((tier) => {
                      const row = byKey.get(`${niche}:${tier.drMin}`);
                      const listings = row?.listings ?? 0;

                      return (
                        <Td key={tier.slug}>
                          <span
                            className={
                              listings >= COMFORTABLE
                                ? 'font-medium text-ink'
                                : 'text-muted'
                            }
                          >
                            {formatNumber(listings)}
                          </span>
                        </Td>
                      );
                    })}
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>

          <p className="text-[13px] text-muted">
            Bold where there are at least {COMFORTABLE} listings — enough to fill a package
            of ten more than twice, which is the margin a promise needs when two customers
            order in the same week. A niche and tier in grey is one to leave out of the
            packages you offer, not one to sell cautiously.
          </p>

          <h2 className="pt-4 text-lg font-semibold tracking-tight text-ink">
            What they cost us
          </h2>
          <TableWrap>
            <Table>
              <thead>
                <Tr>
                  <Th>Niche</Th>
                  <Th>Rating</Th>
                  <Th>Listings</Th>
                  <Th>Costed</Th>
                  <Th>Currency</Th>
                  <Th>Middle half costs</Th>
                  <Th>Typical cost</Th>
                  <Th>We charge</Th>
                </Tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <Tr key={`${row.niche}:${row.drMin}`}>
                    <Td>{nicheName(row.niche as Parameters<typeof nicheName>[0])}</Td>
                    <Td>DR{row.drMin}+</Td>
                    <Td>{formatNumber(row.listings)}</Td>
                    <Td>{formatNumber(row.withCost)}</Td>
                    <Td>{row.costCurrency ?? 'mixed'}</Td>
                    <Td>{costRange(row)}</Td>
                    <Td>{money(row.costMedianMinor)}</Td>
                    <Td>{money(row.sellMedianMinor)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>

          <p className="text-[13px] text-muted">
            Costs are in the publisher&rsquo;s own currency and are never converted, so a
            niche holding more than one reads &ldquo;mixed&rdquo; and reports no figures —
            a median across currencies is a number nobody quoted. &ldquo;We charge&rdquo;
            is always in {currencySymbol()}. Quartiles rather than an average, because one
            expensive publisher drags a mean somewhere no real placement sits.
          </p>
        </>
      )}
    </div>
  );
}
