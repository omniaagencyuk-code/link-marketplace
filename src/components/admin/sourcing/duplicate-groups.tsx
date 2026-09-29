'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Home, Mail, Trash2, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { discardDraftsAction } from '@/app/admin/(protected)/sourcing/actions';
import { formatDate, formatPrice } from '@/lib/utils/format';
import { signalLabel } from '@/lib/sourcing/offers';
import type { DuplicateGroup } from '@/lib/services/sourcing-service';

/**
 * One card per contested domain, with both offers side by side.
 *
 * The same arrangement as the warning on a draft's own page, because it is
 * the same decision - but reached from a list rather than stumbled into
 * half way through an approval. Converted before compared: a publisher
 * quoting 300 GBP is dearer than one quoting 400 EUR, and the raw numbers
 * say the opposite.
 *
 * Deleting is how a domain leaves this list, and it only ever removes a
 * draft. A listing already approved from one of these is untouched, and the
 * email stays, so the same reply can be read again.
 */
export function DuplicateGroups({ groups }: { groups: DuplicateGroup[] }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  function discard(draftId: string, domain: string, fromAddress: string) {
    if (
      !window.confirm(
        `Delete the ${domain} draft from ${fromAddress || 'this sender'}? The draft is gone for good. Any listing you have already approved is not affected, and the email stays, so it can be read again.`,
      )
    ) {
      return;
    }

    startTransition(async () => {
      const outcome = await discardDraftsAction([draftId]);
      setResult(
        outcome.ok
          ? `Deleted the ${domain} draft.`
          : (outcome.error ?? 'Could not delete that draft.'),
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {result ? (
        <p role="status" className="text-[13px] text-ink-soft">
          {result}
        </p>
      ) : null}

      {groups.map((group) => (
        <Card key={group.domain}>
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>{group.domain}</CardTitle>
            <span className="text-[12px] text-muted">
              {group.offers.length} offers · {group.pending} still waiting
            </span>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="divide-y divide-line rounded-lg border border-line">
              {group.offers.map((offer) => (
                <li key={offer.draftId} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block break-all text-[13px] text-ink">
                      {offer.fromAddress || 'No sender recorded'}
                    </span>
                    <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted">
                      {offer.signal === 'owner-match' ? (
                        <Home className="h-3 w-3" aria-hidden="true" />
                      ) : offer.signal === 'free-email' ? (
                        <Mail className="h-3 w-3" aria-hidden="true" />
                      ) : (
                        <User className="h-3 w-3" aria-hidden="true" />
                      )}
                      {signalLabel(offer.signal)}
                      {offer.sentAt ? ` · ${formatDate(offer.sentAt)}` : ''}
                    </span>
                  </span>

                  <span className="tabular text-right text-[13px]">
                    {offer.cost == null ? (
                      <span className="text-muted">no price</span>
                    ) : (
                      <>
                        <span className="text-ink">
                          {offer.cost} {offer.currency ?? ''}
                        </span>
                        <span className="block text-[11px] text-muted">
                          {offer.costInBase == null
                            ? 'cannot convert'
                            : `${formatPrice(Math.round(offer.costInBase * 100))} to us`}
                        </span>
                      </>
                    )}
                  </span>

                  {offer.cheapest ? <Badge tone="positive">cheapest</Badge> : null}
                  {offer.status !== 'pending' ? (
                    <Badge tone="neutral">{offer.status}</Badge>
                  ) : null}

                  <span className="flex items-center gap-2">
                    <Link
                      href={`/admin/sourcing/drafts/${offer.draftId}`}
                      className="text-[12px] font-medium text-accent-700 hover:underline"
                    >
                      {offer.status === 'pending' ? 'Review' : 'Open'}
                    </Link>
                    {offer.status === 'pending' ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        aria-label={`Delete the ${group.domain} draft from ${offer.fromAddress}`}
                        onClick={() => discard(offer.draftId, group.domain, offer.fromAddress)}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>

            {group.note ? (
              <p className="text-[12px] leading-relaxed text-ink-soft">{group.note}</p>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
