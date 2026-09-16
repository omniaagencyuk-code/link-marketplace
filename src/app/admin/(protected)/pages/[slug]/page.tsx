import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PageTitle } from '@/components/dashboard/page-title';
import { PageEditor } from '@/components/admin/cms/page-editor';
import { CustomPageSettings } from '@/components/admin/cms/custom-page-settings';
import { MockStorageNotice } from '@/components/admin/mock-storage-notice';
import { getRegisteredPage } from '@/lib/cms/registry';
import { customPageDefaults, customPageDefinition } from '@/lib/cms/custom-page';
import { pageContentService } from '@/lib/services/page-content-service';
import { customPageService } from '@/lib/services/custom-page-service';

export const dynamic = 'force-dynamic';

export default async function EditPagePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  // A page that ships in code and a page created here are edited through the
  // same form - only where the schema and defaults come from differs.
  const registered = getRegisteredPage(slug);

  if (registered) {
    const saved = await pageContentService.getOverrides(slug);

    return (
      <>
        <BackLink />
        <PageTitle title={registered.definition.label} description={registered.definition.description} />
        <MockStorageNotice what="Page edits" />
        <PageEditor
          definition={registered.definition}
          defaults={registered.defaults}
          saved={saved?.values ?? {}}
        />
      </>
    );
  }

  const custom = await customPageService.get(slug);
  if (!custom) notFound();

  return (
    <>
      <BackLink />
      <PageTitle title={custom.label} description={custom.description} />
      <MockStorageNotice what="Page edits" />

      <CustomPageSettings
        slug={custom.slug}
        label={custom.label}
        description={custom.description}
        published={custom.published}
      />

      <div className="mt-6">
        <PageEditor
          definition={customPageDefinition(custom)}
          defaults={customPageDefaults(custom.label)}
          saved={custom.values}
        />
      </div>
    </>
  );
}

function BackLink() {
  return (
    <Link
      href="/admin/pages"
      className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
      All pages
    </Link>
  );
}
