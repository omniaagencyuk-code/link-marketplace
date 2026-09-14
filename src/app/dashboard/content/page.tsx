import type { Metadata } from 'next';
import Link from 'next/link';
import { FileText, Plus } from 'lucide-react';
import { PageTitle } from '@/components/dashboard/page-title';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { ContentStatusBadge } from '@/components/shared/content-status-badge';
import { requireCustomerSession } from '@/lib/auth/customer-access';
import { contentService } from '@/lib/services';
import { contentLanguageLabels, contentTypeLabels } from '@/lib/config/content';
import { formatDate, formatPrice } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'Content' };
export const dynamic = 'force-dynamic';

export default async function ContentDashboardPage() {
  const user = await requireCustomerSession('/dashboard/content');
  const rows = await contentService.getItemsByUser(user.id);

  return (
    <>
      <PageTitle
        title="Content"
        description="Every article you have ordered, from brief to final draft."
        action={
          <Button asChild variant="accent">
            <Link href="/dashboard/content/new">
              <Plus className="h-3.5 w-3.5" />
              Order content
            </Link>
          </Button>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No content orders yet"
          description="Order SEO articles, blog posts, guest posts or landing page copy without buying a placement."
          action={
            <Button asChild variant="accent">
              <Link href="/dashboard/content/new">Order content</Link>
            </Button>
          }
        />
      ) : (
        <TableWrap>
          <Table>
            <thead>
              <Tr>
                <Th>Order ID</Th>
                <Th>Title</Th>
                <Th align="right">Words</Th>
                <Th>Language</Th>
                <Th align="right">Price</Th>
                <Th>Ordered</Th>
                <Th>Status</Th>
              </Tr>
            </thead>
            <tbody>
              {rows.map(({ item, currency }) => (
                <Tr key={item.id}>
                  <Td>
                    <Link
                      href={`/dashboard/content/${item.id}`}
                      className="font-medium text-accent-700 hover:underline"
                    >
                      {item.reference}
                    </Link>
                  </Td>
                  <Td>
                    <span className="block max-w-xs truncate font-medium text-ink">
                      {item.brief.suggestedTitle || item.brief.topic}
                    </span>
                    <span className="block text-[12px] text-muted">
                      {contentTypeLabels[item.brief.contentType]}
                    </span>
                  </Td>
                  <Td align="right" className="tabular">
                    {item.brief.wordCount.toLocaleString('en-GB')}
                  </Td>
                  <Td>{contentLanguageLabels[item.brief.language]}</Td>
                  <Td align="right" className="tabular">
                    {item.priceMinor > 0 ? formatPrice(item.priceMinor, { currency }) : 'On request'}
                  </Td>
                  <Td>{formatDate(item.createdAt)}</Td>
                  <Td>
                    <ContentStatusBadge status={item.status} />
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
