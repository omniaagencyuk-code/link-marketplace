import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowLeft } from 'lucide-react';
import { PageTitle } from '@/components/dashboard/page-title';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { requireCustomerSession } from '@/lib/auth/customer-access';
import { gapService } from '@/lib/services/gap-service';
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
                <TableWrap>
                  <Table>
                    <thead>
                      <Tr>
                        <Th>Site</Th>
                        <Th className="text-right">DR</Th>
                        <Th className="text-right">Traffic</Th>
                        <Th>Links to</Th>
                        <Th />
                      </Tr>
                    </thead>
                    <tbody>
                      {sellable.map((row) => (
                        <Tr key={row.domain}>
                          <Td className="font-medium text-ink">{row.domain}</Td>
                          <Td className="tabular text-right">{row.domainRating ?? '—'}</Td>
                          <Td className="tabular text-right">
                            {row.organicTraffic ? row.organicTraffic.toLocaleString('en-GB') : '—'}
                          </Td>
                          <Td className="text-[12px] text-muted">
                            {row.linkingCompetitors.join(', ')}
                          </Td>
                          <Td>
                            <Link
                              href={`/websites?q=${encodeURIComponent(row.domain)}`}
                              className="text-[13px] font-medium text-accent-700 hover:underline"
                            >
                              View listing
                            </Link>
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                </TableWrap>
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
