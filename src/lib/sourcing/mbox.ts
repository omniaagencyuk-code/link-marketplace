/**
 * Reading a Gmail Takeout mbox.
 *
 * Narrow on purpose: this parses what Takeout exports, not every mail format
 * ever written. A general mail library would bring a stream parser and a
 * dependency tree for a file an admin uploads a handful of times a year, and
 * the failure mode we care about - a reply that silently does not become a
 * draft - is easier to see in code we can read.
 *
 * Nothing here talks to a database or spends money. It turns bytes into
 * candidate messages and says which ones to skip, so it can be tested
 * against real exports without an API key.
 */

/** Our own outreach. These are the sent side of every thread, never a reply. */
const OUR_ADDRESSES = ['jack@omniamedia.uk'];

/** Subject our outreach uses, with or without the domain named. */
const OUTREACH_SUBJECT = /^\s*(?:re|fwd?|aw|sv|rv|antw)\s*:\s*|^\s*/i;
const ADVERTISEMENTS_ON = /advertisements?\s+on\s+(.+?)\s*$/i;

export interface ParsedMessage {
  messageId: string;
  fromAddress: string;
  fromName?: string;
  toAddress?: string;
  subject?: string;
  sentAt?: string;
  /** Quoted history removed. This is what the model reads. */
  bodyText: string;
  /** Everything, kept so a bad strip can be re-read without another upload. */
  bodyRaw: string;
  /** The domain our outreach named, where the subject names one. */
  askedAboutDomain?: string;
}

export type SkipReason = 'ours' | 'bounce' | 'no-message-id' | 'empty';

export interface MboxReadResult {
  messages: ParsedMessage[];
  skipped: { reason: SkipReason; subject?: string; from?: string }[];
}

// ----------------------------------------------------------------- splitting

/**
 * Split an mbox into raw messages.
 *
 * The separator is a line beginning "From " at the very start of a line. A
 * body line that would look like one is escaped as ">From " by every writer
 * that produces mbox, so an unescaped match is a real boundary.
 */
const MBOX_SEPARATOR = /^From \S+ (?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[ ,]/;

function splitMbox(text: string): string[] {
  const normalised = text.replace(/\r\n/g, '\n');
  const parts: string[] = [];
  let current: string[] = [];

  for (const line of normalised.split('\n')) {
    if (MBOX_SEPARATOR.test(line)) {
      if (current.length) parts.push(current.join('\n'));
      current = [];
      continue;
    }
    current.push(line.startsWith('>From ') ? line.slice(1) : line);
  }
  if (current.length) parts.push(current.join('\n'));

  return parts.filter((part) => part.trim().length > 0);
}

// ------------------------------------------------------------------ headers

/** Header name (lowercased) to value, with folded lines joined. */
function parseHeaders(head: string): Map<string, string> {
  const headers = new Map<string, string>();
  const lines = head.split('\n');
  let name = '';
  let value = '';

  const commit = () => {
    if (!name) return;
    const key = name.toLowerCase();
    // A repeated header keeps the first, which is the one Gmail wrote.
    if (!headers.has(key)) headers.set(key, value.trim());
  };

  for (const line of lines) {
    if (/^[ \t]/.test(line) && name) {
      value += ` ${line.trim()}`;
      continue;
    }
    const match = /^([!-9;-~]+):(.*)$/.exec(line);
    if (!match) continue;
    commit();
    name = match[1]!;
    value = match[2]!;
  }
  commit();
  return headers;
}

/** RFC 2047: =?UTF-8?B?...?= and =?ISO-8859-1?Q?...?= in subjects and names. */
function decodeEncodedWords(input: string): string {
  return input.replace(
    /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g,
    (whole, charset: string, encoding: string, data: string) => {
      try {
        const bytes =
          encoding.toUpperCase() === 'B'
            ? Buffer.from(data, 'base64')
            : Buffer.from(data.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (_m, hex) =>
                String.fromCharCode(parseInt(hex, 16)),
              ), 'binary');
        return decodeBytes(bytes, charset);
      } catch {
        return whole;
      }
    },
  );
}

