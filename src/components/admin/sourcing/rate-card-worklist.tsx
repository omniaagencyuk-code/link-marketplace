'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { ExternalLink, FileSpreadsheet, FileText, Link2, Paperclip, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  addRateCardAction,
  dismissRateCardAction,
} from '@/app/admin/(protected)/sourcing/actions';
import { formatDateTime } from '@/lib/utils/format';
import type { RateCardLead } from '@/lib/services/sourcing-service';
import type { LinkKind } from '@/lib/sourcing/links';

/**
 * One publisher at a time: what they sent, and a box to put the prices in.
 *
 * The links open in a new tab and the attachment is opened from Gmail. We
 * never fetch either - the only thing that enters the system here is text a
 * human pasted after reading the rate card themselves, which is also why
 * this is worth a person's time rather than a job.
 */
export function RateCardWorklist({ leads }: { leads: RateCardLead[] }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [open, setOpen] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [message, setMessage] = useState<{ id: string; tone: 'ok' | 'bad'; text: string } | null>(
    null,
  );

  return (
    <div className="space-y-3">
      <p className="text-[12px] text-muted">
        {leads.length} {leads.length === 1 ? 'reply' : 'replies'} with a file or a link and no
        prices in the email itself. Nothing here has been read by Claude, and nothing is downloaded
        or fetched by us - open it yourself, copy the rates, and it goes back in the queue.
      </p>

      {leads.map((lead) => {
        const editing = open === lead.id;

        return (
          <Card key={lead.id}>
            <CardContent className="space-y-3 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="text-[13px] font-medium text-ink">
                    {lead.askedAboutDomain ?? lead.fromAddress}
                    {lead.askedAboutDomain ? (
                      <span className="ml-1.5 font-normal text-muted">{lead.fromAddress}</span>
                    ) : null}
                  </p>
                  {lead.subject ? (
                    <p className="mt-0.5 text-[12px] text-muted">{lead.subject}</p>
                  ) : null}
                </div>
                <p className="tabular text-[12px] text-muted">
                  {lead.sentAt ? formatDateTime(lead.sentAt) : 'date unknown'}
                </p>
              </div>

              {lead.reason ? (
                <p className="rounded-lg border border-line bg-surface-sunken px-2.5 py-2 text-[12px] text-ink-soft">
                  {lead.reason}
                </p>
              ) : null}

              {lead.attachments.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <Paperclip className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
                  {lead.attachments.map((file) => (
                    <Badge key={file.filename} tone="warning">
                      {file.filename}
                      <span className="ml-1 font-normal opacity-70">{sizeOf(file.size)}</span>
                    </Badge>
                  ))}
                  <span className="text-[11px] text-muted">
                    open from Gmail - we never download attachments
                  </span>
                </div>
              ) : null}

              {lead.links.length > 0 ? (
                <ul className="space-y-1">
                  {lead.links.map((link) => (
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
                    aria-label="Rate card contents"
                    placeholder={
                      'Paste the rates from the file or the sheet.\n\nAnything readable works - a copied table, a few lines, the whole thing. It is read exactly like the reply itself, so include the currency and say which topics each price covers.'
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
                          const result = await addRateCardAction({ emailId: lead.id, text });
                          setMessage({
                            id: lead.id,
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
                  {lead.gmailUrl ? (
                    <Button asChild variant="outline" size="sm">
                      <a href={lead.gmailUrl} target="_blank" rel="noreferrer noopener">
                        Open in Gmail
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                    </Button>
                  ) : null}
                  <Button
                    variant="accent"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      setOpen(lead.id);
                      setText('');
                      setMessage(null);
                    }}
                  >
                    Paste the rates
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      startTransition(async () => {
                        await dismissRateCardAction(lead.id);
                        router.refresh();
                      })
                    }
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                    Not a rate card
                  </Button>
                </div>
              )}

              {message?.id === lead.id ? (
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
  if (kind === 'file' || kind === 'doc') return <FileText className="h-3.5 w-3.5" aria-hidden="true" />;
  return <Link2 className="h-3.5 w-3.5" aria-hidden="true" />;
}

function sizeOf(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
