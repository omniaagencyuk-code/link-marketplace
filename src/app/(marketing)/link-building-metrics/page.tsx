import type { Metadata } from 'next';
import { MetricsPage } from '@/components/marketing/metrics-page';
import { metadataForPage } from '@/lib/cms/metadata';
import { pageContentService } from '@/lib/services/page-content-service';

const SLUG = 'link-building-metrics';

export async function generateMetadata(): Promise<Metadata> {
  return metadataForPage(SLUG);
}

export default async function Page() {
  const content = await pageContentService.content(SLUG);
  return <MetricsPage content={content} />;
}