function decodeBytes(bytes: Buffer, charset?: string): string {
  const label = (charset ?? 'utf-8').toLowerCase().replace(/['"]/g, '');
  try {
    return new TextDecoder(label === 'us-ascii' ? 'utf-8' : label).decode(bytes);
  } catch {
    return bytes.toString('utf8');
  }
}

/** "Jane <jane@site.com>" or "jane@site.com" */
function parseAddress(raw?: string): { address: string; name?: string } {
  if (!raw) return { address: '' };
  const decoded = decodeEncodedWords(raw);
  const angled = /<([^>]+)>/.exec(decoded);
  if (angled) {
    const name = decoded.slice(0, angled.index).trim().replace(/^"|"$/g, '');
    return { address: angled[1]!.trim().toLowerCase(), name: name || undefined };
  }
  return { address: decoded.trim().toLowerCase() };
}

// --------------------------------------------------------------------- body

function decodeTransfer(body: string, encoding?: string, charset?: string): string {
  const mechanism = (encoding ?? '7bit').trim().toLowerCase();

  if (mechanism === 'base64') {
    return decodeBytes(Buffer.from(body.replace(/\s+/g, ''), 'base64'), charset);
  }

  if (mechanism === 'quoted-printable') {
    const unfolded = body.replace(/=\r?\n/g, '');
    const bytes = Buffer.from(
      unfolded.replace(/=([0-9A-Fa-f]{2})/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16))),
      'binary',
    );
    return decodeBytes(bytes, charset);
  }

  return decodeBytes(Buffer.from(body, 'binary'), charset);
}

function paramOf(header: string | undefined, key: string): string | undefined {
  if (!header) return undefined;
  const match = new RegExp(`${key}\\s*=\\s*"?([^";]+)"?`, 'i').exec(header);
  return match?.[1]?.trim();
}

/**
 * The plain-text body.
 *
 * Prefers text/plain and falls back to stripping tags out of text/html,
 * because a publisher writing from Outlook often sends html only - and their
 * rate table is in it.
 */
function extractText(headers: Map<string, string>, body: string): string {
  const contentType = headers.get('content-type') ?? 'text/plain';
  const boundary = paramOf(contentType, 'boundary');

  if (!boundary) {
    const text = decodeTransfer(
      body,
      headers.get('content-transfer-encoding'),
      paramOf(contentType, 'charset'),
    );
    return /text\/html/i.test(contentType) ? htmlToText(text) : text;
  }

  const parts = body.split(new RegExp(`^--${escapeRegExp(boundary)}(?:--)?\\s*$`, 'm')).slice(1);
  const decoded = parts.map((part) => {
    const split = part.indexOf('\n\n');
    if (split === -1) return { type: '', text: '' };
    const partHeaders = parseHeaders(part.slice(0, split));
    const partType = partHeaders.get('content-type') ?? 'text/plain';
    const nested = paramOf(partType, 'boundary');
    // multipart/alternative inside multipart/mixed: recurse rather than
    // returning the raw nested source, which would reach the model as MIME.
    if (nested) {
      return { type: 'text/plain', text: extractText(partHeaders, part.slice(split + 2)) };
    }
    return {
      type: partType,
      text: decodeTransfer(
        part.slice(split + 2),
        partHeaders.get('content-transfer-encoding'),
        paramOf(partType, 'charset'),
      ),
    };
  });

  const plain = decoded.find((part) => /text\/plain/i.test(part.type) && part.text.trim());
  if (plain) return plain.text;

  const html = decoded.find((part) => /text\/html/i.test(part.type) && part.text.trim());
  if (html) return htmlToText(html.text);

  return decoded.map((part) => part.text).join('\n').trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Named HTML entities, as far as the Latin-1 supplement.
 *
 * Not decoding these is not a cosmetic problem: a Portuguese publisher's
 * "Ol&aacute;" and "pre&ccedil;o" would reach the model as mojibake, and a
 * price sitting next to text the model cannot read is a price it is likelier
 * to misattribute. The list stops at Latin-1 plus the few typographic marks
 * mail clients actually emit; anything rarer falls through to the numeric
 * forms below, which cover the whole of Unicode.
 */
const NAMED_ENTITIES: Record<string, string> = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  iexcl: '\u00a1', cent: '\u00a2', pound: '\u00a3', euro: '\u20ac', yen: '\u00a5',
  sect: '\u00a7', copy: '\u00a9', laquo: '\u00ab', reg: '\u00ae', deg: '\u00b0',
  plusmn: '\u00b1', micro: '\u00b5', para: '\u00b6', middot: '\u00b7', raquo: '\u00bb',
  frac12: '\u00bd', iquest: '\u00bf', times: '\u00d7', divide: '\u00f7',
  agrave: '\u00e0', aacute: '\u00e1', acirc: '\u00e2', atilde: '\u00e3', auml: '\u00e4', aring: '\u00e5',
  aelig: '\u00e6', ccedil: '\u00e7',
  egrave: '\u00e8', eacute: '\u00e9', ecirc: '\u00ea', euml: '\u00eb',
  igrave: '\u00ec', iacute: '\u00ed', icirc: '\u00ee', iuml: '\u00ef',
  ntilde: '\u00f1',
  ograve: '\u00f2', oacute: '\u00f3', ocirc: '\u00f4', otilde: '\u00f5', ouml: '\u00f6', oslash: '\u00f8',
  ugrave: '\u00f9', uacute: '\u00fa', ucirc: '\u00fb', uuml: '\u00fc',
  yacute: '\u00fd', yuml: '\u00ff', szlig: '\u00df',
  ndash: '\u2013', mdash: '\u2014', lsquo: '\u2018', rsquo: '\u2019',
  ldquo: '\u201c', rdquo: '\u201d', hellip: '\u2026', bull: '\u2022',
};

