/**
 * Turning a Gmail message payload into text.
 *
 * Pure: no network, no database, no credentials. Gmail hands back a tree of
 * MIME parts with base64url bodies, and what the model needs is the words a
 * human would have read. Everything here is about getting from one to the
 * other without losing the reply inside a signature, a tracking pixel or a
 * character set nobody has used since 2004.
 *
 * Written rather than pulled from a mail library for the same reason the mbox
 * reader was: the failure we care about is a reply that silently arrives
 * empty, and that is easier to see in code we can read and test than in a
 * dependency tree.
 */

export interface MessageHeaders {
  from?: string;
  to?: string;
  cc?: string;
  date?: string;
  subject?: string;
  messageId?: string;
  inReplyTo?: string;
}

export interface AttachmentInfo {
  filename: string;
  mimeType: string;
  /** Bytes, as Gmail reports them. Never the attachment itself. */
  size: number;
}

export interface GmailPart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: { name?: string; value?: string }[];
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: GmailPart[];
}

export interface GmailMessage {
  id?: string;
  threadId?: string;
  internalDate?: string;
  labelIds?: string[];
  payload?: GmailPart;
}

// ------------------------------------------------------------------ base64url

/**
 * Decode a base64url body.
 *
 * Gmail uses the URL-safe alphabet and strips padding. Buffer's 'base64url'
 * handles both, but senders introduce stray whitespace, so the input is
 * cleaned before it is decoded rather than failing on mail that every mail
 * client renders fine.
 */
export function decodeBase64Url(data: string): Buffer {
  const cleaned = data.replace(/[\r\n\s]/g, '');
  if (!cleaned) return Buffer.alloc(0);
  return Buffer.from(cleaned, 'base64url');
}

// ------------------------------------------------------------------ charsets

/**
 * Bytes to a string, in whatever character set the part declares.
 *
 * Node's TextDecoder covers the legacy single-byte and CJK encodings through
 * the WHATWG index, which is most of what turns up: windows-1252 for anything
 * written in Outlook, iso-8859-1 and -2 across Europe, the occasional
 * shift_jis. An unknown label falls back to UTF-8 rather than failing, and
 * invalid bytes become replacement characters rather than an exception - a
 * mangled word in a reply is recoverable, a thrown error loses the reply.
 */
