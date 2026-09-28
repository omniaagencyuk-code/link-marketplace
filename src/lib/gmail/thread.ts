import { isOurs } from '@/lib/sourcing/outreach';
import { domainFromSubject, stripQuotedHistory } from '@/lib/sourcing/mbox';
import {
  addressOf,
  displayNameOf,
  looksLikeRateCard,
  parseMessage,
  type AttachmentInfo,
  type GmailMessage,
} from './mime';

/**
 * A Gmail thread, as the pipeline already understands mail.
 *
 * Pure: hand it the JSON Gmail returned and it hands back the same shape the
 * mbox reader produces, so `sourcingService.store()` and everything after it
 * needs no idea where the message came from.
 *
 * The unit is the thread, not the message. An uploaded export gives us one
 * row per message and the model reads each alone; a thread read whole gives
 * it the question as well as the answer, which is most of what "550 for the
 * first one, 700 for the others" needs to be understood at all.
 */

export interface GmailThread {
  id?: string;
  historyId?: string;
  messages?: GmailMessage[];
}

export interface ThreadMessage {
  messageId?: string;
  fromAddress: string;
  fromName?: string;
  toAddress?: string;
  subject?: string;
  sentAt?: string;
  text: string;
  ours: boolean;
  attachments: AttachmentInfo[];
}

export type ThreadSkipReason = 'no-reply' | 'empty' | 'no-messages';

export interface ReadThread {
  threadId: string;
  historyId?: string;
  /** Every Message-ID in the thread, ours included. The dedupe key set. */
  messageIds: string[];
  /** The latest external reply's Message-ID: what the row is keyed on. */
  messageId?: string;
  fromAddress: string;
  fromName?: string;
  toAddress?: string;
  subject?: string;
  sentAt?: string;
  /** The whole thread, chronological, each message labelled by sender. */
  bodyRaw: string;
  /** The same, with each message's quoted history removed. For the model. */
  bodyText: string;
  askedAboutDomain?: string;
  attachments: AttachmentInfo[];
  hasRateCard: boolean;
}

/** An ISO timestamp from Gmail's internalDate, or the Date header. */
function sentAtOf(message: GmailMessage, headerDate?: string): string | undefined {
  const internal = Number(message.internalDate);
  if (Number.isFinite(internal) && internal > 0) {
    return new Date(internal).toISOString();
  }
  if (!headerDate) return undefined;
  const parsed = new Date(headerDate);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

/** Strip the angle brackets a Message-ID header carries. */
function bareMessageId(value?: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/^<|>$/g, '') || undefined;
}

/**
 * Each message in a thread, in the order they were sent.
 *
 * Gmail returns them in order already, but a thread that has been merged or
 * imported can arrive out of it, and a transcript that reads answer-then-
 * question is worse than useless to the model.
 */
export function readMessages(
  thread: GmailThread,
  mailbox: string,
  alsoOurs: string[] = [],
): ThreadMessage[] {
  const messages = (thread.messages ?? []).map((message) => {
    const parsed = parseMessage(message);
    const fromAddress = addressOf(parsed.headers.from);

    return {
      messageId: bareMessageId(parsed.headers.messageId),
      fromAddress,
      fromName: displayNameOf(parsed.headers.from),
      toAddress: addressOf(parsed.headers.to) || undefined,
      subject: parsed.headers.subject,
      sentAt: sentAtOf(message, parsed.headers.date),
      text: parsed.text,
      ours: isOurs(fromAddress, [mailbox, ...alsoOurs]),
      attachments: parsed.attachments,
    };
  });

  return messages.sort((a, b) => (a.sentAt ?? '').localeCompare(b.sentAt ?? ''));
}

/** "Publisher (name@example.com), 24 Sept 2026" and then what they wrote. */
function transcript(messages: ThreadMessage[], strip: boolean): string {
  return messages
    .map((message) => {
      const who = message.ours ? 'Us' : 'Publisher';
      const when = message.sentAt ? message.sentAt.slice(0, 10) : 'date unknown';
      const body = strip ? stripQuotedHistory(message.text) : message.text;
      return `--- ${who} (${message.fromAddress || 'unknown'}), ${when} ---\n${body}`.trim();
    })
    .filter((block) => block.length > 0)
    .join('\n\n');
}

