'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Feedback, SalesForm } from '@/components/admin/sales-controls';
import {
  logReplyAction,
  markReplyHandledAction,
  reclassifyReplyAction,
  type SalesActionResult,
} from '@/app/admin/(protected)/sales/actions';
import type { ReplyClassification, SalesReply } from '@/lib/types/sales';

const CLASSIFICATIONS: ReplyClassification[] = [
  'interested',
  'question',
  'not_now',
  'not_interested',
  'unsubscribe',
  'out_of_office',
  'bounce',
  'other',
];

const TONE: Record<ReplyClassification, BadgeTone> = {
  interested: 'accent',
  question: 'info',
  not_now: 'warning',
  not_interested: 'neutral',
  unsubscribe: 'negative',
  out_of_office: 'neutral',
  bounce: 'coral',
  other: 'outline',
};

/**
 * Paste in a reply that arrived somewhere else.
 *
 * Most teams read their mail in Gmail, not in an admin panel, and a reply
 * nobody records is a reply that neither stops a follow-up nor moves a
 * pipeline. An unsubscribe pasted in here suppresses the company exactly as
 * one that arrived automatically would - the path is the same function.
 */
export function LogReply() {
  return (
    <Card>
      <CardContent className="py-5">
        <h2 className="mb-3 text-[13px] font-semibold text-ink">Log a reply</h2>
        <SalesForm action={logReplyAction} submitLabel="Log it">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="fromAddress">Who replied</Label>
              <div className="mt-1.5">
                <Input id="fromAddress" name="fromAddress" type="email" placeholder="maria@example.com" />
              </div>
            </div>
            <div>
              <Label htmlFor="subject">Subject</Label>
              <div className="mt-1.5">
                <Input id="subject" name="subject" placeholder="Re: a few sites" />
              </div>
            </div>
          </div>
          <div className="mt-3">
            <Label htmlFor="body">What they wrote</Label>
            <textarea
              id="body"
              name="body"
              rows={5}
              className="mt-1.5 w-full rounded-lg border border-line bg-white px-3 py-2 text-[13px] leading-relaxed text-ink focus:border-navy-900 focus:outline-none"
            />
            <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
              It is matched to a prospect by the address, then by its domain, and read the same way
              an automatic one would be. If it asks us to stop, the whole company is suppressed -
              that happens on a phrase match as well as on the model, so it works with no API key.
            </p>
          </div>
        </SalesForm>
      </CardContent>
    </Card>
  );
}

export function ReplyList({
  replies,
  names,
  compact,
}: {
  replies: SalesReply[];
  names: Record<string, string>;
  compact?: boolean;
}) {
  return (
    <ul className={compact ? 'space-y-3' : 'space-y-4'}>
      {replies.map((reply) => (
        <li key={reply.id}>
          <ReplyRow reply={reply} companyName={reply.prospectId ? names[reply.prospectId] : undefined} compact={compact} />
        </li>
      ))}
    </ul>
  );
}

/**
 * One reply, with the label it was given and the ability to change it.
 *
 * Changing a label is not cosmetic: setting one to `unsubscribe` suppresses
 * the company there and then, which is why the picker confirms before it does.
 * A correction is recorded as made by a human, so "how often was the model
 * wrong" stays answerable.
 */
function ReplyRow({
  reply,
  companyName,
  compact,
}: {
  reply: SalesReply;
  companyName?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SalesActionResult | null>(null);
  const [open, setOpen] = useState(false);

  function change(next: ReplyClassification) {
    if (next === reply.classification) return;
    if (
      next === 'unsubscribe' &&
      !window.confirm('Mark this as an unsubscribe? It suppresses the whole company immediately.')
    ) {
      return;
    }

    setResult(null);
    startTransition(async () => {
      setResult(await reclassifyReplyAction(reply.id, next));
      router.refresh();
    });
  }

  const body = compact && !open ? reply.bodyText.slice(0, 200) : reply.bodyText;

  return (
    <div className={compact ? '' : 'rounded-lg border border-line bg-white p-4'}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-[13px]">
            {reply.classification ? (
              <Badge tone={TONE[reply.classification]}>
                {reply.classification.replace(/_/g, ' ')}
              </Badge>
            ) : null}
            <span className="font-medium text-ink">{reply.fromAddress}</span>
            {companyName && reply.prospectId ? (
              <Link
                href={`/admin/sales/prospects/${reply.prospectId}`}
                className="text-[12px] text-muted hover:underline"
              >
                {companyName}
              </Link>
            ) : (
              <span className="text-[12px] text-muted">no prospect matched</span>
            )}
            {reply.confidence !== undefined && reply.confidence < 50 ? (
              <Badge tone="warning">unsure</Badge>
            ) : null}
            {reply.classifiedBy === 'human' ? <Badge tone="outline">corrected</Badge> : null}
          </p>
          {reply.subject ? (
            <p className="mt-0.5 text-[12px] text-muted">{reply.subject}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Classification"
            value={reply.classification ?? 'other'}
            disabled={pending}
            onChange={(event) => change(event.target.value as ReplyClassification)}
            className="rounded-lg border border-line bg-white px-2 py-1.5 text-[12px] text-ink focus:border-navy-900 focus:outline-none"
          >
            {CLASSIFICATIONS.map((entry) => (
              <option key={entry} value={entry}>
                {entry.replace(/_/g, ' ')}
              </option>
            ))}
          </select>

          {!reply.handled ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  setResult(await markReplyHandledAction(reply.id));
                  router.refresh();
                })
              }
            >
              Dealt with
            </Button>
          ) : null}
        </div>
      </div>

      <pre className="mt-2 max-h-56 overflow-auto rounded bg-surface-sunken p-2.5 font-sans text-[12px] leading-relaxed whitespace-pre-wrap text-ink-soft">
        {body}
      </pre>

      {compact && !open && reply.bodyText.length > 200 ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-1 text-[12px] text-ink underline"
        >
          Show all
        </button>
      ) : null}

      {result ? <Feedback result={result} /> : null}
    </div>
  );
}
