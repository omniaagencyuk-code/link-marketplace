import { bestContact, rankContacts, type RankedContact } from './contact-ranking';
import { isValidDomain, normaliseDomain } from '@/lib/import/normalise';
import type { HunterPerson } from './hunter-client';

/**
 * A Hunter export, read into prospects and the people at them.
 *
 * The Sales Centre finds contacts by asking Hunter's API, one prospect at a
 * time, and charging a credit for each. That is the right shape when the
 * list arrives as bare domains. It is the wrong shape - and the expensive
 * one - when somebody has already run the search in Hunter's own UI and
 * downloaded the result, because the credits are spent and the answer is
 * sitting in a file.
 *
 * So this reads that file. **Nothing here spends anything**: no API call, no
 * row in `hunter_lookups`, no credit guard to satisfy, because nothing is
 * being bought. The data is Hunter's, which is why the contacts it produces
 * are still recorded with `source: 'hunter'` - where it came from has not
 * changed, only how it got here.
 *
 * ## Columns are found, never counted
 *
 * The same lesson `paste-list.ts` records about domains. Hunter's column
 * order depends on which fields were selected at export time, and a reader
 * that trusts position silently reads job titles as email addresses the
 * first time somebody unticks a box. Every column is looked up by its
 * heading, and a file missing the one column that matters is refused rather
 * than half-read.
 *
 * ## An address that will bounce is not imported
 *
 * `prospect_contacts` holds named people's work addresses, which AGENTS.md
 * puts in the same grade as the rest of the Sales Centre's tables. Keeping
 * an address we have been told will bounce is holding somebody's personal
 * data to no end, and the one use it has - being picked as a recipient -
 * is a bounce we chose. They are counted in the outcome so the number is
 * visible rather than silently missing.
 *
 * `invalid` and `disposable`, which is the pair `bestContact` refuses to
 * return for exactly the same reason. `disposable` matters more than it
 * looks: the column these rows land in accepts five words and that is not
 * one of them, so a disposable address kept and renamed `unknown` would
 * both lose the signal the ranker rejects it by and become eligible to be
 * written to.
 *
 * Everything else is kept, including `accept_all`: that status means the
 * server answers yes to everything, so Hunter cannot tell, and the ranker
 * already scores it below a verified address rather than treating it as a
 * reason to throw somebody away.
 */

export interface ImportedProspect {
  domain: string;
  companyName?: string;
  /** Two-letter code where the export carried one. Never guessed. */
  countryCode?: string;
  people: HunterPerson[];
}

export interface ContactCsvOutcome {
  prospects: ImportedProspect[];
  /** Data rows read, before anything was dropped. */
  rows: number;
  dropped: {
    /** Hunter marked the address invalid. */
    undeliverable: number;
    /** No address at all, so there is nobody to write to. */
    noEmail: number;
    /** No domain, and none could be read off the address. */
    noDomain: number;
    /** The same address twice at one company. */
    duplicate: number;
  };
}

export class ContactCsvError extends Error {}

/**
 * A CSV reader that respects quotes.
 *
 * Hunter's job titles carry commas - "Vice President, Marketing" - and its
 * street addresses carry them too, so splitting on commas reads one row as
 * several and puts a street name in the email column. Quotes, doubled quotes
 * inside them, CRLF endings and a leading byte-order mark are all handled
 * here because all four appear in exports people actually have.
 */
export function readCsv(source: string): string[][] {
  // Written as the escape, not the character: a literal byte-order mark in
  // a regex is invisible in every editor and diff it passes through.
  const text = source.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const ch = text[index]!;
    if (quoted) {
      if (ch === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch !== '\r') cell += ch;
  }

  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  // A trailing newline leaves one empty row, which is not a record.
  return rows.filter((entry) => entry.some((value) => value.trim() !== ''));
}

const tidy = (value: string) => value.replace(/\s+/g, ' ').trim();
const key = (value: string) => tidy(value).toLowerCase();

/**
 * What each column is called, in the exports we have seen.
 *
 * Several spellings per field because Hunter's own wording has changed and
 * because people re-title columns in a spreadsheet before sending the file
 * on. The first heading that matches wins.
 */
const COLUMNS = {
  email: ['email address', 'email'],
  domain: ['domain name', 'domain', 'input domain name', 'website'],
  company: ['organization', 'organisation', 'company', 'company name'],
  firstName: ['first name', 'firstname'],
  lastName: ['last name', 'lastname'],
  position: ['job title', 'position', 'position raw', 'title'],
  department: ['department'],
  seniority: ['seniority'],
  linkedin: ['linkedin url', 'linkedin'],
  confidence: ['confidence score', 'confidence'],
  verification: ['verification status', 'verification', 'status'],
  country: ['country', 'country code'],
} as const;

type Field = keyof typeof COLUMNS;

function locate(header: string[]): Record<Field, number> {
  const seen = header.map(key);
  const found = {} as Record<Field, number>;
  for (const [field, names] of Object.entries(COLUMNS) as [Field, readonly string[]][]) {
    found[field] = names.reduce<number>(
      (at, name) => (at >= 0 ? at : seen.indexOf(name)),
      -1,
    );
  }
  return found;
}

