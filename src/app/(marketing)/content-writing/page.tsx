import type { Metadata } from 'next';
import { FileText, Languages, Search, Users } from 'lucide-react';
import { ContentWritingPage } from '@/components/content-writing/content-writing-page';
import { metadataForPage } from '@/lib/cms/metadata';
import { pageContentService } from '@/lib/services/page-content-service';
import { settingsService } from '@/lib/services';
import { isPricingConfigured, pricingTable } from '@/lib/services/content-pricing';

/**
 * Public content writing service page.
 *
 * Has its own composition rather than the shared `ServicePage` because
 * pricing is the centre of it, and prices come from settings rather than
 * from copy. That split is the point: an editor owns every word here, but
 * not the numbers - those come from the same place the order form charges
 * from, so the page cannot quote a price the checkout does not honour. When
 * no price has been configured the table shows "on request" rather than
 * inventing one.
 *
 * The route loads; `ContentWritingPage` draws. The layout used to be written
 * out here, which meant the one file that decides what the page *is* also
 * held four hundred lines of what it looks like.
 */

const SLUG = 'content-writing';

/** Icons are fixed in code - editors change copy, not composition. */
const highlightIcons = [Search, Users, FileText, Languages];

/**
 * The lengths the price table shows.
 *
 * A subset of `wordCountOptions`, which offers seven: a table of seven is a
 * wall, and these five are the round numbers a buyer thinks in. Every one of
 * them is a length the order form genuinely takes, and the price beside it
 * is `pricingTable`'s - never a figure written here.
 */
const PRICED_LENGTHS = [500, 1000, 1500, 2000, 3000] as const;

export async function generateMetadata(): Promise<Metadata> {
  return metadataForPage(SLUG);
}

export default async function Page() {
  const [content, settings] = await Promise.all([
    pageContentService.content(SLUG),
    settingsService.get(),
  ]);

  return (
    <ContentWritingPage
      content={content}
      highlightIcons={highlightIcons}
      rows={pricingTable(settings.contentPricing, PRICED_LENGTHS)}
      currency={settings.currency}
      configured={isPricingConfigured(settings.contentPricing)}
    />
  );
}
