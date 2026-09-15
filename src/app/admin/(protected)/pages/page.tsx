import Link from 'next/link';
import { ExternalLink, FileText, PencilLine } from 'lucide-react';
import { PageTitle } from '@/components/dashboard/page-title';
import { Badge } from '@/components/ui/badge';
import { MockStorageNotice } from '@/components/admin/mock-storage-notice';
import { pageContentService } from '@/lib/services/page-content-service';
import { formatDateTime } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

export default async function AdminPagesPage() {
  const pages = await pageContentService.list();

  return (
    <>
      <PageTitle
        title="Pages"
        description="Edit the copy, links and images on every public page. Layout and design stay as built."
      />

      <MockStorageNotice what="Page edits" />

      <ul className="grid gap-4 sm:grid-cols-2">
        {pages.map((page) => (
          <li
            key={page.slug}
            className="flex flex-col rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-[15px] font-semibold text-ink">{page.label}</h2>
                <p className="mt-0.5 font-mono text-[12px] text-muted">{page.path}</p>
              </div>
              {page.edited ? (
                <Badge tone="accent">Edited</Badge>
              ) : (
                <Badge tone="neutral">Original</Badge>
              )}
            </div>

            <p className="mt-3 flex-1 text-[13px] leading-relaxed text-muted">{page.description}</p>

            <p className="mt-3 flex items-center gap-1.5 text-[12px] text-muted">
              <FileText className="h-3.5 w-3.5" aria-hidden="true" />
              {page.sectionCount} editable sections
            </p>

            {page.updatedAt ? (
              <p className="mt-1 text-[12px] text-muted">
                Last edited {formatDateTime(page.updatedAt)}
                {page.updatedBy ? ` by ${page.updatedBy}` : ''}
              </p>
            ) : null}

            <div className="mt-4 flex gap-2">
              <Link
                href={`/admin/pages/${page.slug}`}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-navy-900 px-3 text-[13px] font-medium text-white hover:bg-navy-800"
              >
                <PencilLine className="h-3.5 w-3.5" aria-hidden="true" />
                Edit
              </Link>
              <Link
                href={page.path}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong px-3 text-[13px] font-medium text-ink hover:bg-surface"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                View
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
