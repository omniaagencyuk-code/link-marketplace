import Link from 'next/link';
import { PageTitle } from '@/components/dashboard/page-title';
import { Card, CardContent } from '@/components/ui/card';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/empty-state';
import { Building2 } from 'lucide-react';
import { AddProspects } from '@/components/admin/add-prospects';
import { prospectService } from '@/lib/services/prospect-service';
import { segmentLabel } from '@/lib/config/sales-segments';
import type { ProspectStage, SalesSegment } from '@/lib/types/sales';

/**
 * The prospect list.
 *
 * Sorted by score, highest first, with the score's own explanation beside it.
 * A list sorted by a number nobody can account for is a list people work down
 * in whatever order they like, which makes the scoring pointless - so the
 * reason is in the row rather than behind a click.
 */

export const dynamic = 'force-dynamic';

const STAGE_TONE: Partial<Record<ProspectStage, BadgeTone>> = {
  new: 'neutral',
  researching: 'info',
  qualified: 'accent',
  disqualified: 'neutral',
  contacted: 'navy',
  replied: 'positive',
  in_conversation: 'positive',
  won: 'accent',
  lost: 'neutral',
  unsubscribed: 'negative',
};

export default async function ProspectsPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string; segment?: string; q?: string }>;
}) {
  const { stage, segment, q } = await searchParams;

  const prospects = await prospectService
    .list({
      stage: (stage as ProspectStage) || undefined,
      segment: (segment as SalesSegment) || undefined,
      term: q || undefined,
    })
    .catch(() => []);

  const filtered = Boolean(stage || segment || q);

  return (
    <>
      <PageTitle
        title="Prospects"
        description="Companies we might sell to. Paste a list and the sweeps do the rest."
      />

      <AddProspects />

      <div className="mt-8 mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-ink">
          {filtered ? 'Matching prospects' : 'All prospects'}
          <span className="ml-2 text-[13px] font-normal text-muted">{prospects.length}</span>
        </h2>
        {filtered ? (
          <Link href="/admin/sales/prospects" className="text-[13px] text-ink underline">
            Clear filters
          </Link>
        ) : null}
      </div>

      {prospects.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={filtered ? 'Nothing matches' : 'No prospects yet'}
          description={
            filtered
              ? 'Try clearing the filters.'
              : 'Paste a list of domains above. Research costs nothing, so it is safe to start wide.'
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <TableWrap>
              <Table>
                <thead>
                  <Tr>
                    <Th>Company</Th>
                    <Th>Segment</Th>
                    <Th>Stage</Th>
                    <Th className="text-right">Score</Th>
                    <Th>Why</Th>
                    <Th>Reachable</Th>
                  </Tr>
                </thead>
                <tbody>
                  {prospects.slice(0, 500).map((prospect) => (
                    <Tr key={prospect.id}>
                      <Td>
                        <Link
                          href={`/admin/sales/prospects/${prospect.id}`}
                          className="font-medium text-ink hover:underline"
                        >
                          {prospect.companyName}
                        </Link>
                        <p className="text-[12px] text-muted">{prospect.domain}</p>
                      </Td>
                      <Td className="text-[13px] text-ink-soft">{segmentLabel(prospect.segment)}</Td>
                      <Td>
                        <Badge tone={STAGE_TONE[prospect.stage] ?? 'neutral'}>
                          {prospect.stage.replace(/_/g, ' ')}
                        </Badge>
                      </Td>
                      <Td className="tabular text-right font-semibold text-ink">
                        {prospect.score ?? '-'}
                      </Td>
                      <Td className="max-w-xs text-[12px] leading-relaxed text-muted">
                        {describe(prospect.researchStatus, prospect.qualified, prospect.scoreBreakdown)}
                      </Td>
                      <Td className="text-[12px] text-muted">
                        {prospect.contactsStatus === 'found'
                          ? 'Yes'
                          : prospect.contactsStatus === 'none'
                            ? 'Nobody found'
                            : prospect.contactsStatus === 'pending'
                              ? 'Not looked'
                              : prospect.contactsStatus}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          </CardContent>
        </Card>
      )}

      {prospects.length > 500 ? (
        <p className="mt-3 text-[12px] text-muted">
          Showing the first 500 of {prospects.length}. Filter by stage or segment to narrow it.
        </p>
      ) : null}
    </>
  );
}

/**
 * The score, in a phrase.
 *
 * Built from the stored breakdown rather than recomputed, so the explanation
 * and the number cannot disagree - which they would the first time the scoring
 * weights changed and the stored scores had not been recalculated.
 */
function describe(
  researchStatus: string,
  qualified: boolean | undefined,
  breakdown: Record<string, number>,
): string {
  if (researchStatus === 'pending') return 'Not read yet';
  if (researchStatus === 'failed') return 'Their site could not be read';
  if (qualified === undefined) return 'Researched, not yet qualified';
  if (qualified === false) return 'Read as not a buyer';

  const parts: string[] = [];
  if ((breakdown.verdict ?? 0) >= 30) parts.push('reads as a buyer');
  else if ((breakdown.verdict ?? 0) > 0) parts.push('their site does not say');

  const quoted = Math.round((breakdown.evidence ?? 0) / 3);
  if (quoted > 0) parts.push(`${quoted} quoted reason${quoted === 1 ? '' : 's'}`);
  if ((breakdown.reachability ?? 0) === 0) parts.push('nobody to write to');

  return parts.join(', ') || 'Qualified';
}
