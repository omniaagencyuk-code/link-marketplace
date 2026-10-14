/**
 * Bytes to a string, in whatever character set a mail part declares.
 *
 * One copy, used by both readers: `gmail/mime.ts` for what the API returns
 * and `sourcing/mbox.ts` for an exported mailbox. Two copies of this had
 * already diverged on what `us-ascii` means, which is the sort of difference
 * that shows up as one importer reading a price and the other not.
 *
 * ## Why this does not just hand the label to TextDecoder
 *
 * Node reports `new TextDecoder('windows-1252').encoding` as `windows-1252`
 * and then decodes 0x80 to U+0080 rather than to `€`. Its decoder maps the
 * whole 0x80-0x9F range to C1 control characters - that is ISO-8859-1's
 * meaning, not windows-1252's - so every byte that windows-1252 defines and
 * latin1 does not comes out as an invisible control.
 *
 * Those bytes are exactly the ones Outlook writes: the euro sign, the curly
 * quotes and apostrophes, the en and em dashes, the ellipsis. A publisher
 * quoting "550€" in a Windows-encoded reply had the currency silently
 * removed from the text the extraction model reads, leaving a bare number -
 * and a lone price with no currency is a different fact from a price in
 * euros. `verify:gmail` has caught this since the fixture was added.
 *
 * So the windows-1252 family is decoded from a table here rather than
 * delegated. Everything else still goes to `TextDecoder`, which is right
 * about the rest of the legacy encodings and about the CJK ones.
 *
 * ## iso-8859-1 is decoded as windows-1252, deliberately
 *
 * That is what the WHATWG encoding standard says and what every browser
 * does, and it is more true of mail than of the web: a part declaring
 * iso-8859-1 that carries byte 0x92 is an Outlook apostrophe, because a C1
 * control in the body of an email is never something somebody meant. The
 * alternative reading turns "don't" into an invisible character.
 */

/**
 * The 0x80-0x9F range, from the WHATWG windows-1252 index.
 *
 * The five undefined positions (0x81, 0x8D, 0x8F, 0x90, 0x9D) keep their own
 * code point, which is what the standard says to do with them.
 */
const CP1252_HIGH = [
  0x20ac, 0x0081, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039,
  0x0152, 0x008d, 0x017d, 0x008f, 0x0090, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x009d, 0x017e, 0x0178,
];

/**
 * Labels the encoding standard folds into windows-1252.
 *
 * `us-ascii` and `ascii` are not here even though the standard includes
 * them, because each caller already decides what to do with a part that
 * declares ASCII and then sends eight-bit bytes, and those decisions are
 * pinned by their own tests. This changes how a declared *encoding* is read,
 * not what an undeclared one falls back to.
 */
const WINDOWS_1252 = new Set([
  'windows-1252',
  'windows1252',
  'cp1252',
  'cp-1252',
  'x-cp1252',
  'iso-8859-1',
  'iso8859-1',
  'iso88591',
  'iso_8859-1',
  'iso-ir-100',
  'latin1',
  'latin-1',
  'l1',
  'cp819',
  'ibm819',
  'csisolatin1',
]);

/** Normalise a charset as it arrives from a header: quoted, cased, padded. */
export function charsetLabel(charset?: string | null): string {
  return (charset ?? '')
    .trim()
    .toLowerCase()
    .replace(/^["']|["']$/g, '')
    .trim();
}

/** True when this label means windows-1252 under the encoding standard. */
export function isWindows1252(label: string): boolean {
  return WINDOWS_1252.has(label);
}

function decodeWindows1252(bytes: Buffer): string {
  let out = '';
  for (const byte of bytes) {
    // Every other byte is its own code point: ASCII below 0x80, and
    // latin1 from 0xa0 up, where windows-1252 and ISO-8859-1 agree.
    out += String.fromCharCode(byte >= 0x80 && byte <= 0x9f ? CP1252_HIGH[byte - 0x80]! : byte);
  }
  return out;
}

/**
 * Decode a part's bytes.
 *
 * `fallback` is what an empty or unrecognised label means, and the two
 * callers differ: a Gmail part with no charset is UTF-8 because that is what
 * the API sends, and an mbox part that says `us-ascii` is read as UTF-8
 * because an exported mailbox mislabels more often than it is truly ASCII.
 *
 * Nothing here throws. A mangled word in a reply is recoverable and a thrown
 * error loses the whole reply, so an unknown label falls back and invalid
 * bytes become replacement characters.
 */
export function decodeBytes(bytes: Buffer, charset?: string | null, fallback = 'utf-8'): string {
  const label = charsetLabel(charset) || fallback;

  if (isWindows1252(label)) return decodeWindows1252(bytes);

  try {
    return new TextDecoder(label, { fatal: false }).decode(bytes);
  } catch {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  }
}
