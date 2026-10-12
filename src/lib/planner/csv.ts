import { toCsv } from '@/lib/import/csv';
import { domainKey, looksLikeDomain, monthStart } from './domain-key';
import type { PlannerLink, PlannerStatus } from '@/lib/types/planner';

/**
 * The planner's spreadsheet, in and out.
 *
 * Reuses `toCsv` and `parseCsvFile` from the admin importer rather than
 * writing a second pair. That module already handles quoted values,
 * embedded newlines, a byte order mark and - the part that matters - the
 * formula guard: a cell beginning `=`, `+`, `-` or `@` is prefixed so a
 * spreadsheet opens it as text rather than executing it. A planner export
 * is a file an agency mails to a client, so that guard is not optional and
 * it is not worth having a second copy of.
 */

/** The columns an export writes and an import understands. */
export const CSV_HEADERS = [
  'Domain',
  'Source',
  'DR',
  'Traffic',
  'Keywords',
  'Referring domains',
  'Link type',
  'Target URL',
  'Anchor text',
  'Anchor type',
  'Status',
  'Planned date',
  'Live date',
  'Live URL',
  'Price',
  'Currency',
  'Payment status',
  'Notes',
] as const;

/**
 * Blank, not zero.
 *
 * The rule the whole feature rests on, applied at the file boundary too. A
 * `0` written into the DR column of an export is a figure somebody will
 * read back in as a measurement, and the round trip would quietly turn
 * every unresearched row into a site with no authority.
 */
const num = (value: number | null): string => (value === null ? '' : String(value));

export function linksToCsv(links: PlannerLink[], statuses: PlannerStatus[]): string {
  const statusName = new Map(statuses.map((status) => [status.id, status.name]));

  return toCsv(
    [...CSV_HEADERS],
    links.map((link) => [
      link.domain,
      link.source,
      num(link.domainRating),
      num(link.organicTraffic),
      num(link.organicKeywords),
      num(link.referringDomains),
      link.linkType,
      link.targetUrl ?? '',
      link.anchorText,
      link.anchorType,
      statusName.get(link.statusId) ?? '',
      link.plannedDate ?? '',
      link.liveDate ?? '',
      link.liveUrl ?? '',
      link.priceMinor === null ? '' : String(link.priceMinor / 100),
      link.currency ?? '',
      link.paymentStatus,
      link.notes,
    ]),
  );
}

/** One row of a file, as the planner understands it. */
export interface ImportRow {
  domain: string;
  domainKey: string;
  source: string;
  domainRating: number | null;
  organicTraffic: number | null;
  organicKeywords: number | null;
  referringDomains: number | null;
  linkType: string;
  targetUrl: string | null;
  anchorText: string;
  anchorType: string;
  statusName: string;
  plannedDate: string | null;
  liveDate: string | null;
  liveUrl: string | null;
  priceMinor: number | null;
  currency: string | null;
  notes: string;
}

export interface ImportReading {
  rows: ImportRow[];
  /** Line number and what was wrong, for the rows that could not be read. */
  problems: { line: number; reason: string }[];
}

/**
 * Which column is which, without demanding an exact template.
 *
 * Headers are matched loosely - case, spaces, punctuation and a handful of
 * the names other tools use. An agency exporting from their own
 * spreadsheet should not have to rename columns first; the brief says not
 * to require a template and this is what that means in practice.
 */
const ALIASES: Record<keyof ImportRow | 'statusName', string[]> = {
  domain: ['domain', 'website', 'site', 'url', 'publisher'],
  domainKey: [],
  source: ['source', 'vendor', 'supplier', 'marketplace', 'platform'],
  domainRating: ['dr', 'domainrating', 'domainauthority', 'da', 'rating'],
  organicTraffic: ['traffic', 'organictraffic', 'visits', 'monthlytraffic'],
  organicKeywords: ['keywords', 'organickeywords', 'kw'],
  referringDomains: ['referringdomains', 'refdomains', 'rd', 'linkingdomains'],
  linkType: ['linktype', 'type', 'placementtype', 'placement'],
  targetUrl: ['targeturl', 'target', 'targetpage', 'landingpage', 'destination'],
  anchorText: ['anchortext', 'anchor'],
  anchorType: ['anchortype', 'anchorcategory'],
  statusName: ['status', 'state', 'stage'],
  plannedDate: ['planneddate', 'planned', 'duedate', 'date'],
  liveDate: ['livedate', 'publisheddate', 'published'],
  liveUrl: ['liveurl', 'livelink', 'publishedurl', 'articleurl'],
  priceMinor: ['price', 'cost', 'amount', 'spend'],
  currency: ['currency', 'ccy'],
  notes: ['notes', 'note', 'comments', 'comment'],
};

const simplify = (header: string) => header.toLowerCase().replace(/[^a-z0-9]/g, '');

