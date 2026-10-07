import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowLeft } from 'lucide-react';
import { PageTitle } from '@/components/dashboard/page-title';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { GapResultsTable, type GapSellableRow } from '@/components/dashboard/gap-results-table';
import { requireCustomerSession } from '@/lib/auth/customer-access';
import { gapService } from '@/lib/services/gap-service';
import { websiteService } from '@/lib/services/website-service';
import { formatDate } from '@/lib/utils/format';
import { brand } from '@/lib/config/brand';

/**
 * One gap report.
 *
 * Led by the number with money attached: how many of the gaps are sites we
 * can sell today. The rest of the gap is real and useful and is shown
 * underneath, but a report that opens with "4,182 opportunities" and buries
 * the fourteen you can act on is a report that gets skimmed.
 *
 * `requireCustomerSession` and a user-scoped read: a report is only ever
 * readable by whoever ran it.
 */

export const metadata: Metadata = {
  title: `Link gap report | ${brand.name}`,
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function GapReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCustomerSession(`/dashboard/link-gap/${id}`);

  const report = await gapService.report(id, user.id).catch(() => null);
  if (!report) notFound();

  const sellable = report.results.filter((row) => row.websiteId);
  const rest = report.results.filter((row) => !row.websiteId);

  /*
    The listings behind the rows we can sell, in one query.

    Bounded by the sellable count - tens, in every report so far - rather than
    by the gap, which runs to thousands. The marketplace reads its whole
    inventory to do the same job, so this is the cheaper end of a pattern the
    site already pays for, and it is what lets the panel open without a
    request: `WebsiteSnippet` fetches nothing.

    Scoped to the signed-in customer rather than the service role. They can
    read `websites` - the marketplace proves it - and a page that will render
    prices and an order button should be reading as the person buying.
  */
  const listings = await websiteService
    .getByIds(sellable.map((row) => row.websiteId as string))
    .catch(() => []);

  /*
    Active only, re-checked here.

    `getByIds` does not filter on status, and a report is a stored thing: a
    publisher paused between the run and this read would otherwise render an
    orderable panel for something nobody can order. The row stays, without a
    panel, because the gap itself is still true.
  */
  const byId = new Map(
    listings.filter((item) => item.status === 'active').map((item) => [item.id, item]),
  );

  const sellableRows: GapSellableRow[] = sellable.map((row) => ({
    domain: row.domain,
    linkingCompetitors: row.linkingCompetitors,
    domainRating: row.domainRating,
    organicTraffic: row.organicTraffic,
    website: row.websiteId ? byId.get(row.websiteId) : undefined,
  }));

  return (
    <>
      <PageTitle
        title={report.targetDomain}
        description={`Against ${report.competitorDomains.join(', ')} · ${formatDate(report.createdAt)}`}
        action={
          <Link
            href="/dashboard/link-gap"
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-2 text-[13px] font-medium text-ink"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            All reports
          </Link>
        }
      />

      {report.status !== 'completed' ? (
        <Card>
          <CardContent className="py-5 text-[14px] text-ink">
            {report.statusReason ?? 'That report is not finished.'}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <Figure label="Gaps found" value={report.gapsFound.toLocaleString('en-GB')} />
            <Figure
              label="Available here"
              value={String(report.sellableFound)}
              hint="You can order these today"
              accent
            />
            <Figure
              label="Competitors compared"
              value={String(report.competitorDomains.length)}
            />
          </div>

          <h2 className="mb-3 text-[15px] font-semibold text-ink">
            You can buy these from us
            <span className="ml-2 text-[13px] font-normal text-muted">{sellable.length}</span>
          </h2>

          {sellable.length === 0 ? (
            <Card className="mb-8">
              <CardContent className="py-5 text-[13px] leading-relaxed text-muted">
                None of the gaps are sites we currently sell. That is an honest answer rather than
                an empty one: the gap below is still where their links come from, and we add
                publishers every week.
              </CardContent>
            </Card>
          ) : (
            <Card className="mb-8">
              <CardContent className="p-0">
                <GapResultsTable rows={sellableRows} />
              </CardContent>
            </Card>
          )}

          <h2 className="mb-3 text-[15px] font-semibold text-ink">
            The rest of the gap
            <span className="ml-2 text-[13px] font-normal text-muted">{rest.length}</span>
          </h2>
          <p className="mb-3 max-w-2xl text-[13px] leading-relaxed text-muted">
            Sites linking to a competitor and not to you, that we do not sell. Worth approaching
            yourself — the ones linking to more than one competitor first.
            {report.truncated
              ? ' This is drawn from the strongest referring domains for each site rather than every one of them.'
              : ''}
          </p>

          <Card>
            <CardContent className="p-0">
              <TableWrap>
                <Table>
                  <thead>
                    <Tr>
                      <Th>Site</Th>
                      <Th>Links to</Th>
                    </Tr>
                  </thead>
                  <tbody>
                    {rest.map((row) => (
                      <Tr key={row.domain}>
                        <Td className="text-ink">{row.domain}</Td>
                        <Td>
                          {row.linkingCompetitors.length > 1 ? (
                            <Badge tone="accent">
                              {row.linkingCompetitors.length} competitors
                            </Badge>
                          ) : (
                            <span className="text-[12px] text-muted">
                              {row.linkingCompetitors.join(', ')}
                            </span>
                          )}
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

function Figure({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-[12px] font-medium tracking-wide text-muted uppercase">{label}</p>
        <p
          className={
            accent
              ? 'tabular mt-1 text-2xl font-semibold text-accent-700'
              : 'tabular mt-1 text-2xl font-semibold text-ink'
          }
        >
          {value}
        </p>
        {hint ? <p className="mt-0.5 text-[12px] text-muted">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}