function decodeEntities(input: string): string {
  return input
    .replace(/&([a-zA-Z][a-zA-Z0-9]{1,31});/g, (whole, name: string) => {
      // Capitalised forms (&Aacute;) are the uppercase letter.
      const lower = name.toLowerCase();
      const value = NAMED_ENTITIES[lower];
      if (!value) return whole;
      return name[0] === name[0]!.toUpperCase() && lower !== name && value.length === 1
        ? value.toUpperCase()
        : value;
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_m, code: string) => String.fromCodePoint(Number(code)));
}

/** Enough to read a rate table out of an Outlook reply. Not a renderer. */
function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
      .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/t[dh]>/gi, '\t')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ---------------------------------------------------------- quoted history

/**
 * Remove our own outreach quoted underneath the reply.
 *
 * Worth doing for more than tokens: a reply of "yes, 150 EUR" sitting above
 * our email - which mentions guest posts, link insertions and several
 * example domains - gives the model a great deal of text that looks like
 * publisher terms and is actually ours.
 *
 * Conservative. If nothing matches, the body comes back whole; a missed
 * strip costs tokens, an over-eager one costs the answer.
 */
const QUOTE_MARKERS = [
  /^On .{10,120}\bwrote:\s*$/i,
  /^-{2,}\s*Original Message\s*-{2,}/i,
  /^_{5,}\s*$/,
  /^From:\s*.+@.+$/i,
  /^Am .{5,80} schrieb .{3,}:\s*$/i,
  /^El .{5,80} escribió:\s*$/i,
  /^Le .{5,80} a écrit\s*:\s*$/i,
  /^Il giorno .{5,80} ha scritto:\s*$/i,
  /^Em .{5,80} escreveu:\s*$/i,
];

export function stripQuotedHistory(body: string): string {
  const lines = body.split('\n');
  const kept: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;

    if (QUOTE_MARKERS.some((marker) => marker.test(line.trim()))) break;

    // A run of quoted lines that never returns to unquoted text is history.
    if (/^\s*>/.test(line)) {
      const rest = lines.slice(index);
      if (!rest.some((later) => later.trim() && !/^\s*>/.test(later))) break;
    }

    kept.push(line);
  }

  const text = kept.join('\n').trim();
  // Everything was quoted: keep the original rather than send an empty body.
  return text.length > 0 ? text : body.trim();
}

// ------------------------------------------------------------ classification

export function isOurOwnEmail(address: string): boolean {
  return OUR_ADDRESSES.includes(address.toLowerCase());
}

