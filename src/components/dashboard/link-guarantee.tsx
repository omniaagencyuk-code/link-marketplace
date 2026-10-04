'use client';

import { useState, useTransition } from 'react';
import { AlertTriangle, CheckCircle2, Eye, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { formatDate, formatPrice } from '@/lib/utils/format';
import {
  requestRefundAction,
  requestReplacementAction,
} from '@/app/dashboard/orders/[id]/actions';
import type { LinkWithClaim } from '@/lib/monitoring/types';

/**
 * What the guarantee looks like from the buyer's side.
 *
 * Mostly it looks like nothing happening, which is the point: a row saying
 * "checked three days ago, still live" is the whole product most of the time.
 * So the live rows are quiet and the one row that needs a decision is not.
 *
 * The two buttons appear only while a claim is `awaiting_buyer_choice`. Before
 * that the publisher still has time and offering the choice early would have
 * people taking a refund on a link that is about to come back; afterwards the
 * choice has been made and showing it again invites a second one.
 */

const statusCopy: Record<string, { label: string; chip: string; note: string }> = {
  pending: {
    label: 'Not checked yet',
    chip: 'bg-surface-sunken text-ink-soft',
    note: 'We check new placements a day after they go up.',
  },
  live: {
    label: 'Live',
    chip: 'bg-accent-50 text-accent-700',
    note: '',
  },
  failing: {
    label: 'Looking into it',
    chip: 'bg-amber-50 text-amber-700',
    note: 'Something did not read right on the last check. We look again tomorrow before doing anything about it.',
  },
  unverifiable: {
    label: 'Cannot read it',
    chip: 'bg-surface-sunken text-ink-soft',
    note: 'The site is blocking us, so we cannot confirm the link either way. Someone here is checking it by hand.',
  },
  lost: {
    label: 'Not live',
    chip: 'bg-red-50 text-red-700',
    note: '',
  },
};

export function LinkGuarantee({ links }: { links: LinkWithClaim[] }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  if (links.length === 0) return null;

  function choose(action: (id: string) => Promise<{ ok: boolean; error?: string }>, claimId: string) {
    setError(null);
    startTransition(async () => {
      const result = await action(claimId);
      if (!result.ok) setError(result.error ?? 'That did not work. Please try again.');
    });
  }

  return (
    <section className="mt-8" aria-labelledby="guarantee">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 id="guarantee" className="text-[15px] font-semibold text-ink">
          Link guarantee
        </h2>
        <span className="inline-flex items-center gap-1 text-[13px] text-muted">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          checked weekly for twelve months
        </span>
      </div>

      {error ? (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</p>
      ) : null}

      <div className="space-y-2">
        {links.map(({ link, domain, claim }) => {
          const copy = statusCopy[link.status] ?? statusCopy.pending!;
          const deciding = claim?.status === 'awaiting_buyer_choice';

          return (
            <Card key={link.id}>
              <CardContent className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-[13px] font-medium text-ink">
                      {domain || link.placedUrl}
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${copy.chip}`}
                      >
                        {copy.label}
                      </span>
                    </p>
                    <p className="mt-0.5 truncate text-[12px] text-muted">{link.placedUrl}</p>
                  </div>
                  <p className="text-[12px] text-muted">
                    {link.lastCheckedAt
                      ? `Last checked ${formatDate(link.lastCheckedAt)}`
                      : `Guaranteed until ${formatDate(link.guaranteeEndsAt)}`}
                  </p>
                </div>

                {copy.note ? (
                  <p className="mt-2 flex items-start gap-1.5 text-[12px] leading-relaxed text-muted">
                    <Eye className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {copy.note}
                  </p>
                ) : null}

                {/* What we found, in our own words, only when it is bad news.
                    A buyer told "no link to the target URL was found" can go
                    and look for themselves, which is worth more than a
                    sentence saying something went wrong. */}
                {link.status === 'lost' && link.lastReason ? (
                  <p className="mt-2 flex items-start gap-1.5 text-[12px] leading-relaxed text-ink-soft">
                    <AlertTriangle
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600"
                      aria-hidden="true"
                    />
                    {link.lastReason}
                  </p>
                ) : null}

                {claim?.status === 'awaiting_publisher' ? (
                  <p className="mt-2 text-[12px] leading-relaxed text-ink-soft">
                    We have asked the publisher to put it back and given them until{' '}
                    {formatDate(claim.publisherDeadline)}. Nothing for you to do until then - if it
                    is not back we will come to you with the choice.
                  </p>
                ) : null}

                {claim?.status === 'restored' ? (
                  <p className="mt-2 flex items-start gap-1.5 text-[12px] leading-relaxed text-ink-soft">
                    <CheckCircle2
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-600"
                      aria-hidden="true"
                    />
                    The publisher put this one back after we chased it.
                  </p>
                ) : null}

                {claim?.status === 'replacement_requested' ? (
                  <p className="mt-2 text-[12px] leading-relaxed text-ink-soft">
                    A replacement placement is on its way. It will arrive as a new order at no
                    cost to you.
                  </p>
                ) : null}

                {claim?.status === 'refund_requested' ? (
                  <p className="mt-2 text-[12px] leading-relaxed text-ink-soft">
                    A refund of {formatPrice(claim.amountMinor, { currency: claim.currency })} is
                    being processed back to the card you paid with.
                  </p>
                ) : null}

                {deciding ? (
                  <div className="mt-3 rounded-lg border border-line bg-surface-sunken/50 p-3">
                    <p className="text-[13px] font-medium text-ink">Your call</p>
                    <p className="mt-1 text-[12px] leading-relaxed text-muted">
                      The publisher has not put it back. Take a replacement placement on another
                      site at no cost, or your money back -{' '}
                      {formatPrice(claim.amountMinor, { currency: claim.currency })}.
                    </p>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => choose(requestReplacementAction, claim.id)}
                      >
                        Get a replacement
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => choose(requestRefundAction, claim.id)}
                      >
                        Refund me instead
                      </Button>
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
