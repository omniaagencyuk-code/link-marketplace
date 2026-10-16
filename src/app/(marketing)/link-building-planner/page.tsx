import type { Metadata } from 'next';
import { ClipboardList, Coins, FileSpreadsheet, SlidersHorizontal } from 'lucide-react';
import { ServicePage } from '@/components/marketing/service-page';
import { PlannerBand } from '@/components/marketing/planner-band';
import { PageSections } from '@/components/cms/page-sections';
import { metadataForPage } from '@/lib/cms/metadata';
import { pageContentService } from '@/lib/services/page-content-service';

const SLUG = 'link-building-planner';

/** Icons are fixed in code - editors change copy, not composition. */
const highlightIcons = [ClipboardList, Coins, SlidersHorizontal, FileSpreadsheet];

export async function generateMetadata(): Promise<Metadata> {
  return metadataForPage(SLUG);
}

/**
 * The planner's public page.
 *
 * Nothing on it reaches the planner itself. It describes a feature behind a
 * signup; the one lookup the planner does is an account-keyed, rate-limited
 * read, and it is keyed on the account precisely because there is nothing to
 * key on without one.
 *
 * ## Why it reads no marketplace preview
 *
 * It did, because the shared service template draws a redacted table of real
 * listings in its `preview` band - six rows, masked, counted per request.
 * That band also lists the eight filters a buyer narrows publishers by and
 * ends in a button into the inventory, which is an argument about the
 * marketplace on a page about a planner for links bought anywhere.
 *
 * `PlannerBand` takes the slot instead: the same editable heading, the six
 * captions, and the planner filling in a row beside them. So this page makes
 * no database read of its own, and the publishers in the animation are the
 * same invented five the homepage's animation uses, on domains RFC 2606
 * reserves.
 */
export default async function Page() {
  const content = await pageContentService.content(SLUG);

  return (
    <PageSections
      slug={SLUG}
      fallback={
        <ServicePage
          content={content}
          highlightIcons={highlightIcons}
          previewBand={<PlannerBand content={content} />}
          path="/link-building-planner"
          breadcrumbLabel="Link building planner"
        />
      }
    />
  );
}
