'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ExternalLink, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { deliverItemAction, resolveIssueAction } from '@/app/admin/actions';
import { formatDateTime } from '@/lib/utils/format';
import type { OrderItem } from '@/lib/types';

/**
 * Handing one placement back, and answering a complaint about it.
 *
 * The URL box and the button are one control rather than a field that saves
 * on blur: sending a customer to look at a page is a thing you do on purpose,
 * and a URL half-typed into an autosaving field would do it by accident.
 *
 * Redelivering after a complaint is the same button. It puts the placement
 * back in front of the customer with a fresh review window, which is the
 * ordinary ending of a problem that we fixed.
 */
export function AdminItemDelivery({ item, orderId }: { item: OrderItem; orderId: string }) {
  const router = useRouter();
  const [url, setUrl] = useState(item.liveUrl ?? '');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const openIssue = item.issues?.find((issue) => !issue.resolvedAt);
  const delivered = Boolean(item.deliveredAt);

  return (
    <div className="mt-4 space-y-3 border-t border-line pt-4">
      {openIssue ? (
        <div className="rounded-lg border border-line bg-surface-sunken p-3">
          <p className="text-[12px] font-medium text-negative">
            The customer reported a problem on {formatDateTime(openIssue.createdAt)}
          </p>
          <p className="mt-1 text-[13px] whitespace-pre-wrap text-ink">{openIssue.message}</p>

          <Label htmlFor={`note_${item.id}`} className="mt-3 block">
            What you did about it
          </Label>
          <Textarea
            id={`note_${item.id}`}
            value={note}
            maxLength={1000}
            placeholder="e.g. Publisher changed the link to dofollow."
            onChange={(event) => setNote(event.target.value)}
            className="mt-1.5 text-[13px]"
          />
          <p className="mt-1 text-[11px] text-muted">
            The customer sees this. Resolving it does not approve the placement - only they can do
            that.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            disabled={busy || note.trim().length === 0}
            onClick={() =>
              startTransition(async () => {
                await resolveIssueAction(openIssue.id, orderId, note);
                setNote('');
                router.refresh();
              })
            }
          >
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            Mark it sorted
          </Button>
        </div>
      ) : null}

      <div>
        <Label htmlFor={`live_${item.id}`}>Live URL</Label>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <Input
            id={`live_${item.id}`}
            value={url}
            inputMode="url"
            placeholder="https://publisher.example/the-article"
            onChange={(event) => setUrl(event.target.value)}
            className="min-w-56 flex-1 text-[13px]"
          />
          <Button
            variant="accent"
            size="sm"
            disabled={busy || url.trim().length === 0 || url.trim() === (item.liveUrl ?? '')}
            onClick={() =>
              startTransition(async () => {
                const result = await deliverItemAction(item.id, orderId, url);
                setError(result.ok ? null : (result.error ?? 'That did not save.'));
                if (result.ok) router.refresh();
              })
            }
          >
            <Send className="h-3.5 w-3.5" aria-hidden="true" />
            {delivered ? 'Send again' : 'Send to customer'}
          </Button>
        </div>
        {error ? <p className="mt-1 text-[12px] text-negative">{error}</p> : null}

        <p className="mt-1 text-[12px] text-muted">
          {delivered ? (
            <>
              Sent {formatDateTime(item.deliveredAt!)}.{' '}
              {item.approval === 'approved'
                ? item.autoApproved
                  ? 'Approved by the clock, not by them.'
                  : 'They approved it.'
                : item.approval === 'issue-raised'
                  ? 'They have reported a problem.'
                  : item.autoApproveAt
                    ? `Approves automatically ${formatDateTime(item.autoApproveAt)} unless they object.`
                    : 'Waiting on them.'}
            </>
          ) : (
            'Saving this tells the customer it is ready and starts their review window.'
          )}
        </p>

        {item.liveUrl ? (
          <a
            href={item.liveUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-1 inline-flex items-center gap-1 text-[12px] text-accent-700 hover:underline"
          >
            Open it
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        ) : null}
      </div>
    </div>
  );
}
