import type { Metadata } from 'next';
import { GuestPostsPage } from '@/components/marketing/guest-posts-page';
import { PageSections } from '@/components/cms/page-sections';
import { NicheDirectory } from '@/components/marketing/niche-directory';
import { metadataForPage } from '@/lib/cms/metadata';
import { pageContentService } from '@/lib/services/page-content-service';
import { websiteService } from '@/lib/services';

const SLUG = "guest-posts";

export async function generateMetadata(): Promise<Metadata> {
  return metadataForPage(SLUG);
}

export default async function Page() {
  const [content, preview] = await Promise.all([
    pageContentService.content(SLUG),
    websiteService.getPublicPreview(6),
  ]);

  /*
    Sections are the page; the composition below is what it renders until it
    has any.

    `GuestPostsPage` rather than the shared `ServicePage`, which still renders
    /link-building, /niche-edits, /digital-pr and /link-building-agencies
    exactly as it did. This page got its own composition because redesigning
    the template would have redesigned five pages, four of which nobody asked
    about.

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
        fallback={<GuestPostsPage content={content} preview={preview.rows} />}
      />
      <NicheDirectory />
    </>
  );
}
