import type { Metadata } from 'next';
import { BadgeCheck, Coins, Gauge, ShoppingBag } from 'lucide-react';
import { NicheLandingPage } from '@/components/marketing/niche-landing-page';
import { metadataForPage } from '@/lib/cms/metadata';
import { pageContentService } from '@/lib/services/page-content-service';
import { websiteService } from '@/lib/services';
import type { NicheSlug } from '@/lib/types';

const SLUG = 'gambling-link-building';

/**
 * The marketplace category this page is about.
 *
 * Everything on the page - the preview rows, the live count and every link
 * out - is scoped to this one slug, so the page cannot drift from the
 * marketplace it sends people to.
 */
const NICHE: NicheSlug = 'igaming';

/** Icons are fixed in code - editors change copy, not composition. */
const highlightIcons = [BadgeCheck, Gauge, Coins, ShoppingBag];

export async function generateMetadata(): Promise<Metadata> {
  return metadataForPage(SLUG);
}

export default async function Page() {
  // Four rows, plus the count of everything in the niche. The rows are
  // redacted on the server before they reach this component.
  const preview = await websiteService.getPublicPreview(4, NICHE);

  // The count is handed to the CMS as a token, so an editor can write
  // "{{gambling_site_count}} publishers" into any sentence on the page and
  // have it stay true as the inventory changes.
  const content = await pageContentService.content(SLUG, {
    gambling_site_count: preview.totalWebsites,
  });

  return (
    <NicheLandingPage
      content={content}
      preview={preview.rows}
      listingCount={preview.totalWebsites}
      highlightIcons={highlightIcons}
      path="/gambling-link-building"
      breadcrumbLabel="Gambling"
      breadcrumbParent={{ label: 'Link Building', href: '/link-building' }}
    />
  );
}