/** The host out of an address, for a file with no domain column. */
function domainFromEmail(email: string): string {
  const at = email.lastIndexOf('@');
  return at > 0 ? email.slice(at + 1) : '';
}

/**
 * Hunter's verification words, kept as they are where we know them.
 *
 * Anything else becomes `unknown` rather than being passed through: the
 * column it ends up in only accepts these five, and one unrecognised word -
 * a new status, a translated export, a spreadsheet that title-cased the
 * column - would fail the write for every row in its chunk rather than for
 * the row that carried it.
 */
const KNOWN_VERIFICATION = new Set(['valid', 'accept_all', 'invalid', 'unknown', 'unverified']);

export function parseContactCsv(source: string): ContactCsvOutcome {
  const rows = readCsv(source);
  if (rows.length === 0) throw new ContactCsvError('That file is empty.');

  const [header, ...body] = rows;
  const at = locate(header!);

  /*
    The address is the only column without which there is nothing to do. A
    missing domain is recoverable - it is in the address - and everything
    else is detail. Said by name, because "no rows imported" sends somebody
    looking at their data rather than at their column headings.
  */
  if (at.email < 0) {
    throw new ContactCsvError(
      `No email column. Looked for ${COLUMNS.email.join(' or ')}; this file has ${header!
        .map(tidy)
        .filter(Boolean)
        .slice(0, 8)
        .join(', ')}.`,
    );
  }

  const outcome: ContactCsvOutcome = {
    prospects: [],
    rows: body.length,
    dropped: { undeliverable: 0, noEmail: 0, noDomain: 0, duplicate: 0 },
  };

  const byDomain = new Map<string, ImportedProspect>();
  const addresses = new Map<string, Set<string>>();

  for (const row of body) {
    const cell = (field: Field): string =>
      at[field] >= 0 ? tidy(row[at[field]] ?? '') : '';

    const email = cell('email').toLowerCase();
    if (!email || !email.includes('@') || email.startsWith('@') || email.endsWith('@')) {
      outcome.dropped.noEmail += 1;
      continue;
    }

    const verification = key(cell('verification'));
    if (verification === 'invalid' || verification === 'disposable') {
      outcome.dropped.undeliverable += 1;
      continue;
    }

    const domain = normaliseDomain(cell('domain') || domainFromEmail(email));
    if (!domain || !isValidDomain(domain)) {
      outcome.dropped.noDomain += 1;
      continue;
    }

    const already = addresses.get(domain) ?? new Set<string>();
    if (already.has(email)) {
      outcome.dropped.duplicate += 1;
      continue;
    }
    already.add(email);
    addresses.set(domain, already);

    const confidence = Number(cell('confidence'));
    const country = cell('country').toUpperCase();

    const person: HunterPerson = {
      email,
      firstName: cell('firstName') || undefined,
      lastName: cell('lastName') || undefined,
      position: cell('position') || undefined,
      department: cell('department') || undefined,
      seniority: cell('seniority') || undefined,
      linkedin: cell('linkedin') || undefined,
      confidence:
        Number.isFinite(confidence) && confidence >= 0 && confidence <= 100
          ? Math.round(confidence)
          : undefined,
      verification: KNOWN_VERIFICATION.has(verification) ? verification : 'unknown',
    };

    const existing = byDomain.get(domain);
    if (existing) {
      existing.people.push(person);
      // The first row that names the company wins; later blanks do not erase it.
      existing.companyName ??= cell('company') || undefined;
      existing.countryCode ??= /^[A-Z]{2}$/.test(country) ? country : undefined;
      continue;
    }

    byDomain.set(domain, {
      domain,
      companyName: cell('company') || undefined,
      countryCode: /^[A-Z]{2}$/.test(country) ? country : undefined,
      people: [person],
    });
  }

  outcome.prospects = [...byDomain.values()];
  return outcome;
}

/**
 * Who to write to at each company, and everyone else worth keeping.
 *
 * `bestContact` is the Sales Centre's own ranker, unchanged and uncopied -
 * the same function that picks a recipient out of what Hunter's API
 * returns, which is the same question asked of the same shape. A second
 * ranking for imported contacts would be a second idea of who reads email
 * at a forty-person agency, and the two would drift.
 *
 * A company where the ranker refuses everyone comes back with `selected`
 * null rather than being dropped. The people are still worth holding - the
 * next pass, or a person looking at the screen, may pick one - and a
 * prospect that silently vanished from an import is the failure
 * `importDomains` goes to some length to avoid.
 */
export interface RankedProspect extends ImportedProspect {
  ranked: RankedContact[];
  selected: RankedContact | null;
}

export function rankImported(prospects: ImportedProspect[]): RankedProspect[] {
  return prospects.map((prospect) => ({
    ...prospect,
    ranked: rankContacts(prospect.people),
    selected: bestContact(prospect.people),
  }));
}
