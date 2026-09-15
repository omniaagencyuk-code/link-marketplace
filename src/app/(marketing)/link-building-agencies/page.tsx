import type { Metadata } from 'next';
import { Building2, FileSpreadsheet, Layers, Wallet } from 'lucide-react';
import { ServicePage } from '@/components/marketing/service-page';
import { metadataForPage } from '@/lib/cms/metadata';
import { pageContentService } from '@/lib/services/page-content-service';
import { websiteService } from '@/lib/services';

const SLUG = 'link-building-agencies';

/** Icons are fixed in code - editors change copy, not composition. */
const highlightIcons = [Layers, Wallet, FileSpreadsheet, Building2];

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
      path="/link-building-agencies"
      breadcrumbLabel="For agencies"
    />
  );
}
