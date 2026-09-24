import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageTitle } from '@/components/dashboard/page-title';
import { WebsiteEditor } from '@/components/admin/website-editor';
import { ListingPricing, type ListingPrice } from '@/components/admin/pricing/listing-pricing';
import { Button } from '@/components/ui/button';
import { settingsService, websiteService } from '@/lib/services';
import { pricingService } from '@/lib/services/pricing-service';
import { breakdownSteps } from '@/lib/pricing/steps';

export const dynamic = 'force-dynamic';

export default async function EditWebsitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [website, settings, pricingSettings] = await Promise.all([
    websiteService.getById(id),
    settingsService.get(),
    pricingService.getSettings(),
  ]);
  if (!website) notFound();

  // Recomputed rather than read back from `price_calculations`, so the
  // breakdown shown here is what today's rules and today's exchange rate
  // would produce - not what last week's run happened to write down.
  const { rows, missingRates } = await pricingService
    .calculate(pricingSettings, [id])
    .catch(() => ({ rows: [], missingRates: [] as string[], noCurrency: [] as string[] }));

  const minMarginMinor = pricingSettings.rules.minMarginMinor;
  const prices: ListingPrice[] = rows.map((row) => {
    const b = row.breakdown;
    // An override is the price we actually charge, so it is the one the
    // margin has to be measured against. The engine's own figure would
    // flatter a hand-set price that has since been overtaken by its cost.
    const charged = row.isOverride && row.currentMinor != null ? row.currentMinor : b.sellMinor;
    const marginMinor = charged - b.trueCostMinor;

    return {
      linkType: row.linkType,
      niche: row.niche,
      sellMinor: b.sellMinor,
      agencyMinor: row.isOverride ? null : b.agencyMinor,
      currentMinor: charged,
      isOverride: row.isOverride,
      steps: breakdownSteps(b),
      marginMinor,
      belowMinimum: marginMinor < minMarginMinor,
    };
  });

  return (
    <>
      <PageTitle
        title={website.domain}
        description="Edit the listing. Changes apply to the marketplace immediately."
        action={
          <Button asChild variant="outline">
            <Link href={`/websites/${website.slug}`}>View listing</Link>
          </Button>
        }
      />
      <WebsiteEditor website={website} currency={settings.currency} />
      <div className="mt-5">
        <ListingPricing
          websiteId={website.id}
          prices={prices}
          minMarginMinor={minMarginMinor}
          missingRates={missingRates}
        />
      </div>
    </>
  );
}
