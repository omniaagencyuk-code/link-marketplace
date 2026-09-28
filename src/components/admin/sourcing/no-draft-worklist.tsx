'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  Check,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Link2,
  Paperclip,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  addRateCardAction,
  dismissNoDraftAction,
  markHandledAction,
} from '@/app/admin/(protected)/sourcing/actions';
import { formatDateTime } from '@/lib/utils/format';
import type { NoDraftEmail } from '@/lib/services/sourcing-service';
import type { LinkKind } from '@/lib/sourcing/links';

/**
 * The replies that produced no draft, one at a time.
 *
 * Each row carries the two addresses that matter - the mailbox of ours it
 * came into, and who actually replied, which is often not who we wrote to -
 * plus a way into the original in Gmail. From there it is a human job: read
 * it, add the site by hand if it is worth having, and tick it off.
 *
 * Ticking and removing are different. Ticked means a listing exists because
 * somebody read this email; removed means there was nothing worth having.
 * Six months from now the difference is the only record of where a hand-typed
 * listing came from.
 */
export function NoDraftWorklist({
  emails,
  withRateCard,
}: {
  emails: NoDraftEmail[];
  withRateCard: number;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [open, setOpen] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [message, setMessage] = useState<{ id: string; tone: 'ok' | 'bad'; text: string } | null>(
    null,
  );

  return (
    <div className="space-y-3">
      <p className="text-[12px] leading-relaxed text-muted">
        {emails.length} {emails.length === 1 ? 'reply' : 'replies'} with nothing priceable in the
        email itself
        {withRateCard > 0 ? (
          <>
            {' '}
            &mdash; <strong className="font-medium text-ink">{withRateCard}</strong> of them point
            at a file or a link, and those are listed first
          </>
        ) : null}
        . Nothing here is downloaded or fetched by us: open the original yourself, and either paste
        the rates in or add the site by hand and tick it off.
      </p>

      {emails.map((email) => {
        const editing = open === email.id;

        return (
          <Card key={email.id}>
            <CardContent className="space-y-3 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-ink">
                    {email.askedAboutDomain ?? email.fromAddress}
                    {email.hasRateCard ? (
                      <Badge tone="warning" className="ml-1.5">
                        has a file or link
                      </Badge>
                    ) : null}
                  </p>
                  {email.subject ? (
                    <p className="mt-0.5 text-[12px] text-muted">{email.subject}</p>
                  ) : null}
                </div>
                <p className="tabular text-[12px] text-muted">
                  {email.sentAt ? formatDateTime(email.sentAt) : 'date unknown'}
                </p>
              </div>

              {/*
                Both addresses, because they are often not the same. We write
                to info@ and a person replies from their own account, and
                searching Gmail for the wrong one of the two finds nothing.
              */}
              <dl className="grid gap-x-4 gap-y-0.5 text-[12px] sm:grid-cols-2">
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-muted">Replied from</dt>
                  <dd className="min-w-0 break-all text-ink">
                    {email.fromName ? `${email.fromName} · ` : ''}
                    {email.fromAddress || 'unknown'}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-muted">Into</dt>
                  <dd className="min-w-0 break-all text-ink">
                    {email.mailbox ?? email.toAddress ?? 'not recorded'}
                  </dd>
                </div>
              </dl>

              {email.reason ? (
                <p className="rounded-lg border border-line bg-surface-sunken px-2.5 py-2 text-[12px] text-ink-soft">
                  {email.reason}
                </p>
              ) : null}

              {email.attachments.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <Paperclip className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
                  {email.attachments.map((file) => (
                    <Badge key={file.filename} tone="warning">
                      {file.filename}
                      <span className="ml-1 font-normal opacity-70">{sizeOf(file.size)}</span>
                    </Badge>
                  ))}
                  <span className="text-[11px] text-muted">
                    open from Gmail &mdash; we never download attachments
                  </span>
                </div>
              ) : null}

              {email.links.length > 0 ? (
                <ul className="space-y-1">
                  {email.links.map((link) => (
                    <li key={link.url} className="flex items-start gap-1.5 text-[12px]">
                      <span className="mt-0.5 shrink-0 text-muted">{iconFor(link.kind)}</span>
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="break-all text-accent-700 underline"
                      >
                        {link.url}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}

              {editing ? (
                <div className="space-y-2">
                  <Textarea
                    value={text}
                    rows={8}
                    autoFocus
                    aria-label="Rates from the reply"
                    placeholder={
                      'Paste the rates from the file, the sheet, or the email itself.\n\nAnything readable works - a copied table, a few lines, the whole thing. It is read exactly like the reply itself, so include the currency and say which topics each price covers.'
                    }
                    onChange={(event) => setText(event.target.value)}
                    className="text-[13px]"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="accent"
                      size="sm"
                      disabled={busy || text.trim().length < 10}
                      onClick={() =>
                        startTransition(async () => {
                          const result = await addRateCardAction({ emailId: email.id, text });
                          setMessage({
                            id: email.id,
                            tone: result.ok ? 'ok' : 'bad',
                            text: result.message,
                          });
                          if (result.ok) {
                            setOpen(null);
                            setText('');
                            router.refresh();
                          }
                        })
                      }
                    >
                      Add the rates and queue it
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        setOpen(null);
                        setText('');
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {email.gmailUrl || email.findUrl ? (
                    <Button asChild variant="outline" size="sm">
                      <a
                        href={(email.gmailUrl ?? email.findUrl)!}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        {email.gmailUrl ? 'Open in Gmail' : 'Find in Gmail'}
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                    </Button>
                  ) : null}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      setOpen(email.id);
                      setText('');
                      setMessage(null);
                    }}
                  >
                    Paste the rates
                  </Button>
                  <Button
                    variant="accent"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      startTransition(async () => {
                        await markHandledAction(email.id);
                        router.refresh();
                      })
                    }
                  >
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    Added by hand
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      startTransition(async () => {
                        await dismissNoDraftAction(email.id);
                        router.refresh();
                      })
                    }
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                    Nothing here
                  </Button>
                </div>
              )}

              {message?.id === email.id ? (
                <p
                  className={`text-[12px] ${message.tone === 'ok' ? 'text-positive' : 'text-negative'}`}
                >
                  {message.text}
                </p>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function iconFor(kind: LinkKind) {
  if (kind === 'sheet') return <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />;
  if (kind === 'file' || kind === 'doc')
    return <FileText className="h-3.5 w-3.5" aria-hidden="true" />;
  return <Link2 className="h-3.5 w-3.5" aria-hidden="true" />;
}

function sizeOf(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
