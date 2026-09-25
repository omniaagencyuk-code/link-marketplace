'use client';

import { useMemo, useState, useTransition } from 'react';
import { AlertTriangle, Check, Copy, ExternalLink, MessageSquareWarning } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/input';
import { formatDate, formatPrice } from '@/lib/utils/format';
import { linkTypeLabels } from '@/lib/utils/labels';
import {
  approveItemsAction,
  reportIssueAction,
} from '@/app/dashboard/orders/[id]/actions';
import {
  awaitingApproval,
  canReportIssue,
  daysUntilAutoApproval,
  deliveredItems,
  deliveryState,
} from '@/lib/orders/delivery';
import type { OrderItem } from '@/lib/types';

/**
 * Checking over what arrived.
 *
 * The one screen where a customer decides whether they got what they paid
 * for, so it leads with the thing they need - the live link, and a way to
 * copy it without selecting text in a table - and offers exactly two
 * answers: this is fine, or this is wrong and here is why.
 *
 * Bulk approval exists because a twelve-article order approved one at a time
 * is a chore, and a chore is something people click through without reading.
 * Selecting is per placement so that "all of them except that one" is as easy
 * as agreeing with everything.
 */
export function OrderDelivery({
  items,
  postApprovalDays,
  nowIso,
}: {
  items: OrderItem[];
  postApprovalDays: number;
  /** The clock, read on the server. A render may not read it itself. */
  nowIso: string;
}) {
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reporting, setReporting] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const delivered = deliveredItems(items);
  const awaiting = awaitingApproval(delivered);

  if (delivered.length === 0) return null;

  function toggle(id: string, on: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function approve(ids: string[]) {
    if (ids.length === 0) return;
    startTransition(async () => {
      await approveItemsAction(ids);
      setSelected(new Set());
    });
  }

  return (
    <section className="mt-8" aria-labelledby="delivered">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="delivered" className="text-[15px] font-semibold text-ink">
            Delivered placements
          </h2>
          <span className="text-[13px] text-muted">
            {awaiting.length > 0
              ? `${awaiting.length} to check over`
              : 'nothing waiting on you'}
          </span>
        </div>

        {awaiting.length > 1 ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={busy || selected.size === 0}
              onClick={() => approve([...selected])}
            >
              Approve selected
              {selected.size > 0 ? ` (${selected.size})` : ''}
            </Button>
            <Button
              variant="accent"
              size="sm"
              disabled={busy}
              onClick={() => approve(awaiting.map((item) => item.id))}
            >
              <Check className="h-4 w-4" aria-hidden="true" />
              Approve all {awaiting.length}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="space-y-3">
        {delivered.map((item) => (
          <DeliveredItem
            key={item.id}
            item={item}
            now={now}
            postApprovalDays={postApprovalDays}
            selectable={awaiting.length > 1 && deliveryState(item) === 'awaiting-approval'}
            checked={selected.has(item.id)}
            onToggle={(on) => toggle(item.id, on)}
            busy={busy}
            reporting={reporting === item.id}
            message={message}
            error={reporting === item.id ? error : null}
            onApprove={() => approve([item.id])}
            onStartReport={() => {
              setReporting(item.id);
              setMessage('');
              setError(null);
            }}
            onCancelReport={() => setReporting(null)}
            onMessage={setMessage}
            onSubmitReport={() =>
              startTransition(async () => {
                const result = await reportIssueAction(item.id, message);
                if (result.ok) {
                  setReporting(null);
                  setMessage('');
                  setError(null);
                } else {
                  setError(result.error ?? 'That did not save. Please try again.');
                }
              })
            }
          />
        ))}
      </div>
    </section>
  );
}

function DeliveredItem({
  item,
  now,
  postApprovalDays,
  selectable,
  checked,
  onToggle,
  busy,
  reporting,
  message,
  error,
  onApprove,
  onStartReport,
  onCancelReport,
  onMessage,
  onSubmitReport,
}: {
  item: OrderItem;
  now: Date;
  postApprovalDays: number;
  selectable: boolean;
  checked: boolean;
  onToggle: (on: boolean) => void;
  busy: boolean;
  reporting: boolean;
  message: string;
  error: string | null;
  onApprove: () => void;
  onStartReport: () => void;
  onCancelReport: () => void;
  onMessage: (value: string) => void;
  onSubmitReport: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const state = deliveryState(item);
  const daysLeft = daysUntilAutoApproval(item as never, now);
  const mayReport = canReportIssue(item as never, postApprovalDays, now);
  const openIssue = item.issues?.find((issue) => !issue.resolvedAt);
  const lastResolved = item.issues?.find((issue) => issue.resolvedAt);

  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex flex-wrap items-start gap-3">
          {selectable ? (
            <span className="mt-0.5">
              <Checkbox
                checked={checked}
                aria-label={`Select ${item.websiteDomain}`}
                onChange={(event) => onToggle(event.target.checked)}
              />
            </span>
          ) : null}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-[14px] font-semibold text-ink">
                {item.websiteDomain}
                <span className="ml-2 text-[12px] font-normal text-muted">
                  {linkTypeLabels[item.serviceType]}
                </span>
              </p>
              <StateBadge state={state} autoApproved={item.autoApproved} />
            </div>

            <p className="mt-0.5 truncate text-[12px] text-muted">
              {item.anchorText ? `“${item.anchorText}” → ` : ''}
              {item.targetUrl}
            </p>

            {/* The reason anybody opens this page. */}
            {item.liveUrl ? (
              <div className="mt-3 rounded-lg border border-line bg-surface-sunken p-3">
                <p className="text-[12px] font-medium text-ink">Your placement is live at</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <a
                    href={item.liveUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="flex min-w-0 items-center gap-1 text-[13px] break-all text-accent-700 hover:underline"
                  >
                    <span className="truncate">{item.liveUrl}</span>
                    <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                  </a>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      // Clipboard access can be refused, and a button that
                      // silently does nothing is worse than one that says so.
                      try {
                        await navigator.clipboard.writeText(item.liveUrl ?? '');
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      } catch {
                        setCopied(false);
                      }
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    {copied ? 'Copied' : 'Copy link'}
                  </Button>
                </div>
              </div>
            ) : null}

            {openIssue ? (
              <div className="mt-3 rounded-lg border border-line bg-surface-sunken p-3">
                <p className="flex items-center gap-1.5 text-[12px] font-medium text-ink">
                  <MessageSquareWarning className="h-3.5 w-3.5" aria-hidden="true" />
                  You reported a problem on {formatDate(openIssue.createdAt)}
                </p>
                <p className="mt-1 text-[13px] whitespace-pre-wrap text-ink-soft">
                  {openIssue.message}
                </p>
                <p className="mt-1.5 text-[12px] text-muted">
                  We are on it. Nothing approves itself while a report is open.
                </p>
              </div>
            ) : lastResolved?.resolutionNote ? (
              <p className="mt-3 text-[12px] text-muted">
                Your last report was sorted: {lastResolved.resolutionNote}
              </p>
            ) : null}

            {state === 'awaiting-approval' && daysLeft != null ? (
              <p className="mt-2 text-[12px] text-muted">
                {daysLeft === 0
                  ? 'This approves automatically today unless you report a problem.'
                  : `Approves automatically in ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} unless you report a problem.`}
              </p>
            ) : null}

            {reporting ? (
              <div className="mt-3">
                <label
                  htmlFor={`issue_${item.id}`}
                  className="text-[12px] font-medium text-ink"
                >
                  What is wrong with it?
                </label>
                <Textarea
                  id={`issue_${item.id}`}
                  value={message}
                  maxLength={2000}
                  placeholder="e.g. The link is nofollow, or the anchor text is not the one I asked for."
                  onChange={(event) => onMessage(event.target.value)}
                  className="mt-1.5 text-[13px]"
                />
                {error ? <p className="mt-1 text-[12px] text-negative">{error}</p> : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    variant="accent"
                    size="sm"
                    disabled={busy || message.trim().length === 0}
                    onClick={onSubmitReport}
                  >
                    Send this to us
                  </Button>
                  <Button variant="ghost" size="sm" disabled={busy} onClick={onCancelReport}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {state !== 'approved' ? (
                  <Button variant="accent" size="sm" disabled={busy} onClick={onApprove}>
                    <Check className="h-4 w-4" aria-hidden="true" />
                    {state === 'issue-raised' ? 'This is sorted, approve it' : 'Approve'}
                  </Button>
                ) : null}
                {mayReport && !openIssue ? (
                  <Button variant="outline" size="sm" disabled={busy} onClick={onStartReport}>
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                    {state === 'approved' ? 'Report a problem' : 'Something is wrong'}
                  </Button>
                ) : null}
                <span className="tabular ml-auto text-[13px] font-semibold text-ink">
                  {formatPrice(item.priceMinor)}
                </span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StateBadge({
  state,
  autoApproved,
}: {
  state: ReturnType<typeof deliveryState>;
  autoApproved?: boolean;
}) {
  if (state === 'approved') {
    return (
      <span className="rounded-full bg-accent-50 px-2 py-0.5 text-[11px] font-medium text-accent-700">
        {/* Said plainly rather than hidden: they should know we took silence
            for agreement, not discover it later. */}
        {autoApproved ? 'Approved automatically' : 'Approved'}
      </span>
    );
  }
  if (state === 'issue-raised') {
    return (
      <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] font-medium text-negative">
        Problem reported
      </span>
    );
  }
  return (
    <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] font-medium text-ink-soft">
      Waiting on you
    </span>
  );
}
