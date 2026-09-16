import type { Metadata } from 'next';
import { LegalPage } from '@/components/marketing/legal-page';
import { metadataForPage } from '@/lib/cms/metadata';
import { pageContentService } from '@/lib/services/page-content-service';

const SLUG = 'terms';

export async function generateMetadata(): Promise<Metadata> {
  return metadataForPage(SLUG);
}

export default async function Page() {
  const content = await pageContentService.content(SLUG);
  return <LegalPage content={content} breadcrumbLabel="Terms of service" />;
}
