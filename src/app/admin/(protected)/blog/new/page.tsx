import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PageTitle } from '@/components/dashboard/page-title';
import { PostEditor } from '@/components/admin/blog/post-editor';
import { MockStorageNotice } from '@/components/admin/mock-storage-notice';

export const dynamic = 'force-dynamic';

export default function NewPostPage() {
  return (
    <>
      <Link
        href="/admin/blog"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        All posts
      </Link>
      <PageTitle title="New post" description="Save it as a draft until you are ready to publish." />
      <MockStorageNotice what="Blog posts" />
      <PostEditor />
    </>
  );
}
