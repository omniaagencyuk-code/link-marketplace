/**
 * The links a publisher sent instead of a price.
 *
 * A large share of replies never quote a number: they point at a Google
 * Sheet, a PDF proposal, a Drive folder. The price is real and the publisher
 * is keen - it just is not in the text we read, so the email produces no
 * draft and lands in a list nobody can act on.
 *
 * This pulls the links back out of the stored body so that list becomes a
 * worklist. Pure: no network, no database. Nothing here fetches a URL, and
 * nothing downstream should either without a deliberate decision - these
 * addresses come from strangers' email.
 */

export type LinkKind = 'sheet' | 'doc' | 'drive' | 'file' | 'other';

export interface FoundLink {
  url: string;
  kind: LinkKind;
}

/*
  Noise, in rough order of how often it turns up.

  Every reply carries a signature, and most carry a tracking pixel and an
  unsubscribe link. None of them is a rate card, and a worklist that lists
  six links per row where one matters is a worklist nobody reads.
*/
const NOISE = [
  /unsubscribe/i,
  /\/optout|opt-out/i,
  /list-manage\.com/i,
  /mailchimp|sendgrid|hubspot|mailtrack|mailgun|sparkpost/i,
  /googleusercontent\.com/i,
  /\.(png|jpe?g|gif|webp|svg|ico|bmp)($|\?)/i,
  /facebook\.com|twitter\.com|x\.com|linkedin\.com|instagram\.com|youtube\.com|t\.me|wa\.me|pinterest\./i,
  /schema\.org|w3\.org|gravatar\.com/i,
  /^https?:\/\/(?:www\.)?google\.com\/(?:maps|search)/i,
];

const KINDS: [RegExp, LinkKind][] = [
  [/docs\.google\.com\/spreadsheets/i, 'sheet'],
  [/docs\.google\.com\/document|docs\.google\.com\/presentation/i, 'doc'],
  [/drive\.google\.com/i, 'drive'],
  [/dropbox\.com|wetransfer\.com|1drv\.ms|onedrive\.live\.com|box\.com|mega\.nz/i, 'drive'],
  [/\.(pdf|xlsx?|csv|docx?|ods|odt)($|\?)/i, 'file'],
  [/airtable\.com|notion\.so|notion\.site|coda\.io/i, 'doc'],
];

function kindOf(url: string): LinkKind {
  for (const [pattern, kind] of KINDS) {
    if (pattern.test(url)) return kind;
  }
  return 'other';
}

/** Where a rate card is most likely to be, first. */
const RANK: Record<LinkKind, number> = { sheet: 0, file: 1, doc: 2, drive: 3, other: 4 };

const URL_PATTERN = /https?:\/\/[^\s<>"')\]]+/gi;

/**
 * Trim what a sentence leaves stuck to a URL.
 *
 * "see https://example.com/rates." ends with a full stop that is punctuation,
 * not path - but a trailing slash is path, and a closing bracket is only
 * junk when nothing opened it.
 */
function tidy(raw: string): string {
  let url = raw.replace(/[.,;:!?'"]+$/g, '');
  while (url.endsWith(')') && (url.match(/\(/g)?.length ?? 0) < (url.match(/\)/g)?.length ?? 0)) {
    url = url.slice(0, -1);
  }
  return url;
}

/**
 * Every link worth a human's attention, best candidate first.
 *
 * Deduplicated on the whole URL rather than the domain: a publisher who sends
 * two different sheets has sent two rate cards, and one of them would
 * otherwise vanish.
 */
export function extractLinks(body: string, limit = 12): FoundLink[] {
  if (!body) return [];

  const seen = new Set<string>();
  const found: FoundLink[] = [];

  for (const match of body.match(URL_PATTERN) ?? []) {
    const url = tidy(match);
    if (url.length < 12 || url.length > 500) continue;
    if (NOISE.some((pattern) => pattern.test(url))) continue;
    if (seen.has(url)) continue;

    seen.add(url);
    found.push({ url, kind: kindOf(url) });
  }

  return found.sort((a, b) => RANK[a.kind] - RANK[b.kind]).slice(0, limit);
}

/**
 * Is this email worth putting in front of somebody?
 *
 * An attachment or a link out is the whole signal. A reply with neither
 * produced no draft for some other reason - no prices at all, a legal
 * threat, a bounce - and putting it on a rate-card worklist would only
 * bury the ones that matter.
 */
export function looksLikeRateCardLead(email: {
  attachments?: { filename: string; mimeType: string; size: number }[] | null;
  hasRateCard?: boolean | null;
  bodyText?: string | null;
}): boolean {
  if (email.hasRateCard) return true;
  if ((email.attachments ?? []).length > 0) return true;
  return extractLinks(email.bodyText ?? '', 1).length > 0;
}