export function decodeText(bytes: Buffer, charset?: string): string {
  const label = (charset ?? 'utf-8').trim().toLowerCase().replace(/^["']|["']$/g, '');

  try {
    return new TextDecoder(label || 'utf-8', { fatal: false }).decode(bytes);
  } catch {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  }
}

/** The value of one header, case-insensitively. */
export function headerValue(part: GmailPart | undefined, name: string): string | undefined {
  const wanted = name.toLowerCase();
  for (const header of part?.headers ?? []) {
    if ((header.name ?? '').toLowerCase() === wanted) return header.value ?? undefined;
  }
  return undefined;
}

/** The charset from a part's Content-Type, when it states one. */
export function charsetOf(part: GmailPart): string | undefined {
  const contentType = headerValue(part, 'content-type');
  if (!contentType) return undefined;
  const match = /charset\s*=\s*("[^"]+"|'[^']+'|[^;\s]+)/i.exec(contentType);
  return match ? match[1]!.replace(/^["']|["']$/g, '') : undefined;
}

// ---------------------------------------------------------------- html to text

const BLOCK_TAGS =
  'address|article|aside|blockquote|div|dl|dd|dt|fieldset|figcaption|figure|footer|form|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|tbody|td|tfoot|th|thead|tr|ul';

/**
 * HTML to something worth reading.
 *
 * Not a renderer. The goal is that a price in a table cell and a price in a
 * paragraph both survive as text on their own line, and that script, style
 * and head content never reach the model as though a publisher had written
 * them.
 */
export function htmlToText(html: string): string {
  let text = html;

  // Anything whose contents are not prose, removed with its contents.
  text = text.replace(/<(script|style|head|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  text = text.replace(/<!--[\s\S]*?-->/g, ' ');

  // A link's text is kept, and its href too when it is not the same thing:
  // a publisher's example placement is often only in the href.
  text = text.replace(
    /<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_match, href: string, label: string) => {
      const plain = label.replace(/<[^>]+>/g, '').trim();
      if (!plain) return ` ${href} `;
      if (plain.toLowerCase() === href.toLowerCase()) return ` ${plain} `;
      return ` ${plain} (${href}) `;
    },
  );

  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(new RegExp(`</(?:${BLOCK_TAGS})\\s*>`, 'gi'), '\n');
  // A table cell keeps its neighbours apart even without a closing tag.
  text = text.replace(/<(?:td|th)\b[^>]*>/gi, '\t');
  text = text.replace(/<[^>]+>/g, ' ');

  text = decodeEntities(text);

  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', pound: '£',
  euro: '€', hellip: '…', mdash: '—', ndash: '–',
  rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', middot: '·',
};

function codePoint(value: number): string {
  if (!Number.isFinite(value) || value < 0 || value > 0x10ffff) return '';
  try {
    return String.fromCodePoint(value);
  } catch {
    return '';
  }
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex: string) => codePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec: string) => codePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+[0-9]?);/gi, (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}

// ------------------------------------------------------------- encoded words

/**
 * RFC 2047 encoded words in a header.
 *
 * "=?UTF-8?B?...?=" is how a subject carries anything outside ASCII. Gmail
 * usually decodes these for us; usually is not always, and a subject reading
 * "=?windows-1252?Q?Tarifs_pour_vous?=" is one nobody can search for.
 */
export function decodeEncodedWords(value: string): string {
  return value.replace(
    /=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g,
    (match, charset: string, encoding: string, payload: string) => {
      try {
        if (encoding.toLowerCase() === 'b') {
          return decodeText(Buffer.from(payload, 'base64'), charset);
        }
        const bytes = Buffer.from(
          payload
            .replace(/_/g, ' ')
            .replace(/=([0-9a-f]{2})/gi, (_m, hex: string) => String.fromCharCode(parseInt(hex, 16))),
          'binary',
        );
        return decodeText(bytes, charset);
      } catch {
        return match;
      }
    },
  );
}

// -------------------------------------------------------------------- headers

export function readHeaders(payload: GmailPart | undefined): MessageHeaders {
  const read = (name: string) => {
    const raw = headerValue(payload, name);
    return raw ? decodeEncodedWords(raw).trim() : undefined;
  };

  return {
    from: read('from'),
    to: read('to'),
    cc: read('cc'),
    date: read('date'),
    subject: read('subject'),
    messageId: read('message-id'),
    inReplyTo: read('in-reply-to'),
  };
}

/** The address out of "Name <addr@example.com>", or the whole thing. */
export function addressOf(value?: string): string {
  if (!value) return '';
  const angled = /<([^>]+)>/.exec(value);
  const raw = angled ? angled[1]! : value;
  return raw.trim().toLowerCase().replace(/^mailto:/, '');
}

/** The display name out of "Name <addr>", when there is one. */
export function displayNameOf(value?: string): string | undefined {
  if (!value) return undefined;
  const match = /^\s*("?)(.*?)\1\s*<[^>]+>\s*$/.exec(value);
  const name = match?.[2]?.trim();
  return name && !name.includes('@') ? name : undefined;
}

// ------------------------------------------------------------------ the walk

interface Walked {
  plain: string[];
  html: string[];
  attachments: AttachmentInfo[];
}

/**
 * Walk the part tree.
 *
 * Depth first, collecting every text/plain and text/html body and the
 * metadata of everything else. multipart/alternative is not special-cased:
 * both representations are gathered and the preference applied afterwards,
 * which keeps this function about structure and the choice about policy.
 *
 * A part with a filename is an attachment even when its type is text/plain -
 * an attached .csv rate card is not the body of the message.
 */
function walk(part: GmailPart | undefined, into: Walked, depth = 0): void {
  if (!part || depth > 20) return;

  const mimeType = (part.mimeType ?? '').toLowerCase();
  const filename = (part.filename ?? '').trim();

  if (filename) {
    into.attachments.push({
      filename,
      mimeType: mimeType || 'application/octet-stream',
      size: Number(part.body?.size ?? 0),
    });
    return;
  }

  if (part.parts?.length) {
    for (const child of part.parts) walk(child, into, depth + 1);
    return;
  }

  const data = part.body?.data;
  if (!data) return;

  const text = decodeText(decodeBase64Url(data), charsetOf(part));
  if (mimeType === 'text/html') into.html.push(text);
  else if (!mimeType || mimeType.startsWith('text/')) into.plain.push(text);
}

export interface ParsedMimeMessage {
  headers: MessageHeaders;
  /** The readable body: text/plain where there is one, else HTML as text. */
  text: string;
  attachments: AttachmentInfo[];
}

/**
 * One Gmail message, as headers, text and attachment metadata.
 *
 * text/plain wins when it carries anything: it is what the sender's client
 * produced from what they typed, and converting their HTML is always second
 * best. An empty or whitespace-only plain part counts as absent, because some
 * clients send one purely to satisfy multipart/alternative.
 */
export function parseMessage(message: GmailMessage): ParsedMimeMessage {
  const collected: Walked = { plain: [], html: [], attachments: [] };
  walk(message.payload, collected);

  const plain = collected.plain.join('\n').trim();
  const text = plain.length > 0 ? plain : htmlToText(collected.html.join('\n'));

  return {
    headers: readHeaders(message.payload),
    text: text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim(),
    attachments: collected.attachments,
  };
}

/** Types that usually mean a rate card, and are worth flagging for a human. */
const RATE_CARD_TYPES = [
  'application/pdf',
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.oasis.opendocument.spreadsheet',
];
const RATE_CARD_EXTENSIONS = /\.(pdf|csv|xlsx?|ods)$/i;

export function looksLikeRateCard(attachment: AttachmentInfo): boolean {
  if (RATE_CARD_TYPES.includes(attachment.mimeType.toLowerCase())) return true;
  return RATE_CARD_EXTENSIONS.test(attachment.filename);
}
