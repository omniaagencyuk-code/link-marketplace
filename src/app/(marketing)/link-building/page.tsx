import type { Metadata } from 'next';
import { BadgeCheck, Gauge, Receipt, Workflow } from 'lucide-react';
import { LinkBuildingPage } from '@/components/link-building/link-building-page';
import { PageSections } from '@/components/cms/page-sections';
import { metadataForPage } from '@/lib/cms/metadata';
import { pageContentService } from '@/lib/services/page-content-service';
import { websiteService } from '@/lib/services';

const SLUG = "link-building";

/** Icons are fixed in code - editors change copy, not composition. */
const highlightIcons = [BadgeCheck, Gauge, Receipt, Workflow];

export async function generateMetadata(): Promise<Metadata> {
  return metadataForPage(SLUG);
}

export default async function Page() {
  const [content, preview] = await Promise.all([
    pageContentService.content(SLUG),
    websiteService.getPublicPreview(6),
  ]);

  /*
    Sections are the page; the template is what it renders until it has any.

    `extra` drew the whole template and then appended the page's sections to
    the bottom, so a hero added in the builder sat first in the section list
    and halfway down the page, under the one the template had already drawn.
  */
  return (
    <PageSections
      slug={SLUG}
      provided={{ preview: preview.rows }}
      fallback={
        /*
          Its own composition, not the shared template. `ServicePage` still
          renders the other five service pages unchanged - redesigning it
          would have redesigned them too, which is the reason /guest-posts
          has one of these as well.
        */
        <LinkBuildingPage
          content={content}
          highlightIcons={highlightIcons}
          preview={preview.rows}
          path="/link-building"
          breadcrumbLabel="Link building"
        />
      }
    />
  );
}