export function isBounce(address: string, subject?: string): boolean {
  const from = address.toLowerCase();
  if (from.includes('mailer-daemon') || from.startsWith('postmaster@')) return true;
  return /^(undeliverable|delivery status notification|returned mail|mail delivery failed)/i.test(
    subject ?? '',
  );
}

/**
 * The domain our outreach asked about.
 *
 * Our subject is "Advertisements on {domain}", and the publisher's client
 * echoes it back with a Re:. When we did not name one it reads
 * "Advertisements on your website", which is not a domain - the reply has to
 * supply it, and the model is told so.
 */
export function domainFromSubject(subject?: string): string | undefined {
  if (!subject) return undefined;
  const withoutPrefix = subject.replace(OUTREACH_SUBJECT, '');
  const match = ADVERTISEMENTS_ON.exec(withoutPrefix);
  if (!match) return undefined;

  const candidate = match[1]!.trim().toLowerCase();
  if (/^(your|our|the)\s+(website|site|blog)$/.test(candidate)) return undefined;
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(candidate)) return undefined;
  return candidate.replace(/^www\./, '');
}

// ------------------------------------------------------------------- reading

export function readMbox(raw: string): MboxReadResult {
  const messages: ParsedMessage[] = [];
  const skipped: MboxReadResult['skipped'] = [];
  const seen = new Set<string>();

  for (const part of splitMbox(raw)) {
    const split = part.indexOf('\n\n');
    const headers = parseHeaders(split === -1 ? part : part.slice(0, split));
    const body = split === -1 ? '' : part.slice(split + 2);

    const from = parseAddress(headers.get('from'));
    const subject = headers.get('subject')
      ? decodeEncodedWords(headers.get('subject')!)
      : undefined;

    if (isOurOwnEmail(from.address)) {
      skipped.push({ reason: 'ours', subject, from: from.address });
      continue;
    }
    if (isBounce(from.address, subject)) {
      skipped.push({ reason: 'bounce', subject, from: from.address });
      continue;
    }

    const messageId = (headers.get('message-id') ?? '').trim();
    if (!messageId) {
      skipped.push({ reason: 'no-message-id', subject, from: from.address });
      continue;
    }
    // Two copies in one export - inbox and All Mail - are one message.
    if (seen.has(messageId)) continue;
    seen.add(messageId);

    const bodyRaw = extractText(headers, body);
    const bodyText = stripQuotedHistory(bodyRaw);

    if (!bodyText.trim()) {
      skipped.push({ reason: 'empty', subject, from: from.address });
      continue;
    }

    const date = headers.get('date');
    const parsedDate = date ? new Date(date) : undefined;

    messages.push({
      messageId,
      fromAddress: from.address,
      fromName: from.name,
      toAddress: parseAddress(headers.get('to')).address || undefined,
      subject,
      sentAt:
        parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : undefined,
      bodyText,
      bodyRaw,
      askedAboutDomain: domainFromSubject(subject),
    });
  }

  return { messages, skipped };
}

/**
 * One pasted email.
 *
 * Takes it with or without headers: an admin copying out of Gmail usually
 * gets the body alone, so a pasted message with no Message-ID is given a
 * synthetic one derived from its content - which still dedupes an accidental
 * double paste.
 */
export function readPastedEmail(raw: string, fallbackFrom?: string): ParsedMessage | null {
  const text = raw.replace(/\r\n/g, '\n').trim();
  if (!text) return null;

  const looksLikeHeaders = /^(from|subject|date|message-id)\s*:/im.test(text.slice(0, 500));

  if (looksLikeHeaders) {
    const result = readMbox(`From pasted@local Thu Jan  1 00:00:00 2026\n${text}\n`);
    if (result.messages[0]) return result.messages[0];
  }

  const from = fallbackFrom?.trim().toLowerCase() ?? '';
  const bodyText = stripQuotedHistory(text);
  return {
    messageId: `pasted:${hash(text)}`,
    fromAddress: from,
    subject: undefined,
    bodyText,
    bodyRaw: text,
  };
}

/** Small non-cryptographic hash, only ever used to dedupe a double paste. */
function hash(input: string): string {
  let value = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    value ^= input.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return (value >>> 0).toString(36);
}
