import Link from 'next/link';
import { FileText } from 'lucide-react';
import { PageTitle } from '@/components/dashboard/page-title';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { ContentStatusBadge } from '@/components/shared/content-status-badge';
import { contentService } from '@/lib/services';
import { contentLanguageLabels, contentTypeLabels } from '@/lib/config/content';
import { formatDate, formatPrice } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

export default async function AdminContentOrdersPage() {
  const rows = await contentService.getAllItems();

  return (
    <>
      <PageTitle
        title="Content orders"
        description="Every article ordered across the marketplace. Open one to assign a writer, change status or deliver a draft."
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No content orders yet"
          description="Content orders placed by customers appear here."
        />
      ) : (
        <TableWrap>
          <Table>
            <thead>
              <Tr>
                <Th>Reference</Th>
                <Th>Customer</Th>
                <Th>Title</Th>
                <Th>Type</Th>
                <Th align="right">Words</Th>
                <Th>Language</Th>
                <Th>Writer</Th>
                <Th align="right">Price</Th>
                <Th>Ordered</Th>
                <Th>Status</Th>
              </Tr>
            </thead>
            <tbody>
              {rows.map(({ item, customerName, customerEmail, currency }) => (
                <Tr key={item.id}>
                  <Td>
                    <Link
                      href={`/admin/content-orders/${item.id}`}
                      className="font-medium text-accent-700 hover:underline"
                    >
                      {item.reference}
                    </Link>
                  </Td>
                  <Td>
                    <span className="block max-w-[10rem] truncate font-medium text-ink">
                      {customerName}
                    </span>
                    <span className="block max-w-[10rem] truncate text-[12px] text-muted">
                      {customerEmail}
                    </span>
                  </Td>
                  <Td>
                    <span className="block max-w-xs truncate">
                      {item.brief.suggestedTitle || item.brief.topic}
                    </span>
                  </Td>
                  <Td>{contentTypeLabels[item.brief.contentType]}</Td>
                  <Td align="right" className="tabular">
                    {item.brief.wordCount.toLocaleString('en-GB')}
                  </Td>
                  <Td>{contentLanguageLabels[item.brief.language]}</Td>
                  <Td className="text-muted">{item.writerName ?? 'Unassigned'}</Td>
                  <Td align="right" className="tabular">
                    {item.priceMinor > 0 ? formatPrice(item.priceMinor, { currency }) : '--'}
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
