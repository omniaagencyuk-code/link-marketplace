import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PageTitle } from '@/components/dashboard/page-title';
import { NewPageForm } from '@/components/admin/cms/new-page-form';
import { MockStorageNotice } from '@/components/admin/mock-storage-notice';

export const dynamic = 'force-dynamic';

export default function NewPagePage() {
  return (
    <>
      <Link
        href="/admin/pages"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        All pages
      </Link>

      <PageTitle
        title="New page"
        description="Creates a page using the same layout as the service pages. It starts as a draft, with placeholder copy you then replace."
      />

      <MockStorageNotice what="Pages" />

      <NewPageForm />
    </>
  );
}
