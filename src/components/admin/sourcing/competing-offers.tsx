import Link from 'next/link';
import { AlertTriangle, Home, Mail, User } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatPrice } from '@/lib/utils/format';
import { offersNote, signalLabel, type RankedOffer } from '@/lib/sourcing/offers';

/**
 * The other people offering this site.
 *
 * Shown before Approve rather than after, because approving looks the
 * website up by domain and updates it - so the last approval wins and the
 * other price disappears from every screen. This is where that decision
 * gets made with both numbers visible.
 *
 * Converted before compared. A publisher quoting 300 GBP is dearer than one
 * quoting 400 EUR, and the raw numbers say the opposite.
 */
export function CompetingOffers({ offers }: { offers: RankedOffer[] }) {
  if (offers.length === 0) return null;

  const note = offersNote(offers);

  return (
    <Card className="border-warning/40">
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>
          Also offered by {offers.length === 1 ? 'someone else' : `${offers.length} others`}
        </CardTitle>
        <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-[12px] leading-relaxed text-ink-soft">
          Approving this replaces whatever the listing holds now, including its cost and contact.
          Check you are keeping the one you want.
        </p>

        <ul className="divide-y divide-line rounded-lg border border-line">
          {offers.map((offer) => (
            <li key={offer.draftId} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block break-all text-[13px] text-ink">{offer.fromAddress}</span>
                <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted">
                  {offer.signal === 'owner-match' ? (
                    <Home className="h-3 w-3" aria-hidden="true" />
                  ) : offer.signal === 'free-email' ? (
                    <Mail className="h-3 w-3" aria-hidden="true" />
                  ) : (
                    <User className="h-3 w-3" aria-hidden="true" />
                  )}
                  {signalLabel(offer.signal)}
                  {offer.status !== 'pending' ? ` · ${offer.status}` : ''}
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

              <Link
                href={`/admin/sourcing/drafts/${offer.draftId}`}
                className="text-[12px] text-accent-700 underline"
              >
                Open
              </Link>
            </li>
          ))}
        </ul>

        {note ? <p className="text-[12px] leading-relaxed text-ink-soft">{note}</p> : null}
      </CardContent>
    </Card>
  );
}