export function mapHeaders(headers: string[]): Partial<Record<keyof ImportRow, string>> {
  const mapping: Partial<Record<keyof ImportRow, string>> = {};
  for (const header of headers) {
    const key = simplify(header);
    for (const [field, aliases] of Object.entries(ALIASES) as [keyof ImportRow, string[]][]) {
      if (mapping[field]) continue;
      if (aliases.includes(key)) {
        mapping[field] = header;
        break;
      }
    }
  }
  return mapping;
}

function toNumber(value: string | undefined): number | null {
  if (!value) return null;
  // "12,400" and "1.2K" are both things people keep in spreadsheets.
  const cleaned = value.trim().replace(/[, ]/g, '');
  const multiplier = /k$/i.test(cleaned) ? 1_000 : /m$/i.test(cleaned) ? 1_000_000 : 1;
  const parsed = Number(cleaned.replace(/[km]$/i, ''));
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * multiplier);
}

/**
 * A date, in the formats a spreadsheet actually holds.
 *
 * ISO first. `03/10/2026` is read day-first, because this is a UK product
 * and the alternative is silently turning the 3rd of October into the 10th
 * of March - a wrong date that looks completely plausible and that nobody
 * catches until a campaign report is late.
 */
function toDate(value: string | undefined): string | null {
  const raw = (value ?? '').trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const parts = raw.split(/[/.-]/);
  if (parts.length === 3) {
    const [a, b, c] = parts.map((part) => part.trim());
    if (a && b && c && c.length === 4) {
      const day = Number(a);
      const month = Number(b);
      const year = Number(c);
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }
  }
  return null;
}

function toUrl(value: string | undefined): string | null {
  const raw = (value ?? '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Read a parsed file into planner rows.
 *
 * A row with a usable domain is kept even if everything else is junk - the
 * brief asks for partial rows to import, and a planner where a bad price
 * loses the whole line is one an agency gives up on halfway through a
 * migration. What cannot be read is reported by line number rather than
 * dropped quietly.
 */
export function readImport(
  headers: string[],
  rows: Record<string, string>[],
  mapping = mapHeaders(headers),
): ImportReading {
  const out: ImportRow[] = [];
  const problems: { line: number; reason: string }[] = [];

  const cell = (row: Record<string, string>, field: keyof ImportRow): string | undefined => {
    const header = mapping[field];
    return header ? row[header] : undefined;
  };

  rows.forEach((row, index) => {
    // +2: one for the header line, one because people count from 1.
    const line = index + 2;
    const typed = (cell(row, 'domain') ?? '').trim();
    if (!typed) {
      problems.push({ line, reason: 'No domain in this row.' });
      return;
    }
    const key = domainKey(typed);
    if (!looksLikeDomain(key)) {
      problems.push({ line, reason: `"${typed}" does not look like a domain.` });
      return;
    }

    const price = toNumber(cell(row, 'priceMinor'));

    out.push({
      domain: typed,
      domainKey: key,
      source: (cell(row, 'source') ?? '').trim().slice(0, 60),
      domainRating: (() => {
        const value = toNumber(cell(row, 'domainRating'));
        return value === null ? null : Math.min(100, value);
      })(),
      organicTraffic: toNumber(cell(row, 'organicTraffic')),
      organicKeywords: toNumber(cell(row, 'organicKeywords')),
      referringDomains: toNumber(cell(row, 'referringDomains')),
      linkType: (cell(row, 'linkType') ?? '').trim().slice(0, 40),
      targetUrl: toUrl(cell(row, 'targetUrl')),
      anchorText: (cell(row, 'anchorText') ?? '').trim().slice(0, 200),
      anchorType: (cell(row, 'anchorType') ?? '').trim().slice(0, 40),
      statusName: (cell(row, 'statusName') ?? '').trim().slice(0, 40),
      plannedDate: toDate(cell(row, 'plannedDate')),
      liveDate: toDate(cell(row, 'liveDate')),
      liveUrl: toUrl(cell(row, 'liveUrl')),
      // Whole units in the file, minor units in the column.
      priceMinor: price === null ? null : Math.round(price * 100),
      currency: ((cell(row, 'currency') ?? '').trim().toUpperCase() || null)?.slice(0, 3) ?? null,
      notes: (cell(row, 'notes') ?? '').trim().slice(0, 2000),
    });
  });

  return { rows: out, problems };
}

/** The headers plus one filled-in line, for the downloadable template. */
export function plannerTemplateCsv(): string {
  return toCsv(
    [...CSV_HEADERS],
    [
      [
        'forbes.com',
        'Direct Publisher',
        '94',
        '12400000',
        '1200000',
        '420000',
        'Guest Post',
        'https://example.com/best-betting-sites',
        'best betting sites',
        'Exact Match',
        'Planned',
        '03/10/2026',
        '',
        '',
        '1350',
        'GBP',
        'unpaid',
        'Publisher wants 800 words.',
      ],
    ],
  );
}

/** First of the month, for assigning imported rows to a plan. */
export const importMonth = monthStart;
