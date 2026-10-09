import type { Metadata } from 'next';
import { BadgeCheck, Coins, Gauge, ShoppingBag } from 'lucide-react';
import { NicheLandingPage } from '@/components/marketing/niche-landing-page';
import { PageSections } from '@/components/cms/page-sections';
import { metadataForPage } from '@/lib/cms/metadata';
import { isPreview } from '@/lib/cms/preview';
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
  // Draft mode, and only for somebody signed in to the admin.
  const draft = await isPreview();

  // Four rows, plus the count of everything in the niche. The rows are
  // redacted on the server before they reach this component.
  const preview = await websiteService.getPublicPreview(4, NICHE);

  // The count is handed to the CMS as a token, so an editor can write
  // "{{gambling_site_count}} publishers" into any sentence on the page and
  // have it stay true as the inventory changes.
  const content = await pageContentService.content(SLUG, {
    gambling_site_count: preview.totalWebsites,
  });

  /*
    The page's own configuration, read by every section that draws the
    marketplace. Set once here rather than on each of them: the preview, the
    live count and every link out are all about the same category, and a page
    that had to be told "igaming" nine times would eventually be told it
    wrong once.
  */
  const config = {
    niche: NICHE,
    label: 'Gambling',
    path: '/gambling-link-building',
    breadcrumbParent: { label: 'Link Building', href: '/link-building' },
  };

  /*
    Sections are the page. The template below is what renders while this page
    has none - which is how the conversion stays reversible and checkable, and
    it goes when every niche page has been converted.
  */
  return (
    <PageSections
      slug={SLUG}
      // A string, formatted exactly as the accessors format it for the
      // template below, so a converted page reads the same as an unconverted one.
      tokens={{ gambling_site_count: String(preview.totalWebsites) }}
      config={config}
      // Already fetched above for the fallback, so the sections do not fetch
      // the same rows again.
      provided={{ preview: preview.rows, listingCount: preview.totalWebsites }}
      draft={draft}
      fallback={
        <NicheLandingPage
          content={content}
          preview={preview.rows}
          listingCount={preview.totalWebsites}
          highlightIcons={highlightIcons}
          path="/gambling-link-building"
          breadcrumbLabel="Gambling"
          breadcrumbParent={{ label: 'Link Building', href: '/link-building' }}
        />
      }
    />
  );
}
