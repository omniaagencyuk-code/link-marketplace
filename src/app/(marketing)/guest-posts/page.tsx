import type { Metadata } from 'next';
import { FileEdit, Filter, PenTool, Timer } from 'lucide-react';
import { ServicePage } from '@/components/marketing/service-page';
import { PageSections } from '@/components/cms/page-sections';
import { NicheDirectory } from '@/components/marketing/niche-directory';
import { metadataForPage } from '@/lib/cms/metadata';
import { pageContentService } from '@/lib/services/page-content-service';
import { websiteService } from '@/lib/services';

const SLUG = "guest-posts";

/** Icons are fixed in code - editors change copy, not composition. */
const highlightIcons = [Filter, PenTool, FileEdit, Timer];

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

    The niche directory sits under all of that rather than inside it. It is the
    public route into an inventory that now needs an account, so it belongs on
    this page specifically - not in the template every service page shares,
    which is why it is composed here rather than slotted into one.
  */
  return (
    <>
      <PageSections
        slug={SLUG}
        provided={{ preview: preview.rows }}
        fallback={
          <ServicePage
            content={content}
            highlightIcons={highlightIcons}
            preview={preview.rows}
            path="/guest-posts"
            breadcrumbLabel="Guest posts"
          />
        }
      />
      <NicheDirectory />
    </>
  );
}
