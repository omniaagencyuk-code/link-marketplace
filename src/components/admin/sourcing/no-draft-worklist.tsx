'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  Check,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Upload,
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
  readRateCardImagesAction,
} from '@/app/admin/(protected)/sourcing/actions';
import {
  ACCEPTED_ATTACHMENT_TYPES,
  ACCEPTED_IMAGE_TYPES,
  MAX_IMAGES,
  PDF_TYPE,
  isPdf,
} from '@/lib/sourcing/rate-card-image';
import {
  ACCEPTED_SHEET_EXTENSIONS,
  ACCEPTED_SHEET_TYPES,
  decodeSheetBytes,
  looksLikeSheet,
  readRateCardCsv,
} from '@/lib/sourcing/rate-card-csv';
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
  /*
    Images pasted into the box, held here and nowhere else. They are sent
    once to be read and then dropped: what gets stored is the text, after a
    person has looked at it.
  */
  const [images, setImages] = useState<{ name: string; mediaType: string; data: string }[]>([]);
  const [reading, startReading] = useTransition();

  /**
   * A pasted or dropped file as base64, or null if it is not one we read.
   *
   * Images and PDFs both, because the model reads both and the transcription
   * is the same job either way. `btoa` produces no newlines, which the
   * document payload requires.
   */
  async function asAttachment(file: File) {
    const pdf = isPdf(file);
    if (!pdf && !ACCEPTED_IMAGE_TYPES.includes(file.type)) return null;

    const buffer = await file.arrayBuffer();
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let index = 0; index < bytes.length; index += 1) {
      binary += String.fromCharCode(bytes[index] as number);
    }

    return {
      name: file.name || (pdf ? 'attached PDF' : 'pasted image'),
      // A PDF dragged from some mail clients arrives with no type at all, so
      // the type is settled here rather than trusted from the browser.
      mediaType: pdf ? PDF_TYPE : file.type,
      data: btoa(binary),
    };
  }

  /**
   * A dropped or picked spreadsheet, read into the box.
   *
   * No model call: a CSV is already text, so this is parsing rather than
   * transcription. It lands in the same box the images land in and goes down
   * the same path from there - a person reads it, confirms it, and the reply
   * goes back into the extraction queue. A sheet is not a more trustworthy
   * source than an email just because it has columns, so it gets the same
   * review rather than a shortcut past it.
   */
  async function takeSheet(file: File, emailId: string): Promise<boolean> {
    const decoded = decodeSheetBytes(await file.arrayBuffer());
    if ('error' in decoded) {
      setMessage({ id: emailId, tone: 'bad', text: decoded.error });
      return true;
    }

    const read = readRateCardCsv(decoded.text);
    if (!read.ok) {
      setMessage({ id: emailId, tone: 'bad', text: read.error });
      return true;
    }

    // Appended, never replacing, so a file never eats something already typed
    // into the box - the same rule the image transcription follows.
    setText((current) =>
      current.trim() ? `${current.trim()}\n\n${read.table.text}` : read.table.text,
    );

    const notes = [
      `${read.table.rows} ${read.table.rows === 1 ? 'row' : 'rows'} read from ${file.name || 'the file'}`,
    ];
    if (read.table.truncated > 0) notes.push(`${read.table.truncated} beyond the cap were dropped`);
    if (decoded.reEncoded) {
      notes.push('it was not UTF-8, so it was re-read as Windows-1252 - check the currency symbols');
    }
    notes.push('check it before adding');

    setMessage({ id: emailId, tone: 'ok', text: `${notes.join('. ')}.` });
    return true;
  }

  async function takeFiles(files: FileList | File[], emailId: string) {
    const offered = [...files];

    /*
      Sheets first, and taken out of the list.

      Otherwise a CSV falls through to the image branch and is reported as
      "nothing readable", which is the kind of message that teaches somebody
      the feature does not work.
    */
    const sheets = offered.filter((file) => looksLikeSheet(file));
    for (const sheet of sheets) {
      if (await takeSheet(sheet, emailId)) {
        // One at a time: the message says what was read, and two files would
        // overwrite each other's message with nothing lost but the reason.
        break;
      }
    }

    const rest = offered.filter((file) => !looksLikeSheet(file));
    if (rest.length === 0) return;

    const taken = (await Promise.all(rest.map(asAttachment))).filter(Boolean) as {
      name: string;
      mediaType: string;
      data: string;
    }[];

    /*
      Say so rather than doing nothing. Silently ignoring a file looks exactly
      like a broken button, which is how somebody concludes the feature does
      not work.
    */
    if (taken.length === 0) {
      const names = rest.map((file) => file.type || file.name).join(', ');
      setMessage({
        id: emailId,
        tone: 'bad',
        text: `Nothing readable in that (${names}). Attach a PDF or a CSV, or paste a screenshot - PNG, JPEG, GIF or WebP.`,
      });
      return;
    }
    setImages((current) => {
      const next = [...current, ...taken].slice(0, MAX_IMAGES);
      if (current.length + taken.length > MAX_IMAGES) {
        setMessage({ id: emailId, tone: 'bad', text: `Only the first ${MAX_IMAGES} are kept.` });
      }
      return next;
    });
  }

  function readImages(emailId: string) {
    startReading(async () => {
      const result = await readRateCardImagesAction(
        images.map(({ mediaType, data }) => ({ mediaType, data })),
      );
      setMessage({ id: emailId, tone: result.ok ? 'ok' : 'bad', text: result.message });
      if (result.ok && result.text) {
        // Appended rather than replacing, so a transcription never eats
        // something already typed into the box.
        setText((current) => (current.trim() ? `${current.trim()}\n\n${result.text}` : result.text!));
        setImages([]);
      }
    });
  }

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
                      'Paste the rates from the file, the sheet, or the email itself.\n\nA table copied from a spreadsheet pastes straight in, columns and all. A CSV, a PDF or a screenshot can be attached or dropped here - the PDF and the screenshot are read into text first.\n\nIt is read exactly like the reply itself, so include the currency and say which topics each price covers.'
                    }
                    onChange={(event) => setText(event.target.value)}
                    onPaste={(event) => {
                      const files = event.clipboardData?.files;
                      if (files && files.length > 0) {
                        // Only when the clipboard actually carries a file.
                        // Text pastes - which is most of them - are left alone.
                        event.preventDefault();
                        void takeFiles(files, email.id);
                      }
                    }}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      if (event.dataTransfer?.files?.length) {
                        event.preventDefault();
                        void takeFiles(event.dataTransfer.files, email.id);
                      }
                    }}
                    className="text-[13px]"
                  />

                  {images.length > 0 ? (
                    <div className="space-y-2 rounded-md border border-line bg-surface-sunken p-3">
                      <div className="flex flex-wrap gap-2">
                        {images.map((image, index) => (
                          <span key={`${image.name}-${index}`} className="relative">
                            {/*
                              A PDF gets a chip rather than a thumbnail. An
                              <img> pointing at a PDF data URI renders as a
                              broken image, which reads as "it did not take the
                              file" when it took it perfectly well.
                            */}
                            {image.mediaType === PDF_TYPE ? (
                              <span className="flex h-20 w-32 flex-col items-center justify-center gap-1 rounded border border-line-strong bg-white px-2 text-center">
                                <FileText className="h-5 w-5 text-muted" aria-hidden="true" />
                                <span className="line-clamp-2 text-[11px] leading-tight text-ink-soft">
                                  {image.name}
                                </span>
                              </span>
                            ) : (
                              <>
                                {/* A data: URI preview of something the reviewer
                                    just pasted. next/image optimises remote files
                                    it can fetch; there is no file and no URL. */}
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={`data:${image.mediaType};base64,${image.data}`}
                                  alt={image.name}
                                  className="h-20 w-auto rounded border border-line-strong bg-white object-contain"
                                />
                              </>
                            )}
                            <button
                              type="button"
                              aria-label={`Remove ${image.name}`}
                              className="absolute -right-1.5 -top-1.5 rounded-full border border-line-strong bg-white p-0.5 text-ink-soft"
                              onClick={() =>
                                setImages((current) => current.filter((_, at) => at !== index))
                              }
                            >
                              <X className="h-3 w-3" aria-hidden="true" />
                            </button>
                          </span>
                        ))}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={reading || busy}
                          onClick={() => readImages(email.id)}
                        >
                          {reading
                            ? 'Reading...'
                            : `Read ${images.length === 1 ? (images[0]!.mediaType === PDF_TYPE ? 'the PDF' : 'the image') : `all ${images.length}`} into text`}
                        </Button>
                        <span className="text-[12px] text-muted">
                          The text lands in the box above for you to check. The file itself is
                          not kept.
                        </span>
                      </div>
                    </div>
                  ) : null}
                  {/*
                    A picker as well as drag-and-drop.

                    Dropping onto a textarea works and nobody discovers it. The
                    label is the control - a hidden input with a styled button
                    beside it does not open on a keyboard, and this list gets
                    worked through at speed.
                  */}
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-line bg-white px-2.5 py-1.5 text-[12px] font-medium text-ink hover:bg-surface-sunken">
                      <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                      Attach a PDF or CSV
                      <input
                        type="file"
                        multiple
                        className="sr-only"
                        accept={[
                          ...ACCEPTED_SHEET_EXTENSIONS,
                          ...ACCEPTED_SHEET_TYPES,
                          ...ACCEPTED_ATTACHMENT_TYPES,
                        ].join(',')}
                        onChange={(event) => {
                          const files = event.target.files;
                          if (files?.length) void takeFiles(files, email.id);
                          // Cleared so picking the same file twice fires again.
                          event.target.value = '';
                        }}
                      />
                    </label>
                    <span className="text-[12px] leading-relaxed text-muted">
                      A CSV is parsed straight into the box. A PDF or a screenshot is read by the
                      model first, which costs tokens. An .xlsx is a zip rather than text - save it
                      as CSV, or copy the rows and paste them in.
                    </span>
                  </div>

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
