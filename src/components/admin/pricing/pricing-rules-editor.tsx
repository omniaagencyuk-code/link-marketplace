'use client';

import { useState, useTransition } from 'react';
import { AlertTriangle, Calculator, Check, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  previewRulesAction,
  recalculateAction,
  refreshRatesAction,
  saveRulesAction,
} from '@/app/admin/(protected)/pricing/actions';
import { formatPrice } from '@/lib/utils/format';
import type { PricingSettings } from '@/lib/services/pricing-service';
import type { PricingRules } from '@/lib/pricing/engine';
import type { FxRate } from '@/lib/services/fx-service';

type Preview = Awaited<ReturnType<typeof previewRulesAction>>;

/**
 * The rules, and what changing them would do.
 *
 * Nothing saves without a preview first. Editing a markup band is a decision
 * about several hundred prices at once, and the difference between "60 to 55"
 * and "every placement drops nineteen pounds" is the difference between a
 * number and a decision.
 */
export function PricingRulesEditor({
  settings,
  rates,
  staleRateCount,
  currenciesInUse = [],
}: {
  settings: PricingSettings;
  rates: FxRate[];
  /** Counted on the server: the clock is not something a render may read. */
  staleRateCount: number;
  /** What our publishers actually charge in, commonest first. */
  currenciesInUse?: { currency: string; listings: number }[];
}) {
  const [draft, setDraft] = useState<PricingRules>(settings.rules);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  const [showAllRates, setShowAllRates] = useState(false);

  // GBP is in the table as a fixed 1 and is not a conversion anyone needs to
  // read, but a publisher who charges in it is still worth counting.
  const rateFor = new Map(rates.map((rate) => [rate.currency, rate.rateToGbp]));
  const inUse = currenciesInUse.map((entry) => ({
    ...entry,
    rateToGbp: entry.currency === 'GBP' ? 1 : (rateFor.get(entry.currency) ?? null),
  }));
  const missingInUse = inUse.filter((entry) => entry.rateToGbp == null).map((e) => e.currency);
  const usedCodes = new Set(currenciesInUse.map((entry) => entry.currency));
  const otherRates = rates.filter(
    (rate) => rate.currency !== 'GBP' && !usedCodes.has(rate.currency),
  );

  const edited = JSON.stringify(draft) !== JSON.stringify(settings.rules);

  function set<K extends keyof PricingRules>(key: K, value: PricingRules[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setPreview(null);
  }

  const money = (key: keyof PricingRules, label: string, hint?: string) => (
    <div>
      <Label htmlFor={key}>{label}</Label>
      <div className="mt-1.5 flex items-center gap-1.5">
        <span className="text-[13px] text-muted">£</span>
        <Input
          id={key}
          type="number"
          step="0.01"
          min={0}
          value={(Number(draft[key]) / 100).toString()}
          onChange={(event) =>
            set(key, Math.round(Number(event.target.value || 0) * 100) as PricingRules[K_ANY])
          }
        />
      </div>
      {hint ? <p className="mt-1 text-[11px] leading-snug text-muted">{hint}</p> : null}
    </div>
  );

  const percent = (key: keyof PricingRules, label: string, hint?: string) => (
    <div>
      <Label htmlFor={key}>{label}</Label>
      <div className="mt-1.5 flex items-center gap-1.5">
        <Input
          id={key}
          type="number"
          step="0.1"
          min={0}
          value={String(draft[key])}
          onChange={(event) => set(key, Number(event.target.value || 0) as PricingRules[K_ANY])}
        />
        <span className="text-[13px] text-muted">%</span>
      </div>
      {hint ? <p className="mt-1 text-[11px] leading-snug text-muted">{hint}</p> : null}
    </div>
  );

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>The rules</CardTitle>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() =>
              startTransition(async () => {
                const result = await refreshRatesAction();
                setMessage(
                  result.error
                    ? result.error
                    : `${result.updated} rates updated. ${
                        result.moved.length
                          ? `${result.moved.length} moved more than 2% and were repriced.`
                          : 'Nothing moved enough to reprice.'
                      }`,
                );
              })
            }
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Refresh rates
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() =>
              startTransition(async () => {
                const result = await recalculateAction();
                setMessage(
                  `Repriced ${result.priced}. ${result.skippedOverrides} left alone as overrides.`,
                );
              })
            }
          >
            <Calculator className="h-3.5 w-3.5" aria-hidden="true" />
            Recalculate all
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {percent(
            'fxBufferPct',
            'FX buffer',
            'Added to every conversion. Rates move between today and the day we pay.',
          )}
          {money('minMarginMinor', 'Minimum margin', 'No placement sells for less than this over its true cost.')}
          {percent(
            'agencyDiscountPoints',
            'Agency discount',
            'Points off the markup percentage, not off the price. 60% becomes 50%.',
          )}
          {percent('paypalFeePct', 'PayPal fee')}
          {money('paypalFeeFixedMinor', 'PayPal fixed fee')}
          {percent('cryptoFeePct', 'Crypto fee')}
          {percent('bankFeePct', 'Bank transfer fee')}
          {money('bankFeeFixedMinor', 'Bank fixed fee')}

          <div>
            <Label htmlFor="vatReclaimable">Publisher VAT</Label>
            <label className="mt-2 flex items-start gap-2 text-[13px] text-ink">
              <input
                id="vatReclaimable"
                type="checkbox"
                checked={draft.vatReclaimable}
                onChange={(event) => set('vatReclaimable', event.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[var(--color-accent-600)]"
              />
              <span>
                We reclaim it
                <span className="mt-0.5 block text-[11px] leading-snug text-muted">
                  Off means VAT a publisher charges us is a real cost and is priced in. Confirm
                  with your accountant before turning this on - it lowers every affected price.
                </span>
              </span>
            </label>
          </div>
        </div>

        {/* ------------------------------------------------- bands, read only */}
        <div className="border-t border-line pt-4">
          <p className="mb-2 text-[13px] font-medium text-ink">Markup bands</p>
          <ul className="space-y-1 text-[13px] text-ink-soft">
            {settings.bands.map((band, index) => {
              const next = settings.bands[index + 1];
              return (
                <li key={band.minCostMinor} className="tabular flex justify-between gap-3">
                  <span>
                    {formatPrice(band.minCostMinor)}
                    {next ? ` to ${formatPrice(next.minCostMinor - 1)}` : ' and above'}
                  </span>
                  <span className="font-medium text-ink">
                    {band.flatMinor != null ? `+${formatPrice(band.flatMinor)}` : `+${band.markupPct}%`}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-1.5 text-[11px] text-muted">
            Bands are rows in <code>pricing_bands</code>. Editing them here is the next thing worth
            building; for now they change in the database and take effect on the next recalculation.
          </p>
        </div>

        {/* ---------------------------------------------------------- rates */}
        <div className="border-t border-line pt-4">
          <p className="mb-2 text-[13px] font-medium text-ink">Exchange rates</p>
          {rates.length === 0 ? (
            <p className="text-[13px] text-muted">
              No rates stored yet. Press Refresh rates, or wait for the 02:00 job.
            </p>
          ) : (
            <>
              {/* The currencies we actually pay in come first and are named
                  as such. Sorted alphabetically and cut off at sixteen, this
                  panel could not show USD at all - which reads exactly like a
                  missing rate when the rate is sitting in the table. */}
              {inUse.length > 0 ? (
                <ul className="tabular mb-3 grid grid-cols-1 gap-x-6 gap-y-1 text-[12px] sm:grid-cols-2">
                  {inUse.map((entry) => (
                    <li
                      key={entry.currency}
                      className="flex items-baseline justify-between gap-2 rounded bg-surface-sunken px-2 py-1"
                    >
                      <span className="text-ink">
                        {entry.currency}
                        <span className="ml-1.5 text-[11px] text-muted">
                          {entry.listings} {entry.listings === 1 ? 'listing' : 'listings'}
                        </span>
                      </span>
                      {entry.rateToGbp == null ? (
                        <span className="text-[11px] font-medium text-negative">no rate</span>
                      ) : (
                        <span className="text-ink">{entry.rateToGbp.toFixed(4)}</span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : null}

              <button
                type="button"
                onClick={() => setShowAllRates((open) => !open)}
                aria-expanded={showAllRates}
                className="text-[12px] text-accent-700 hover:underline"
              >
                {showAllRates ? 'Hide' : `Show all ${otherRates.length} other rates`}
              </button>

              {showAllRates ? (
                <ul className="tabular mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-[12px] sm:grid-cols-4">
                  {otherRates.map((rate) => (
                    <li key={rate.currency} className="flex justify-between gap-2">
                      <span className="text-muted">{rate.currency}</span>
                      <span className="text-ink">{rate.rateToGbp.toFixed(4)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}

              {missingInUse.length > 0 ? (
                <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-snug text-negative">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                  No rate for {missingInUse.join(', ')}, so those listings are not priced at all and
                  cannot be published. Press Refresh rates; if it stays missing, the currency is not
                  in the ECB set and those prices need setting by hand.
                </p>
              ) : null}
            </>
          )}
          {staleRateCount > 0 ? (
            <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-negative">
              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
              {staleRateCount} rates are more than three days old. Check the 02:00 cron ran.
            </p>
          ) : null}
        </div>

        {/* -------------------------------------------------------- preview */}
        {preview ? (
          <div className="rounded-lg border border-line bg-surface-sunken p-3">
            <p className="text-[13px] font-medium text-ink">
              {preview.changed} of {preview.total} prices would change
            </p>
            {preview.changed > 0 ? (
              <ul className="tabular mt-1.5 space-y-0.5 text-[12px] text-ink-soft">
                <li>Average move {formatPrice(preview.averageMoveMinor)}</li>
                <li>
                  Largest: {preview.largest.domain} {formatPrice(preview.largest.fromMinor)} to{' '}
                  {formatPrice(preview.largest.toMinor)} (
                  {preview.largest.moveMinor > 0 ? '+' : ''}
                  {formatPrice(preview.largest.moveMinor)})
                </li>
                {preview.belowMinimum > 0 ? (
                  <li className="text-negative">
                    {preview.belowMinimum} would sit under the minimum margin
                  </li>
                ) : null}
              </ul>
            ) : (
              <p className="mt-1 text-[12px] text-muted">Nothing moves. Safe to save.</p>
            )}
          </div>
        ) : null}

        {message ? (
          <p role="status" className="flex items-start gap-1.5 text-[13px] text-ink-soft">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-700" aria-hidden="true" />
            {message}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <Button
            variant="outline"
            disabled={busy || !edited}
            onClick={() =>
              startTransition(async () => {
                setMessage(null);
                setPreview(await previewRulesAction(draft));
              })
            }
          >
            Preview the change
          </Button>
          <Button
            variant="accent"
            // Nothing saves unseen: the preview is the consent.
            disabled={busy || !edited || !preview}
            onClick={() =>
              startTransition(async () => {
                const result = await saveRulesAction(draft);
                setPreview(null);
                setMessage(
                  `Saved and repriced ${result.priced}. ${result.skippedOverrides} left alone as overrides.`,
                );
              })
            }
          >
            Save and reprice
          </Button>
          {edited && !preview ? (
            <span className="text-[12px] text-muted">Preview first - this moves live prices.</span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

/** Lets the generic field helpers assign back into the rules object. */
type K_ANY = keyof PricingRules;
