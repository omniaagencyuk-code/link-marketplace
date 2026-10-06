import Link from 'next/link';
import { HandCoins } from 'lucide-react';
import { PageTitle } from '@/components/dashboard/page-title';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/empty-state';
import { SalesAction } from '@/components/admin/sales-controls';
import { salesAttributionService } from '@/lib/services/sales-attribution-service';
import { formatDate, formatPrice } from '@/lib/utils/format';
import { matchAttributionsAction } from '../actions';

/**
 * What outbound has actually produced.
 *
 * Revenue is read from `orders`, so the figure is the one the orders page
 * shows. A sales report with its own copy of revenue is a sales report that
 * disagrees with finance, and the disagreement is always found in a meeting.
 *
 * Only paid orders count. A draft order is a basket, and counting baskets is
 * how an outbound programme reports a success it did not have.
 *
 * Each row says how the match was made, because the three bases are not
 * equally strong: `email` means they signed up with an address we wrote to,
 * `domain` means a colleague at the same company did, `manual` means somebody
 * decided. They are stored once and never recomputed, so a later change to
 * the matching rule cannot rewrite what is here.
 */

export const dynamic = 'force-dynamic';

export default async function CustomersPage() {
  const rows = await salesAttributionService.report().catch(() => []);

  const revenue = rows.reduce((total, row) => total + row.revenueMinor, 0);
  const buying = rows.filter((row) => row.orders > 0).length;

  return (
    <>
      <PageTitle
        title="Customers from outbound"
        description="Prospects that became accounts, and what they have spent."
        action={<SalesAction action={matchAttributionsAction} label="Check for new matches" />}
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={HandCoins}
          title="Nothing matched yet"
          description="A prospect appears here once somebody signs up with an address we wrote to, or with one at the same company. It is checked nightly, and you can check now with the button above."
        />
      ) : (
        <>
          <Card className="mb-6">
            <CardContent className="grid gap-4 py-4 sm:grid-cols-3">
              <Figure label="Accounts matched" value={String(rows.length)} />
              <Figure label="Of those, have ordered" value={String(buying)} />
              <Figure label="Revenue" value={formatPrice(revenue)} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <TableWrap>
                <Table>
                  <thead>
                    <Tr>
                      <Th>Prospect</Th>
                      <Th>Account</Th>
                      <Th>Matched</Th>
                      <Th className="text-right">Orders</Th>
                      <Th className="text-right">Revenue</Th>
                    </Tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <Tr key={`${row.prospectId}:${row.profileId}`}>
                        <Td>
                          <Link
                            href={`/admin/sales/prospects/${row.prospectId}`}
                            className="font-medium text-ink hover:underline"
                          >
                            {row.prospectName}
                          </Link>
                        </Td>
                        <Td className="text-[13px] text-ink-soft">{row.profileEmail}</Td>
                        <Td>
                          <Badge tone={row.matchedBy === 'email' ? 'accent' : 'outline'}>
                            {row.matchedBy === 'email'
                              ? 'the address we wrote to'
                              : row.matchedBy === 'domain'
                                ? 'same company'
                                : row.matchedBy}
                          </Badge>
                          <span className="ml-2 text-[12px] text-muted">
                            {formatDate(row.matchedAt)}
                          </span>
                        </Td>
                        <Td className="tabular text-right">{row.orders}</Td>
                        <Td className="tabular text-right font-semibold text-ink">
                          {formatPrice(row.revenueMinor)}
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[12px] font-medium tracking-wide text-muted uppercase">{label}</p>
      <p className="tabular mt-1 text-xl font-semibold text-ink">{value}</p>
    </div>
  );
}
