import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Download, FileText } from 'lucide-react';
import { PageTitle } from '@/components/dashboard/page-title';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ContentStatusBadge } from '@/components/shared/content-status-badge';
import { ContentConversation } from '@/components/content/content-conversation';
import { requireCustomerSession } from '@/lib/auth/customer-access';
import { contentService } from '@/lib/services';
import { contentLanguageLabels, contentToneLabels, contentTypeLabels } from '@/lib/config/content';
import { countryName } from '@/lib/data/countries';
import { formatDate, formatDateTime, formatPrice } from '@/lib/utils/format';
import type { CountryCode } from '@/lib/types';

export const metadata: Metadata = { title: 'Content order' };
export const dynamic = 'force-dynamic';

export default async function ContentOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireCustomerSession(`/dashboard/content/${id}`);

  // Scoped to this customer at the service boundary, so another account's
  // article is "not found" rather than merely hidden.
  const row = await contentService.getItem(id, user.id);
  if (!row) notFound();

  const { item, orderReference, currency } = row;
  const { brief } = item;

  const briefRows: { label: string; value: string | undefined }[] = [
    { label: 'Website / brand', value: brief.brand },
    { label: 'Content type', value: contentTypeLabels[brief.contentType] },
    { label: 'Word count', value: `${brief.wordCount.toLocaleString('en-GB')} words` },
    { label: 'Target keyword', value: brief.targetKeyword },
    {
      label: 'Secondary keywords',
      value: brief.secondaryKeywords.length ? brief.secondaryKeywords.join(', ') : undefined,
    },
    { label: 'Target URL', value: brief.targetUrl },
    { label: 'Anchor text', value: brief.anchorText },
    { label: 'Language', value: contentLanguageLabels[brief.language] },
    { label: 'Country', value: brief.country ? countryName(brief.country as CountryCode) : undefined },
    { label: 'Tone of voice', value: contentToneLabels[brief.tone] },
    { label: 'Audience', value: brief.audience },
    { label: 'References', value: brief.references.length ? brief.references.join('\n') : undefined },
    { label: 'Instructions', value: brief.instructions },
    { label: 'Uploaded brief', value: brief.briefFileName },
  ];

  return (
    <>
      <Link
        href="/dashboard/content"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        All content
      </Link>

      <PageTitle
        title={brief.suggestedTitle || brief.topic}
        description={`${item.reference} · part of order ${orderReference} · ordered ${formatDate(item.createdAt)}`}
        action={<ContentStatusBadge status={item.status} />}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Original brief</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="divide-y divide-line">
                {briefRows
                  .filter((entry) => entry.value)
                  .map((entry) => (
                    <div key={entry.label} className="grid gap-1 py-2.5 sm:grid-cols-[11rem_1fr]">
                      <dt className="text-[13px] text-muted">{entry.label}</dt>
                      <dd className="text-[13px] leading-relaxed whitespace-pre-line text-ink">
                        {entry.value}
                      </dd>
                    </div>
                  ))}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Drafts and final article</CardTitle>
            </CardHeader>
            <CardContent>
              {item.deliveries.length === 0 ? (
                <p className="text-[13px] text-muted">
                  Nothing delivered yet. You will get an update here when the first draft is ready.
                </p>
              ) : (
                <ul className="divide-y divide-line">
                  {item.deliveries.map((delivery) => (
                    <li key={delivery.id} className="flex items-center gap-3 py-3">
                      <FileText className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-ink">
                          {delivery.fileName}
                        </p>
                        <p className="text-[12px] text-muted">
                          {delivery.kind === 'final' ? 'Final article' : 'Draft'} &middot;{' '}
                          {formatDateTime(delivery.deliveredAt)}
                        </p>
                      </div>
                      <Button variant="outline" size="sm" disabled title="File downloads are not connected yet">
                        <Download className="h-3.5 w-3.5" />
                        Download
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <ContentConversation
            itemId={item.id}
            messages={item.messages}
            status={item.status}
          />
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-[13px]">
              <Row label="Reference" value={item.reference} />
              <Row label="Order" value={orderReference} />
              <Row
                label="Price"
                value={item.priceMinor > 0 ? formatPrice(item.priceMinor, { currency }) : 'On request'}
              />
              <Row label="Ordered" value={formatDate(item.createdAt)} />
              <Row label="Last update" value={formatDate(item.updatedAt)} />
            </CardContent>
          </Card>

          {item.revisions.length ? (
            <Card>
              <CardHeader>
                <CardTitle>Revision requests</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {item.revisions.map((revision) => (
                    <li key={revision.id} className="rounded-lg border border-line bg-surface p-3">
                      <p className="text-[12px] text-muted">
                        {formatDate(revision.requestedAt)}
                        {revision.resolvedAt ? ' · resolved' : ' · open'}
                      </p>
                      <p className="mt-1 text-[13px] leading-relaxed text-ink">{revision.notes}</p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </aside>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="text-right font-medium text-ink">{value}</span>
    </div>
  );
}
