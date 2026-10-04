import { ShieldCheck } from 'lucide-react';
import { PageTitle } from '@/components/dashboard/page-title';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { CloseClaim, RunChecksNow } from '@/components/admin/monitor-controls';
import { linkMonitorAdmin } from '@/lib/services/link-monitor-service';
import { formatDateTime, formatNumber, formatPrice } from '@/lib/utils/format';

/**
 * The two queues the monitor cannot clear on its own.
 *
 * Unverifiable links, because three soft failures in a row means the checker
 * cannot see the page and the link is either fine behind a firewall or gone -
 * and only a person can tell which. And open claims, because a refund is a
 * person in the Stripe dashboard: this application holds no balance, and a
 * payout it made by itself would have nobody's eyes on it.
 *
 * Everything else about the monitor happens at night without being watched,
 * which is why there is no list of healthy links here. A page that showed
 * every link that is fine would be a page nobody reads, and the two lists
 * that need reading would be lost in it.
 */

export const dynamic = 'force-dynamic';

const claimLabels: Record<string, string> = {
  awaiting_publisher: 'Publisher chasing',
  awaiting_buyer_choice: 'Waiting on the buyer',
  replacement_requested: 'Replacement owed',
  refund_requested: 'Refund owed',
  restored: 'Restored',
  closed: 'Closed',
};

export default async function LinkMonitorPage() {
  const [counts, unverifiable, claims] = await Promise.all([
    // Zero rather than a 500: these are a summary line, and a count that
    // cannot be read is not worth taking the two queues down for.
    linkMonitorAdmin.counts().catch(() => null),
    linkMonitorAdmin.unverifiable().catch(() => []),
    linkMonitorAdmin.openClaims().catch(() => []),
  ]);

  const needsMoney = claims.filter((entry) => entry.claim.status === 'refund_requested');

  return (
    <>
      <PageTitle
        title="Link monitor"
        description="Every placement is checked weekly for twelve months. These are the ones a person has to deal with."
        action={<RunChecksNow />}
      />

      {counts ? (
        <Card>
          <CardContent className="grid gap-4 py-4 sm:grid-cols-6">
            <Figure label="Watched" value={formatNumber(counts.total)} />
            <Figure label="Live" value={formatNumber(counts.live)} />
            <Figure label="Not checked yet" value={formatNumber(counts.pending)} />
            <Figure label="Failing" value={formatNumber(counts.failing)} />
            <Figure label="Unreadable" value={formatNumber(counts.unverifiable)} />
            <Figure label="Lost" value={formatNumber(counts.lost)} />
          </CardContent>
        </Card>
      ) : null}

      {needsMoney.length > 0 ? (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          {needsMoney.length === 1
            ? 'One buyer is owed a refund.'
            : `${needsMoney.length} buyers are owed refunds.`}{' '}
          Pay them in Stripe, then mark the claim settled here.
        </p>
      ) : null}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-muted" aria-hidden="true" />
            Open claims
            <span className="text-[13px] font-normal text-muted">{claims.length}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {claims.length === 0 ? (
            <p className="text-[13px] text-muted">
              Nothing open. Every link we have checked is where it should be.
            </p>
          ) : (
            <TableWrap>
              <Table>
                <thead>
                  <Tr>
                    <Th>Site</Th>
                    <Th>Order</Th>
                    <Th>Buyer</Th>
                    <Th>What happened</Th>
                    <Th>State</Th>
                    <Th className="text-right">Paid</Th>
                    <Th />
                  </Tr>
                </thead>
                <tbody>
                  {claims.map(({ claim, domain, orderReference, buyerEmail }) => (
                    <Tr key={claim.id}>
                      <Td className="font-medium text-ink">{domain || '—'}</Td>
                      <Td className="text-muted">{orderReference || '—'}</Td>
                      <Td className="text-muted">{buyerEmail || '—'}</Td>
                      <Td className="max-w-[22rem] text-muted">{claim.reason}</Td>
                      <Td>
                        {claimLabels[claim.status] ?? claim.status}
                        <span className="block text-[11px] text-muted">
                          opened {formatDateTime(claim.openedAt)}
                        </span>
                      </Td>
                      <Td className="tabular text-right">
                        {formatPrice(claim.amountMinor, { currency: claim.currency })}
                      </Td>
                      <Td className="text-right">
                        {/* Only the ones where money is owed. Closing a claim
                            that is still being chased would stop the chase. */}
                        {claim.status === 'refund_requested' ||
                        claim.status === 'replacement_requested' ? (
                          <CloseClaim
                            claimId={claim.id}
                            amount={formatPrice(claim.amountMinor, { currency: claim.currency })}
                          />
                        ) : null}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Links we cannot read
            <span className="text-[13px] font-normal text-muted">{unverifiable.length}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-[13px] leading-relaxed text-muted">
            Three failed reads in a row. The link may be perfectly fine - these are sites that
            block us, not sites that dropped the link, and no claim is ever raised from one of
            these. Someone has to look.
          </p>
          {unverifiable.length === 0 ? (
            <p className="text-[13px] text-muted">Nothing. Every site let us in.</p>
          ) : (
            <TableWrap>
              <Table>
                <thead>
                  <Tr>
                    <Th>Site</Th>
                    <Th>Article</Th>
                    <Th>Why</Th>
                    <Th>Last tried</Th>
                  </Tr>
                </thead>
                <tbody>
                  {unverifiable.map(({ link, domain }) => (
                    <Tr key={link.id}>
                      <Td className="font-medium text-ink">{domain || '—'}</Td>
                      <Td className="max-w-[20rem] truncate">
                        <a
                          href={link.placedUrl}
                          target="_blank"
                          rel="noreferrer noopener nofollow"
                          className="text-accent-700 hover:underline"
                        >
                          {link.placedUrl}
                        </a>
                      </Td>
                      <Td className="max-w-[20rem] text-muted">{link.lastReason ?? '—'}</Td>
                      <Td className="text-muted">
                        {link.lastCheckedAt ? formatDateTime(link.lastCheckedAt) : '—'}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[12px] text-muted">{label}</p>
      <p className="tabular mt-0.5 text-[15px] font-semibold text-ink">{value}</p>
    </div>
  );
}
