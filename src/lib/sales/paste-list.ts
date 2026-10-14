import { isValidDomain, normaliseDomain } from '@/lib/import/normalise';

/**
 * A pasted list of prospects, read.
 *
 * The thing people actually have is a column copied out of a spreadsheet, so
 * this takes lines rather than a file, and it takes them in whatever order
 * the spreadsheet happened to put them.
 *
 * Three shapes, and they can be mixed in one paste:
 *
 *   example.com
 *   Acme Ltd, example.com
 *   Acme Ltd, example.com, 7
 *
 * The trailing number is how many of our own publishers were seen linking to
 * them - the count that falls out of stacking several Ahrefs exports and
 * counting the domains that appear in more than one. It is the only signal we
 * get about a prospect before spending anything, so it is worth the column.
 *
 * ## Why the domain is found rather than positioned
 *
 * The old parser took "the last field that looks like a domain", testing with
 * `normaliseDomain`, which returns a value for nearly any non-empty string -
 * `5` normalises to `5`, and `Acme Ltd` to `acme ltd`. So it was really
 * taking the last non-empty field, which happened to be right for
 * `Name, domain` and wrong for anything else. `example.com, 7` would have
 * read `7` as the domain and rejected the row.
 *
 * The test is `isValidDomain` now, which is the one that actually knows what
 * a hostname looks like. A line is read by finding its domain, not by
 * counting its commas.
 */

export interface PastedProspect {
  domain: string;
  companyName?: string;
  /** Undefined where the line carried no count. Never 0 by default. */
  placementsSeen?: number;
}

/** A field that is nothing but digits, and small enough to be a count. */
function asCount(field: string): number | null {
  if (!/^\d{1,5}$/.test(field)) return null;
  const parsed = Number(field);
  return Number.isFinite(parsed) ? parsed : null;
}

function looksLikeDomain(field: string): boolean {
  const normalised = normaliseDomain(field);
  return normalised !== null && isValidDomain(normalised);
}

export function parsePastedProspects(raw: string): PastedProspect[] {
  return raw
    .split(/[\r\n]+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const fields = line
        .split(/[,\t]/)
        .map((field) => field.trim())
        .filter(Boolean);

      if (fields.length === 0) return null;

      const domainIndex = fields.findIndex(looksLikeDomain);

      /*
        No domain anywhere in the line. The last field is handed on so the
        rejection names what was pasted rather than an empty string - a
        header row from a CSV export arrives here, and "Domain" is a more
        useful thing to see reported than nothing.
      */
      if (domainIndex === -1) {
        return { domain: fields[fields.length - 1] ?? line };
      }

      const rest = fields.filter((_, index) => index !== domainIndex);

      /* The last bare number, so `Acme 24, example.com, 7` reads 7 rather
         than the 24 in the company's name. */
      let placementsSeen: number | undefined;
      let countIndex = -1;
      for (let index = rest.length - 1; index >= 0; index -= 1) {
        const count = asCount(rest[index] ?? '');
        if (count !== null) {
          placementsSeen = count;
          countIndex = index;
          break;
        }
      }

      const companyName = rest
        .filter((_, index) => index !== countIndex)
        .join(' ')
        .trim();

      return {
        domain: fields[domainIndex] ?? '',
        companyName: companyName || undefined,
        placementsSeen,
      };
    })
    .filter((entry): entry is PastedProspect => entry !== null);
}
