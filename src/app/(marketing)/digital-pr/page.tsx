import type { Metadata } from 'next';
import { Megaphone, Newspaper, Quote, Users } from 'lucide-react';
import { ServicePage } from '@/components/marketing/service-page';
import { metadataForPage } from '@/lib/cms/metadata';
import { pageContentService } from '@/lib/services/page-content-service';
import { websiteService } from '@/lib/services';

const SLUG = 'digital-pr';

/** Icons are fixed in code - editors change copy, not composition. */
const highlightIcons = [Newspaper, Quote, Users, Megaphone];

export async function generateMetadata(): Promise<Metadata> {
  return metadataForPage(SLUG);
}

export default async function Page() {
  const [content, preview] = await Promise.all([
    pageContentService.content(SLUG),
    websiteService.getPublicPreview(6),
  ]);

  return (
    <ServicePage
      content={content}
      highlightIcons={highlightIcons}
      preview={preview.rows}
      path="/digital-pr"
      breadcrumbLabel="Digital PR"
    />
  );
}
