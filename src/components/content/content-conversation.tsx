'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { MessageSquare, RefreshCw, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requestRevisionAction, sendContentMessageAction } from '@/app/dashboard/content/actions';
import { formatDateTime } from '@/lib/utils/format';
import type { ContentMessage, ContentOrderStatus } from '@/lib/types/content';

/**
 * Messages and revision requests on one article.
 *
 * Both write through server actions that re-check the session and scope the
 * article to the signed-in customer, so a guessed id cannot reach another
 * account's thread.
 */
export function ContentConversation({
  itemId,
  messages,
  status,
}: {
  itemId: string;
  messages: ContentMessage[];
  status: ContentOrderStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [body, setBody] = useState('');
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [revisionNotes, setRevisionNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const canRequestRevision = status === 'ready-for-review' || status === 'complete';

  function send() {
    if (!body.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await sendContentMessageAction(itemId, body);
      if (!result.ok) {
        setError(result.error ?? 'Message could not be sent.');
        return;
      }
      setBody('');
      router.refresh();
    });
  }

  function requestRevision() {
    if (!revisionNotes.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await requestRevisionAction(itemId, revisionNotes);
      if (!result.ok) {
        setError(result.error ?? 'Revision could not be requested.');
        return;
      }
      setRevisionNotes('');
      setRevisionOpen(false);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted" aria-hidden="true" />
          Messages
        </CardTitle>
        {canRequestRevision ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRevisionOpen((open) => !open)}
            aria-expanded={revisionOpen}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Request a revision
          </Button>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-4">
        {revisionOpen ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4">
            <label
              htmlFor="revision-notes"
              className="text-[13px] font-medium text-ink"
            >
              What needs changing?
            </label>
            <textarea
              id="revision-notes"
              rows={3}
              value={revisionNotes}
              onChange={(event) => setRevisionNotes(event.target.value)}
              className="mt-2 w-full rounded-md border border-line-strong bg-white px-3 py-2 text-sm text-ink focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 focus:outline-none"
              placeholder="Be specific - which sections, and what you would like instead."
            />
            <div className="mt-3 flex gap-2">
              <Button variant="accent" size="sm" onClick={requestRevision} disabled={pending}>
                {pending ? 'Sending...' : 'Send revision request'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setRevisionOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        {messages.length === 0 ? (
          <p className="text-[13px] text-muted">
            No messages yet. Anything you send here reaches the writer working on this article.
          </p>
        ) : (
          <ul className="space-y-3">
            {messages.map((message) => (
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

        <div>
          <label htmlFor="content-message" className="sr-only">
            Write a message
          </label>
          <textarea
            id="content-message"
            rows={3}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            className="w-full rounded-md border border-line-strong bg-white px-3 py-2 text-sm text-ink focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 focus:outline-none"
            placeholder="Add a note for the writer..."
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            {error ? (
              <p role="alert" className="text-[13px] text-negative">
                {error}
              </p>
            ) : (
              <span />
            )}
            <Button variant="primary" size="sm" onClick={send} disabled={pending || !body.trim()}>
              <Send className="h-3.5 w-3.5" />
              Send
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
