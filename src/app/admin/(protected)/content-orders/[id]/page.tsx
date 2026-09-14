import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, FileText } from 'lucide-react';
import { PageTitle } from '@/components/dashboard/page-title';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ContentStatusBadge } from '@/components/shared/content-status-badge';
import { contentService } from '@/lib/services';
import {
  contentLanguageLabels,
  contentStatuses,
  contentToneLabels,
  contentTypeLabels,
} from '@/lib/config/content';
import { countryName } from '@/lib/data/countries';
import { formatDate, formatDateTime } from '@/lib/utils/format';
import {
  deliverContentAction,
  replyToContentItemAction,
  updateContentItemAction,
} from '../actions';
import type { CountryCode } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * One article, from the team's side.
 *
 * Writer assignment, status, price, internal notes, delivery and the customer
 * thread. Writers do not have their own accounts yet - `writerName` is a plain
 * field so that a future `writers` table can replace it without changing the
 * order shape.
 */
export default async function AdminContentOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const row = await contentService.getItem(id);
  if (!row) notFound();

  const { item, orderReference, customerName, customerEmail } = row;
  const { brief } = item;

  const briefRows: { label: string; value: string | undefined }[] = [
    { label: 'Website / brand', value: brief.brand },
    { label: 'Topic', value: brief.topic },
    { label: 'Suggested title', value: brief.suggestedTitle },
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
    { label: 'Tone', value: contentToneLabels[brief.tone] },
    { label: 'Audience', value: brief.audience },
    { label: 'References', value: brief.references.length ? brief.references.join('\n') : undefined },
    { label: 'Instructions', value: brief.instructions },
    { label: 'Uploaded brief', value: brief.briefFileName },
  ];

  return (
    <>
      <Link
        href="/admin/content-orders"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        All content orders
      </Link>

      <PageTitle
        title={brief.suggestedTitle || brief.topic}
        description={`${item.reference} · ${orderReference} · ${customerName} (${customerEmail})`}
        action={<ContentStatusBadge status={item.status} />}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Brief</CardTitle>
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
              <CardTitle>Deliver content</CardTitle>
            </CardHeader>
            <form action={deliverContentAction}>
              <input type="hidden" name="itemId" value={item.id} />
              <CardContent className="space-y-4">
                {item.deliveries.length ? (
                  <ul className="divide-y divide-line rounded-lg border border-line">
                    {item.deliveries.map((delivery) => (
                      <li key={delivery.id} className="flex items-center gap-3 px-3 py-2.5">
                        <FileText className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium text-ink">
                            {delivery.fileName}
                          </p>
                          <p className="text-[12px] text-muted">
                            {delivery.kind === 'final' ? 'Final' : 'Draft'} &middot;{' '}
                            {formatDateTime(delivery.deliveredAt)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
                  <div>
                    <Label htmlFor="fileName">File name</Label>
                    <Input
                      id="fileName"
                      name="fileName"
                      placeholder="article-draft-1.docx"
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label htmlFor="kind">Type</Label>
                    <Select id="kind" name="kind" defaultValue="draft" className="mt-1.5">
                      <option value="draft">Draft</option>
                      <option value="final">Final</option>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label htmlFor="body">Or paste the article</Label>
                  <textarea
                    id="body"
                    name="body"
                    rows={5}
                    className="mt-1.5 w-full rounded-md border border-line-strong bg-white px-3 py-2 text-sm text-ink focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 focus:outline-none"
                  />
                  <p className="mt-1.5 text-[12px] text-muted">
                    File uploads are recorded by name only until object storage is connected.
                    Pasting the text delivers it immediately.
                  </p>
                </div>
              </CardContent>
              <CardFooter>
                <Button type="submit" variant="accent" size="sm">
                  Deliver to customer
                </Button>
              </CardFooter>
            </form>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Customer thread</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {item.messages.length === 0 ? (
                <p className="text-[13px] text-muted">No messages yet.</p>
              ) : (
                <ul className="space-y-3">
                  {item.messages.map((message) => (
                    <li
                      key={message.id}
                      className={
                        message.authorRole === 'customer'
                          ? 'rounded-lg border border-line bg-surface p-3.5'
                          : 'rounded-lg border border-accent-500/25 bg-accent-50/50 p-3.5'
                      }
                    >
                      <p className="text-[12px] font-medium text-ink-soft">
                        {message.authorName}
                        <span className="ml-2 font-normal text-muted">
                          {formatDateTime(message.createdAt)}
                        </span>
                      </p>
                      <p className="mt-1.5 text-[13px] leading-relaxed whitespace-pre-line text-ink">
                        {message.body}
                      </p>
                    </li>
                  ))}
                </ul>
              )}

              <form action={replyToContentItemAction} className="space-y-2">
                <input type="hidden" name="itemId" value={item.id} />
                <Label htmlFor="reply" className="sr-only">
                  Reply to the customer
                </Label>
                <textarea
                  id="reply"
                  name="body"
                  rows={3}
                  required
                  placeholder="Reply to the customer..."
                  className="w-full rounded-md border border-line-strong bg-white px-3 py-2 text-sm text-ink focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 focus:outline-none"
                />
                <Button type="submit" variant="primary" size="sm">
                  Send reply
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Manage</CardTitle>
            </CardHeader>
            <form action={updateContentItemAction}>
              <input type="hidden" name="itemId" value={item.id} />
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="status">Status</Label>
                  <Select id="status" name="status" defaultValue={item.status} className="mt-1.5">
                    {contentStatuses.map((status) => (
                      <option key={status.value} value={status.value}>
                        {status.label}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <Label htmlFor="writerName">Assigned writer</Label>
                  <Input
                    id="writerName"
                    name="writerName"
                    defaultValue={item.writerName ?? ''}
                    placeholder="Unassigned"
                    className="mt-1.5"
                  />
                  <p className="mt-1.5 text-[12px] text-muted">
                    Free text for now. Writer accounts are not built yet.
                  </p>
                </div>

                <div>
                  <Label htmlFor="price">Price</Label>
                  <Input
                    id="price"
                    name="price"
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue={item.priceMinor ? (item.priceMinor / 100).toFixed(2) : ''}
                    placeholder="0.00"
                    className="mt-1.5"
                  />
                </div>

                <div>
                  <Label htmlFor="internalNotes">Internal notes</Label>
                  <textarea
                    id="internalNotes"
                    name="internalNotes"
                    rows={4}
                    defaultValue={item.internalNotes ?? ''}
                    className="mt-1.5 w-full rounded-md border border-line-strong bg-white px-3 py-2 text-sm text-ink focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 focus:outline-none"
                  />
                  <p className="mt-1.5 text-[12px] text-muted">Never shown to the customer.</p>
                </div>
              </CardContent>
              <CardFooter>
                <Button type="submit" variant="accent" size="sm">
                  Save changes
                </Button>
              </CardFooter>
            </form>
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
