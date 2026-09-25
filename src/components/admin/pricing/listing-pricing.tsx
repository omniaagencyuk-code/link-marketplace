'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Lock, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { setOverrideAction } from '@/app/admin/(protected)/pricing/actions';
import { currencySymbol, formatPrice } from '@/lib/utils/format';
import { acceptedNicheLabel } from '@/lib/config/accepted-niches';
import { linkTypeLabels } from '@/lib/utils/labels';
import type { LinkTypeSlug } from '@/lib/types';

export interface ListingPrice {
  linkType: string;
  niche: string;
  /** Null where the engine has not priced this yet. */
  sellMinor: number | null;
  agencyMinor: number | null;
  /** What the listing actually charges, which differs when it is an override. */
  currentMinor: number;
  isOverride: boolean;
  steps: { label: string; value: string }[];
  marginMinor: number | null;
  belowMinimum: boolean;
}

/**
 * How this listing's prices were arrived at.
 *
 * The same chain the margin report shows, on the page where somebody is
 * already looking at the listing - and with the one control that belongs
 * here rather than there: fixing a price by hand, and giving it back.
 */
export function ListingPricing({
  websiteId,
  prices,
  minMarginMinor,
  missingRates = [],
}: {
  websiteId: string;
  prices: ListingPrice[];
  minMarginMinor: number;
  /** Currencies this listing's costs are in that we have no rate for. */
  missingRates?: string[];
}) {
  const [busy, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState('');

  if (prices.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Pricing</CardTitle>
        </CardHeader>
        <CardContent className="py-6 text-[13px] text-muted">
          {missingRates.length > 0 ? (
            <span className="text-negative">
              No exchange rate for {missingRates.join(', ')}, so this listing was not priced rather
              than priced at a guess. Refresh the rates on the{' '}
              <Link href="/admin/pricing" className="underline">
                pricing page
              </Link>
              ; if the currency is not in the ECB set, set these prices by hand.
            </span>
          ) : (
            <>
              Nothing calculated for this listing. A sell price is worked out from what the
              publisher charges us, so it needs a cost first - either from the publisher inbox or
              typed into the cost fields above.
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pricing</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {missingRates.length > 0 ? (
          <p className="rounded-lg border border-line bg-surface-sunken p-2.5 text-[12px] text-negative">
            No exchange rate for {missingRates.join(', ')}. Any price in that currency is missing
            below rather than guessed at.
          </p>
        ) : null}
        {prices.map((price) => {
          const key = `${price.linkType}:${price.niche}`;
          const open = editing === key;

          return (
            <div key={key} className="border-b border-line pb-4 last:border-0 last:pb-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[13px] font-medium text-ink">
                  {linkTypeLabels[price.linkType as LinkTypeSlug] ?? price.linkType}
                  <span className="ml-1.5 font-normal text-muted">
                    {price.niche ? acceptedNicheLabel(price.niche) : 'General'}
                  </span>
                  {price.isOverride ? (
                    <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-surface-sunken px-1.5 py-0.5 text-[10px] font-normal text-muted">
                      <Lock className="h-2.5 w-2.5" aria-hidden="true" />
                      set by hand
                    </span>
                  ) : null}
                </p>
                <p className="tabular text-[15px] font-semibold text-ink">
                  {formatPrice(price.currentMinor)}
                  {price.agencyMinor != null ? (
                    <span className="ml-1.5 text-[11px] font-normal text-muted">
                      agency {formatPrice(price.agencyMinor)}
                    </span>
                  ) : null}
                </p>
              </div>

              <dl className="tabular mt-2 space-y-0.5 rounded-lg border border-line bg-surface-sunken p-2.5 text-[12px]">
                {price.steps.map((step) => (
                  <div key={step.label} className="flex justify-between gap-3">
                    <dt className="text-muted">{step.label}</dt>
                    <dd className="text-ink">{step.value}</dd>
                  </div>
                ))}
              </dl>

              {price.belowMinimum ? (
                <p className="mt-1.5 text-[12px] text-negative">
                  Margin {price.marginMinor == null ? 'unknown' : formatPrice(price.marginMinor)},
                  under the {formatPrice(minMarginMinor)} minimum
                  {price.isOverride ? ' - the cost has moved under a price set by hand.' : '.'}
                </p>
              ) : null}

              <div className="mt-2 flex flex-wrap items-center gap-2">
                {open ? (
                  <>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13px] text-muted">{currencySymbol()}</span>
                      <Input
                        type="number"
                        step="0.01"
                        min={0}
                        value={value}
                        aria-label="Price to set"
                        onChange={(event) => setValue(event.target.value)}
                        className="h-8 w-28 text-[13px]"
                      />
                    </div>
                    <Button
                      variant="accent"
                      size="sm"
                      disabled={busy || !value}
                      onClick={() =>
                        startTransition(async () => {
                          await setOverrideAction({
                            websiteId,
                            linkType: price.linkType,
                            niche: price.niche,
                            priceMinor: Math.round(Number(value) * 100),
                          });
                          setEditing(null);
                        })
                      }
                    >
                      Fix this price
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        setEditing(key);
                        setValue((price.currentMinor / 100).toFixed(2));
                      }}
                    >
                      Set by hand
                    </Button>
                    {price.isOverride ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          startTransition(async () => {
                            await setOverrideAction({
                              websiteId,
                              linkType: price.linkType,
                              niche: price.niche,
                              priceMinor: null,
                            });
                          })
                        }
                      >
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                        Give it back to the engine
                      </Button>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
