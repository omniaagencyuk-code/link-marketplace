'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { AlertCircle, Paperclip, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useOrderDraft } from '@/lib/providers/order-draft-provider';
import { formatPrice, formatTurnaround } from '@/lib/utils/format';
import { linkTypeLabels } from '@/lib/utils/labels';
import { cn } from '@/lib/utils/cn';
import type { DraftOrderItem, LinkTypeSlug, WebsiteListItem } from '@/lib/types';

/** File types a publisher can actually work with. */
const ACCEPTED_ARTICLE_TYPES = '.doc,.docx,.pdf,.txt,.rtf,.md';
const MAX_ARTICLE_BYTES = 10 * 1024 * 1024;

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * One line of the order: the placement details the publisher needs.
 *
 * Edits save to the draft as they are typed. The article is optional and only
 * its name and size are kept locally - the upload itself starts when storage
 * is connected.
 */
export function DraftOrderItemCard({
  item,
  website,
  index,
}: {
  item: DraftOrderItem;
  website?: WebsiteListItem;
  index: number;
}) {
  const { update, remove } = useOrderDraft();
  const fileInputRef = useRef<HTMLInputElement>(null);
  // A freshly added placement should read as "still to do", not as an error.
  const [targetTouched, setTargetTouched] = useState(false);

  const services = website?.services.filter((service) => service.available) ?? [];
  const service = services.find((candidate) => candidate.type === item.serviceType);
  const missingTarget = !item.targetUrl.trim();
  const fieldId = (name: string) => `${item.id}-${name}`;

  function onServiceChange(type: LinkTypeSlug) {
    const next = services.find((candidate) => candidate.type === type);
    update(item.id, { serviceType: type, priceMinor: next?.priceMinor ?? item.priceMinor });
  }

  function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_ARTICLE_BYTES) {
      update(item.id, { articleFileName: undefined, articleFileSize: undefined });
      event.target.value = '';
      window.alert('That file is larger than 10 MB. Please attach a smaller document.');
      return;
    }
    update(item.id, { articleFileName: file.name, articleFileSize: file.size });
  }

  function clearFile() {
    update(item.id, { articleFileName: undefined, articleFileSize: undefined });
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <li className="rounded-[var(--radius-card)] border border-line bg-white shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="tabular text-[11px] font-medium text-muted">{index + 1}</span>
            <Link
              href={`/websites/${item.websiteSlug}`}
              className="text-[14px] font-semibold text-ink hover:text-accent-700"
            >
              {item.websiteDomain}
            </Link>
          </div>
          {service ? (
            <p className="mt-0.5 text-[12px] text-muted">
              {formatTurnaround(service.turnaroundMinDays, service.turnaroundMaxDays)} turnaround
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-3">
          <span className="tabular text-[15px] font-semibold text-ink">
            {formatPrice(item.priceMinor)}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove ${item.websiteDomain} from your order`}
            onClick={() => remove(item.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="grid gap-4 px-4 py-4 sm:grid-cols-2">
        {services.length > 1 ? (
          <div>
            <Label htmlFor={fieldId('service')}>Service</Label>
            <Select
              id={fieldId('service')}
              value={item.serviceType}
              onChange={(event) => onServiceChange(event.target.value as LinkTypeSlug)}
              className="mt-1.5"
            >
              {services.map((candidate) => (
                <option key={candidate.id} value={candidate.type}>
                  {linkTypeLabels[candidate.type]} - {formatPrice(candidate.priceMinor)}
                </option>
              ))}
            </Select>
          </div>
        ) : (
          <div>
            <Label htmlFor={fieldId('service')}>Service</Label>
            <p id={fieldId('service')} className="mt-2 text-[14px] text-ink">
              {linkTypeLabels[item.serviceType]}
            </p>
          </div>
        )}

        <div>
          <Label htmlFor={fieldId('target')}>
            Target URL<span className="ml-0.5 text-negative">*</span>
          </Label>
          <Input
            id={fieldId('target')}
            type="url"
            required
            value={item.targetUrl}
            placeholder="https://yourdomain.com/page"
            onChange={(event) => update(item.id, { targetUrl: event.target.value })}
            onBlur={() => setTargetTouched(true)}
            aria-invalid={missingTarget && targetTouched}
            aria-describedby={missingTarget ? fieldId('target-hint') : undefined}
            className="mt-1.5"
          />
          {missingTarget ? (
            <p
              id={fieldId('target-hint')}
              className={cn(
                'mt-1 flex items-center gap-1 text-[12px]',
                targetTouched ? 'text-negative' : 'text-muted',
              )}
            >
              <AlertCircle className="h-3 w-3" aria-hidden="true" />
              Needed before you can submit
            </p>
          ) : null}
        </div>

        <div>
          <Label htmlFor={fieldId('anchor')}>Anchor text</Label>
          <Input
            id={fieldId('anchor')}
            value={item.anchorText}
            placeholder="e.g. best casino bonuses"
            onChange={(event) => update(item.id, { anchorText: event.target.value })}
            className="mt-1.5"
          />
        </div>

        <div>
          <Label htmlFor={fieldId('landing')}>Preferred landing page</Label>
          <Input
            id={fieldId('landing')}
            value={item.preferredLandingPage ?? ''}
            placeholder="Optional, a page on the publisher's site"
            onChange={(event) => update(item.id, { preferredLandingPage: event.target.value })}
            className="mt-1.5"
          />
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor={fieldId('notes')}>Notes for the publisher</Label>
          <Textarea
            id={fieldId('notes')}
            value={item.notes ?? ''}
            placeholder="Angle, brief, tone of voice or anything to avoid."
            onChange={(event) => update(item.id, { notes: event.target.value })}
            className="mt-1.5 min-h-20"
          />
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor={fieldId('article')}>Attach an article (optional)</Label>
          <p className="mt-1 text-[12px] text-muted">
            Supply your own draft, or leave this empty and the publisher will write it.
          </p>

          {item.articleFileName ? (
            <div className="mt-2 flex items-center gap-2 rounded-md border border-line bg-surface px-3 py-2">
              <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                {item.articleFileName}
              </span>
              {item.articleFileSize ? (
                <span className="tabular shrink-0 text-[12px] text-muted">
                  {formatFileSize(item.articleFileSize)}
                </span>
              ) : null}
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${item.articleFileName}`}
                onClick={clearFile}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : null}

          <input
            ref={fileInputRef}
            id={fieldId('article')}
            type="file"
            accept={ACCEPTED_ARTICLE_TYPES}
            onChange={onFileChange}
            className="mt-2 block w-full text-[13px] text-ink-soft file:mr-3 file:rounded-md file:border file:border-line-strong file:bg-white file:px-3 file:py-1.5 file:text-[13px] file:font-medium file:text-ink hover:file:border-muted-soft"
          />
        </div>
      </div>
    </li>
  );
}
