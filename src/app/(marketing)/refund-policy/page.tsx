import type { Metadata } from 'next';
import { GuaranteePanel } from '@/components/marketing/guarantee-panel';
import { LegalPage } from '@/components/marketing/legal-page';
import { metadataForPage } from '@/lib/cms/metadata';
import { pageContentService } from '@/lib/services/page-content-service';

const SLUG = 'refund-policy';

export async function generateMetadata(): Promise<Metadata> {
  return metadataForPage(SLUG);
}

/**
 * The one legal page that renders something an editor cannot change.
 *
 * The guarantee's figures are the promise, and they are enforced in code. So
 * they come from the code rather than from the document - everything around
 * them is edited in /admin/pages like the other three.
 */
export default async function Page() {
  const content = await pageContentService.content(SLUG);
  return (
    <LegalPage
      content={content}
      breadcrumbLabel="Refund policy"
      summary={<GuaranteePanel />}
    />
  );
}
