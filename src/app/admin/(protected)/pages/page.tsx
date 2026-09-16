import Link from 'next/link';
import { ExternalLink, FileText, PencilLine, Plus } from 'lucide-react';
import { PageTitle } from '@/components/dashboard/page-title';
import { Badge } from '@/components/ui/badge';
import { MockStorageNotice } from '@/components/admin/mock-storage-notice';
import { pageContentService } from '@/lib/services/page-content-service';
import { customPageService } from '@/lib/services/custom-page-service';
import { customPageDefinition } from '@/lib/cms/custom-page';
import { formatDateTime } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

interface PageCard {
  slug: string;
  label: string;
  path: string;
  description: string;
  sectionCount: number;
  badge: { tone: 'accent' | 'neutral' | 'coral'; text: string };
  updatedAt?: string;
  updatedBy?: string;
  /** Draft pages have no public URL to open yet. */
  viewable: boolean;
}

function Card({ page }: { page: PageCard }) {
  return (
    <li className="flex flex-col rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-ink">{page.label}</h3>
          <p className="mt-0.5 font-mono text-[12px] text-muted">{page.path}</p>
        </div>
        <Badge tone={page.badge.tone}>{page.badge.text}</Badge>
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
        {page.viewable ? (
          <Link
            href={page.path}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong px-3 text-[13px] font-medium text-ink hover:bg-surface"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            View
          </Link>
        ) : null}
      </div>
    </li>
  );
}

export default async function AdminPagesPage() {
  const [builtIn, custom] = await Promise.all([
    pageContentService.list(),
    customPageService.listAll(),
  ]);

  const builtInCards: PageCard[] = builtIn.map((page) => ({
    slug: page.slug,
    label: page.label,
    path: page.path,
    description: page.description,
    sectionCount: page.sectionCount,
    badge: page.edited
      ? { tone: 'accent' as const, text: 'Edited' }
      : { tone: 'neutral' as const, text: 'Original' },
    updatedAt: page.updatedAt,
    updatedBy: page.updatedBy,
    viewable: true,
  }));

  const customCards: PageCard[] = custom.map((page) => ({
    slug: page.slug,
    label: page.label,
    path: page.path,
    description: page.description,
    sectionCount: customPageDefinition(page).sections.length,
    badge: page.published
      ? { tone: 'accent' as const, text: 'Published' }
      : { tone: 'coral' as const, text: 'Draft' },
    updatedAt: page.updatedAt,
    updatedBy: page.updatedBy,
    viewable: page.published,
  }));

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageTitle
          title="Pages"
          description="Edit the copy, links and images on every public page. Layout and design stay as built."
        />
        <Link
          href="/admin/pages/new"
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-navy-900 px-4 text-[13px] font-medium text-white hover:bg-navy-800"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          New page
        </Link>
      </div>

      <MockStorageNotice what="Page edits" />

      <ul className="grid gap-4 sm:grid-cols-2">
        {builtInCards.map((page) => (
          <Card key={page.slug} page={page} />
        ))}
      </ul>

      <section className="mt-10">
        <h2 className="text-[15px] font-semibold text-ink">Your pages</h2>
        <p className="mt-1 text-[13px] text-muted">
          Pages created here. They use the same layout as the service pages above and live at the
          top level of the site, e.g. <span className="font-mono">/broken-link-building</span>.
        </p>

        {customCards.length ? (
          <ul className="mt-5 grid gap-4 sm:grid-cols-2">
            {customCards.map((page) => (
              <Card key={page.slug} page={page} />
            ))}
          </ul>
        ) : (
          <div className="mt-5 rounded-[var(--radius-card)] border border-dashed border-line-strong bg-surface p-8 text-center">
            <p className="text-[14px] text-muted">
              No pages yet. Create one to add a landing page for a service, a location or a
              campaign.
            </p>
            <Link
              href="/admin/pages/new"
              className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-md bg-navy-900 px-4 text-[13px] font-medium text-white hover:bg-navy-800"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              New page
            </Link>
          </div>
        )}
      </section>
    </>
  );
}
