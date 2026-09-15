import Link from 'next/link';
import { ExternalLink, FileText, Plus } from 'lucide-react';
import { PageTitle } from '@/components/dashboard/page-title';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { MockStorageNotice } from '@/components/admin/mock-storage-notice';
import { DeletePostButton } from '@/components/admin/blog/delete-post-button';
import { blogService } from '@/lib/services/blog-service';
import { categoryName, postStatusLabels } from '@/lib/config/blog';
import { formatDate } from '@/lib/utils/format';
import type { PostStatus } from '@/lib/types/blog';

export const dynamic = 'force-dynamic';

const statusTones: Record<PostStatus, BadgeTone> = {
  draft: 'neutral',
  scheduled: 'warning',
  published: 'positive',
};

export default async function AdminBlogPage() {
  const posts = await blogService.listAll();

  return (
    <>
      <PageTitle
        title="Blog"
        description="Write, edit, schedule and delete posts. Published posts appear on /resources."
        action={
          <Button asChild variant="accent">
            <Link href="/admin/blog/new">
              <Plus className="h-3.5 w-3.5" />
              New post
            </Link>
          </Button>
        }
      />

      <MockStorageNotice what="Blog posts" />

      {posts.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No posts yet"
          description="Write your first article and it will appear on the resources page."
          action={
            <Button asChild variant="accent">
              <Link href="/admin/blog/new">Write a post</Link>
            </Button>
          }
        />
      ) : (
        <TableWrap>
          <Table>
            <thead>
              <Tr>
                <Th>Title</Th>
                <Th>Category</Th>
                <Th>Author</Th>
                <Th>Date</Th>
                <Th>Status</Th>
                <Th align="right">Actions</Th>
              </Tr>
            </thead>
            <tbody>
              {posts.map((post) => (
                <Tr key={post.id}>
                  <Td>
                    <Link
                      href={`/admin/blog/${post.id}`}
                      className="block max-w-sm truncate font-medium text-accent-700 hover:underline"
                    >
                      {post.title}
                    </Link>
                    <span className="block max-w-sm truncate font-mono text-[11px] text-muted">
                      /resources/{post.slug}
                    </span>
                  </Td>
                  <Td>{categoryName(post.category)}</Td>
                  <Td className="text-muted">{post.author}</Td>
                  <Td>{formatDate(post.publishedAt)}</Td>
                  <Td>
                    <Badge tone={statusTones[post.status]}>{postStatusLabels[post.status]}</Badge>
                  </Td>
                  <Td align="right">
                    <div className="flex items-center justify-end gap-1">
                      {post.status === 'published' ? (
                        <Link
                          href={`/resources/${post.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`View ${post.title}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-sunken hover:text-ink"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      ) : null}
                      <DeletePostButton id={post.id} title={post.title} />
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </>
  );
}
