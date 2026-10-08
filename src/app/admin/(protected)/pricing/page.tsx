import { Suspense } from 'react';
import { AlertCircle } from 'lucide-react';
import { PageTitle } from '@/components/dashboard/page-title';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PricingRulesEditor } from '@/components/admin/pricing/pricing-rules-editor';
import { MarginReport } from '@/components/admin/pricing/margin-report';
import { pricingService, type PricingSettings } from '@/lib/services/pricing-service';
import { fxService } from '@/lib/services/fx-service';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { formatPrice } from '@/lib/utils/format';
import { staleRates } from '@/lib/pricing/rates';

export const dynamic = 'force-dynamic';

/*
  Recalculating runs inside a server action on this route, and it walks every
  listing: nine hundred of them is a few thousand reads and writes. The
  default function ceiling is nowhere near that, and a run killed half way
  leaves the inventory part priced with nothing saying which part.
*/
export const maxDuration = 300;

/**
 * Pricing.
 *
 * Two things on one page because they answer each other: the rules that make
 * every price, and what those rules actually produced. A markup band is an
 * abstraction until you can see the twelve listings it left earning nine
 * pounds.
 */
export default async function PricingPage() {
  if (!isSupabaseEnabled()) {
    return (
      <div className="space-y-5">
        <PageTitle title="Pricing" description="Sell prices, worked out from publisher costs." />
        <Card>
          <CardContent className="py-8 text-center text-[13px] text-muted">
            The database is not connected on this deployment.
          </CardContent>
        </Card>
      </div>
    );
  }

  /*
    The settings, and nothing that depends on pricing the inventory.

    `calculate()` prices every listing in the marketplace, which is the slow
    half of this page and was blocking the fast half: the rules could not be
    read, let alone edited, until twelve thousand listings had been costed.
    It moved to `<PricedInventory>` below, inside a Suspense boundary, so the
    settings arrive immediately and the report streams in behind them.

    Nothing is dropped. The figures, the margin report and both warnings are
    all still on the page and all still come from the same `calculate()`.
  */
  const [settings, rates, currenciesInUse] = await Promise.all([
    pricingService.getSettings(),
    fxService.list().catch(() => []),
    pricingService.currenciesInUse().catch(() => []),
  ]);
  const staleRateCount = staleRates(rates).length;

  return (
    <div className="space-y-5">
      <PageTitle
        title="Pricing"
        description="Sell prices are worked out from what publishers charge us. Every number below is a setting, not a constant."
      />

      {settings.reason ? (
        <Card>
          <CardContent className="flex items-start gap-2 py-4 text-[13px] text-negative">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              {settings.reason} If this mentions a missing table, migration{' '}
              <code className="rounded bg-surface-sunken px-1">0022_pricing_engine.sql</code> has
              not been run.
            </span>
          </CardContent>
        </Card>
      ) : null}

      <PricingRulesEditor
        settings={settings}
        rates={rates}
        staleRateCount={staleRateCount}
        currenciesInUse={currenciesInUse}
      />

      {/*
        Streamed, because pricing the inventory takes seconds and the rules
        above do not. The fallback is a real skeleton rather than a spinner,
        so the page does not jump when the figures land.
      */}
      <Suspense fallback={<PricedInventorySkeleton />}>
        <PricedInventory settings={settings} />
      </Suspense>
    </div>
  );
}

/**
 * Everything that needs the inventory priced.
 *
 * A component of its own so it can suspend: the rules above render from two
 * cheap reads, and this one walks every listing. Split out rather than made
 * faster, because the arithmetic is the product - it is what the page exists
 * to show - and nothing here changes how a single price is worked out.
 */