/**
 * The domain the thread is about.
 *
 * Our outreach names it in the subject; the publisher's reply echoes it back
 * with a Re:. Our own messages are asked first because they are the ones that
 * put the domain there, and a publisher who rewrote the subject has not
 * necessarily removed it from ours.
 */
function askedAbout(messages: ThreadMessage[]): string | undefined {
  for (const message of messages) {
    if (!message.ours) continue;
    const domain = domainFromSubject(message.subject);
    if (domain) return domain;
  }
  for (const message of messages) {
    const domain = domainFromSubject(message.subject);
    if (domain) return domain;
  }
  return undefined;
}

/**
 * One thread, ready to store - or the reason it is not worth storing.
 *
 * A thread where every message is ours is outreach nobody answered. There are
 * thousands of those and they contain no publisher terms by definition, so
 * they are skipped before they can cost anything: sending them to the model
 * would be paying to be told we wrote them.
 */
export function readThread(
  thread: GmailThread,
  mailbox: string,
  /**
   * Other addresses of ours, beyond the mailbox being read.
   *
   * The importer passes the whole allowlist. Without it, a thread pulled from
   * one mailbox that also carries a message from another of our addresses
   * would read that message as a publisher's - and whatever we wrote would
   * become their terms. Every outreach address is on the static list too, but
   * this is what means adding a mailbox in the admin is enough on its own.
   */
  alsoOurs: string[] = [],
): { thread: ReadThread } | { skip: ThreadSkipReason } {
  const messages = readMessages(thread, mailbox, alsoOurs);
  if (messages.length === 0) return { skip: 'no-messages' };

  const replies = messages.filter((message) => !message.ours);
  if (replies.length === 0) return { skip: 'no-reply' };

  const bodyText = transcript(messages, true);
  const bodyRaw = transcript(messages, false);
  if (bodyText.trim().length === 0) return { skip: 'empty' };

  // Keyed on the latest reply rather than the first: a thread that gains a
  // new answer gains a new key, and the old row is found by `messageIds`.
  const latest = replies[replies.length - 1]!;
  const attachments = messages.flatMap((message) => message.attachments);

  return {
    thread: {
      threadId: String(thread.id ?? ''),
      historyId: thread.historyId ? String(thread.historyId) : undefined,
      messageIds: messages
        .map((message) => message.messageId)
        .filter((id): id is string => Boolean(id)),
      messageId: latest.messageId,
      fromAddress: latest.fromAddress,
      fromName: latest.fromName,
      toAddress: latest.toAddress ?? mailbox,
      subject: latest.subject ?? messages[0]?.subject,
      sentAt: latest.sentAt,
      bodyRaw,
      bodyText,
      askedAboutDomain: askedAbout(messages),
      attachments,
      hasRateCard: attachments.some(looksLikeRateCard),
    },
  };
}

/** The deep link back to the thread in Gmail, for a reviewer to check. */
export function gmailThreadUrl(mailbox: string, threadId: string): string {
  return `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(mailbox)}#all/${encodeURIComponent(threadId)}`;
}

/*
  Synthetic keys, which are not Message-IDs and will find nothing.

  A pasted reply and a Gmail thread with no readable Message-ID both get a
  made-up key so the row has something unique. Searching Gmail for one would
  return no results, and a link that always fails is worse than no link.
*/
const NOT_A_MESSAGE_ID = /^(pasted:|gmail-thread:)/;

/**
 * Find an email in Gmail by its Message-ID.
 *
 * The thread link needs a mailbox and a thread id, which only emails imported
 * through the Gmail route have. Everything uploaded from a Takeout export has
 * neither - and those are exactly the rows on the rate card worklist that say
 * "refers to attached rate cards" with no way to go and look at them.
 *
 * Every email has a Message-ID whichever route it came by, and Gmail can find
 * a message by one. The brackets are stripped because the mbox reader keeps
 * them and the Gmail reader does not, and `rfc822msgid:` wants neither.
 */
export function gmailSearchUrl(messageId: string, mailbox?: string | null): string | null {
  const bare = messageId.trim().replace(/^<|>$/g, '');
  if (!bare || NOT_A_MESSAGE_ID.test(bare)) return null;

  const account = mailbox ? `?authuser=${encodeURIComponent(mailbox)}` : '0/';
  return `https://mail.google.com/mail/u/${account}#search/${encodeURIComponent(`rfc822msgid:${bare}`)}`;
}
