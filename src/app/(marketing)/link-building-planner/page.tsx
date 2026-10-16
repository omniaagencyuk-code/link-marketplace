import type { Metadata } from 'next';
import { ClipboardList, Coins, FileSpreadsheet, SlidersHorizontal } from 'lucide-react';
import { ServicePage } from '@/components/marketing/service-page';
import { PageSections } from '@/components/cms/page-sections';
import { metadataForPage } from '@/lib/cms/metadata';
import { pageContentService } from '@/lib/services/page-content-service';
import { websiteService } from '@/lib/services';

const SLUG = 'link-building-planner';

/** Icons are fixed in code - editors change copy, not composition. */
const highlightIcons = [ClipboardList, Coins, SlidersHorizontal, FileSpreadsheet];

export async function generateMetadata(): Promise<Metadata> {
  return metadataForPage(SLUG);
}

/**
 * The planner's public page.
 *
 * The preview rows are read here for the same reason the other service pages
 * read them: the section is only drawn when the route hands it something, so
 * a heading an editor can change has to have a table under it. They are the
 * redacted shape - no real domain reaches the page - and they are counted
 * per request rather than quoted from this file.
 *
 * Nothing on this page reaches the planner itself. It describes a feature
 * behind a signup; the one lookup the planner does is an account-keyed,
 * rate-limited read, and it is keyed on the account precisely because there
 * is nothing to key on without one.
 */
export default async function Page() {
  const [content, preview] = await Promise.all([
    pageContentService.content(SLUG),
    websiteService.getPublicPreview(6),
  ]);

  return (
    <PageSections
      slug={SLUG}
      provided={{ preview: preview.rows }}
      fallback={
        <ServicePage
          content={content}
          highlightIcons={highlightIcons}
          preview={preview.rows}
          path="/link-building-planner"
          breadcrumbLabel="Link building planner"
        />
      }
    />
  );
}