async function PricedInventory({ settings }: { settings: PricingSettings }) {
  const calculated = await pricingService
    .calculate()
    .catch(() => ({ rows: [], missingRates: [] as string[], noCurrency: [] as string[] }));

  const priced = calculated.rows;
  const belowMinimum = priced.filter(
    (row) => row.breakdown.marginMinor < settings.rules.minMarginMinor,
  );
  const overrides = priced.filter((row) => row.isOverride);
  // An override whose cost has moved underneath it: the typed price stands,
  // but it no longer clears the floor, which is exactly what the brief asks
  // to be warned about.
  const staleOverrides = overrides.filter(
    (row) =>
      row.currentMinor != null &&
      row.currentMinor - row.breakdown.trueCostMinor < settings.rules.minMarginMinor,
  );

  const totalMargin = priced.reduce((sum, row) => sum + row.breakdown.marginMinor, 0);

  // The age comes from the service, which may read a clock. A render may not.
  //
  // The base is excluded because it is never fetched - its row is written
  // once and stays. Excluding GBP instead, from when GBP was the base, meant
  // this warning counted USD and was therefore permanently on.

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-4">
        <Figure label="Prices calculated" value={String(priced.length)} />
        <Figure
          label="Total margin"
          value={formatPrice(totalMargin)}
          hint="across every calculated price"
        />
        <Figure
          label="Under the minimum"
          value={String(belowMinimum.length)}
          tone={belowMinimum.length > 0 ? 'bad' : 'good'}
        />
        <Figure
          label="Set by hand"
          value={String(overrides.length)}
          hint={staleOverrides.length > 0 ? `${staleOverrides.length} now below the minimum` : undefined}
          tone={staleOverrides.length > 0 ? 'bad' : undefined}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            Every price, thinnest margin first
            <span className="ml-2 text-[13px] font-normal text-muted">{priced.length} prices</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <MarginReport
            rows={priced.map((row) => ({
              websiteId: row.websiteId,
              domain: row.domain,
              linkType: row.linkType,
              niche: row.niche,
              isOverride: row.isOverride,
              currentMinor: row.currentMinor,
              breakdown: row.breakdown,
            }))}
            minMarginMinor={settings.rules.minMarginMinor}
          />
        </CardContent>
      </Card>

      {calculated.noCurrency.length > 0 ? (
        <Card>
          <CardContent className="flex items-start gap-2 py-4 text-[13px] text-negative">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              {calculated.noCurrency.length}{' '}
              {calculated.noCurrency.length === 1 ? 'listing has' : 'listings have'} a cost with no
              currency recorded, so {calculated.noCurrency.length === 1 ? 'it was' : 'they were'} not
              priced. A cost of 109 is not a price until we know whether the publisher meant dollars
              or pounds. Set it on each listing under &ldquo;What the publisher charges in&rdquo;:{' '}
              {calculated.noCurrency.slice(0, 8).join(', ')}
              {calculated.noCurrency.length > 8
                ? ` and ${calculated.noCurrency.length - 8} more`
                : ''}
              .
            </span>
          </CardContent>
        </Card>
      ) : null}

      {calculated.missingRates.length > 0 ? (
        <Card>
          <CardContent className="flex items-start gap-2 py-4 text-[13px] text-negative">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              No exchange rate for {calculated.missingRates.join(', ')}. Those listings were not
              priced rather than priced at a guess. Refresh the rates above; if the currency is not
              in the ECB set, set those prices by hand.
            </span>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function PricedInventorySkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((n) => (
          <Card key={n}>
            <CardContent className="py-4">
              <div className="h-3 w-24 rounded bg-surface-sunken" />
              <div className="mt-2 h-5 w-16 rounded bg-surface-sunken" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="py-10 text-center text-[13px] text-muted">
          Pricing every listing...
        </CardContent>
      </Card>
    </div>
  );
}

function Figure({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'good' | 'bad';
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-[12px] text-muted">{label}</p>
        <p
          className={`tabular mt-0.5 text-[20px] font-semibold ${
            tone === 'bad' ? 'text-negative' : tone === 'good' ? 'text-accent-700' : 'text-ink'
          }`}
        >
          {value}
        </p>
        {hint ? <p className="mt-0.5 text-[11px] text-muted">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}
