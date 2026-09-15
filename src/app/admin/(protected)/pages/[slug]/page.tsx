import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PageTitle } from '@/components/dashboard/page-title';
import { PageEditor } from '@/components/admin/cms/page-editor';
import { MockStorageNotice } from '@/components/admin/mock-storage-notice';
import { getRegisteredPage } from '@/lib/cms/registry';
import { pageContentService } from '@/lib/services/page-content-service';

export const dynamic = 'force-dynamic';

export default async function EditPagePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = getRegisteredPage(slug);
  if (!page) notFound();

  const saved = await pageContentService.getOverrides(slug);

  return (
    <>
      <Link
        href="/admin/pages"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        All pages
      </Link>

      <PageTitle title={page.definition.label} description={page.definition.description} />

      <MockStorageNotice what="Page edits" />

      <PageEditor
        definition={page.definition}
        defaults={page.defaults}
        saved={saved?.values ?? {}}
      />
    </>
  );
}
