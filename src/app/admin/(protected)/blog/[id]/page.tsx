import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { PageTitle } from '@/components/dashboard/page-title';
import { PostEditor } from '@/components/admin/blog/post-editor';
import { MockStorageNotice } from '@/components/admin/mock-storage-notice';
import { blogService } from '@/lib/services/blog-service';
import { formatDateTime } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

export default async function EditPostPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const post = await blogService.getById(id);
  if (!post) notFound();

  return (
    <>
      <Link
        href="/admin/blog"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        All posts
      </Link>

      <PageTitle
        title="Edit post"
        description={`Last updated ${formatDateTime(post.updatedAt)}${post.updatedBy ? ` by ${post.updatedBy}` : ''}`}
      />

      {query.saved ? (
        <p
          role="status"
          className="mb-5 flex items-center gap-2 rounded-lg border border-accent-500/30 bg-accent-50 px-3.5 py-2.5 text-[13px] text-accent-800"
        >
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Saved.
        </p>
      ) : null}

      <MockStorageNotice what="Blog posts" />

      <PostEditor post={post} />
    </>
  );
}
