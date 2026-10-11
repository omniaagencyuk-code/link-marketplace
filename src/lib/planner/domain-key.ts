/**
 * Turning what somebody typed into something that can be matched.
 *
 * A planner is filled by paste. The same publisher arrives as
 * `https://www.Forbes.com/`, `forbes.com/sites/whoever/`, and
 * `FORBES.COM` - and all three are one site, so the duplicate check and the
 * Press Parrot metric lookup have to agree that they are.
 *
 * ## What it does not do
 *
 * It does not fold subdomains into their parent. `news.example.com` is a
 * different publication from `example.com` as often as it is the same one,
 * and a planner that merges them records a link against the wrong site and
 * reports a duplicate that is not one. Only `www.` goes, because `www.` is
 * never a different publication.
 *
 * The original is stored beside the key, so getting this wrong later costs
 * a re-derivation rather than the customer's own spelling.
 */
export function domainKey(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return '';

  /*
    Parsed as a URL when it can be, because the URL parser already knows
    about ports, credentials, IDN and the places a path can start. The
    string fallback is for input it refuses outright.
  */
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;

  let host: string;
  try {
    host = new URL(withScheme).hostname;
  } catch {
    host = trimmed
      .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
      .split('/')[0]!
      .split('?')[0]!
      .split('#')[0]!
      .split('@')
      .pop()!
      .split(':')[0]!;
  }

  // A single leading `www.`, and only that. `www.www.example.com` is a
  // hostname somebody typed wrong, not two prefixes to peel.
  return host.replace(/^www\./, '');
}

/**
 * Is this plausibly a domain at all?
 *
 * Deliberately loose. The brief asks for validation that is not
 * "unnecessarily restrictive", and a planner that refuses a new gTLD or an
 * IDN because a regex predates it is a planner somebody goes back to Excel
 * over. One dot, no spaces, and a length a hostname can have is the bar.
 */
export function looksLikeDomain(value: string): boolean {
  const key = domainKey(value);
  return key.length > 2 && key.length <= 253 && !/\s/.test(key) && key.includes('.');
}

/** The first of the month a date falls in, as `YYYY-MM-DD`. */
export function monthStart(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(`${value.slice(0, 10)}T00:00:00Z`) : value;
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

/** "October 2026", from a `YYYY-MM-DD`. */
export function monthLabel(month: string, locale = 'en-GB'): string {
  const date = new Date(`${month.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return month;
  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/** The month `offset` months from this one, as `YYYY-MM-01`. */
export function shiftMonth(month: string, offset: number): string {
  const date = new Date(`${month.slice(0, 10)}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return monthStart(date);
}
