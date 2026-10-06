import Papa from 'papaparse';

/**
 * Reading a rate card that arrived as a spreadsheet.
 *
 * Pure: bytes or text in, a readable table out. No network, no model, no DOM -
 * so every rule below can be checked against the file shape that triggers it,
 * which matters because the failure modes here are silent ones.
 *
 * ## It does not extract anything
 *
 * The output goes into the same box a person pastes into, and from there down
 * the same path: a human reads it, confirms it, the reply goes back into the
 * extraction queue, the model reads it, and a draft is approved by hand. A
 * CSV is not a more trustworthy source than an email just because it has
 * columns - a publisher's own sheet says "Price" and means four different
 * things across four rows - so it gets the same scrutiny rather than a
 * shortcut past it.
 *
 * That also means no column mapping. `src/lib/import/` maps columns because
 * it reads *our* template; a publisher's sheet has whatever headings they
 * felt like, and guessing which column is a price is how a link-insertion fee
 * becomes a guest post price.
 */

/** A rate card is small. More than this is somebody's whole database. */
export const MAX_CSV_BYTES = 2 * 1024 * 1024;
export const MAX_CSV_ROWS = 2_000;

/** What the file picker and the drop handler accept. */
export const ACCEPTED_SHEET_TYPES = [
  'text/csv',
  'text/tab-separated-values',
  'text/plain',
  'application/csv',
  'application/vnd.ms-excel',
];

export const ACCEPTED_SHEET_EXTENSIONS = ['.csv', '.tsv', '.txt'];

/**
 * Spreadsheets we cannot read, routed here anyway.
 *
 * `looksLikeSheet` answers "is somebody trying to hand us a spreadsheet",
 * not "can we read it" - so these come down this path and are refused by
 * `decodeSheetBytes` with a message that names the problem.
 *
 * Routing them by readability instead was the bug: an .xlsx fell through to
 * the image branch and got "nothing readable in that
 * (application/vnd.openxmlformats-officedocument.spreadsheetml.sheet)", which
 * is true, useless, and not the sentence that tells somebody to save it as
 * CSV. The specific message existed and was unreachable.
 */
export const UNREADABLE_SHEET_EXTENSIONS = ['.xlsx', '.xls', '.ods', '.numbers'];

export interface SheetText {
  text: string;
  /**
   * The bytes were not UTF-8 and were re-read as Windows-1252.
   *
   * Surfaced rather than hidden: it is the difference between "£250" and
   * "?250", and the reviewer should know which file did it.
   */
  reEncoded: boolean;
}

/**
 * Bytes to text, handling the encoding Excel actually writes.
 *
 * This is the rule worth having. Excel on Windows saves CSV as Windows-1252,
 * not UTF-8, and in Windows-1252 a pound sign is the single byte 0xA3 - which
 * is not valid UTF-8 and decodes to the replacement character. "£250" becomes
 * "�250", the currency is gone, and the extraction rules then do exactly
 * what they should with a price that has no currency: flag it, or leave it
 * unknown.
 *
 * So the file is decoded strictly as UTF-8 first, and only where that fails
 * is it re-read as Windows-1252. Strictly, because a lenient decode produces
 * replacement characters instead of throwing, and a silent "£" is the bug
 * this exists to prevent.
 */
export function decodeSheetBytes(buffer: ArrayBuffer): SheetText | { error: string } {
  const bytes = new Uint8Array(buffer);

  if (bytes.byteLength === 0) return { error: 'That file is empty.' };
  if (bytes.byteLength > MAX_CSV_BYTES) {
    return {
      error: `That file is ${(bytes.byteLength / 1024 / 1024).toFixed(1)}MB. A rate card should be well under ${MAX_CSV_BYTES / 1024 / 1024}MB - this looks like the wrong file.`,
    };
  }

  /*
    An .xlsx or .ods is a zip archive, not a sheet.

    It is the commonest wrong file to pick, and parsing it as text produces a
    page of binary that looks like it half worked. Detected by the archive's
    own magic bytes rather than by the extension, because a renamed file is
    still a zip.
  */
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05)) {
    return {
      error:
        'That is an Excel or OpenDocument file, which is a zip archive rather than text. ' +
        'Open it and save as CSV, or copy the rows and paste them straight into the box.',
    };
  }

  /*
    An old .xls is an OLE compound file rather than a zip, so it has its own
    signature. Same message: the fix is the same.
  */
  if (
    bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0 &&
    bytes[4] === 0xa1 && bytes[5] === 0xb1 && bytes[6] === 0x1a && bytes[7] === 0xe1
  ) {
    return {
      error:
        'That is an old Excel file, which is not text. Open it and save as CSV, or copy the ' +
        'rows and paste them straight into the box.',
    };
  }

  // A PDF, the other common wrong pick, with its own clear message.
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return {
      error: 'That is a PDF. Open it, screenshot the rates, and paste the screenshot instead.',
    };
  }

  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { text, reEncoded: false };
  } catch {
    // Not UTF-8. Almost always Excel's Windows-1252, which is what keeps the
    // pound and euro signs intact.
    try {
      const text = new TextDecoder('windows-1252').decode(bytes);
      return { text, reEncoded: true };
    } catch {
      return { error: 'That file is not text we can read. Save it as CSV and try again.' };
    }
  }
}

export interface CsvTable {
  /** The table, ready to drop into the box a person reads before confirming. */
  text: string;
  rows: number;
  columns: number;
  /** Rows beyond the cap, dropped. */
  truncated: number;
}

/**
 * A delimited file, rendered as a table.
 *
 * Parsed without a header row on purpose. A rate card may or may not have
 * one, and `header: true` on a file that does not silently promotes the first
 * site's prices into column names - losing a row, and a publisher's cheapest
 * one at that. Every row is rendered, and the model reads the first as a
 * heading if it looks like one, exactly as it does for a table pasted in by
 * hand.
 *
 * Papa Parse works out the delimiter, so a tab-separated export or a
 * semicolon-separated European one both work without being told.
 */
export function readRateCardCsv(contents: string): { ok: true; table: CsvTable } | { ok: false; error: string } {
  const trimmed = contents.replace(/^﻿/, '').trim();
  if (!trimmed) return { ok: false, error: 'That file has nothing in it.' };

  const parsed = Papa.parse<string[]>(trimmed, {
    header: false,
    skipEmptyLines: 'greedy',
  });

  const all = (parsed.data ?? [])
    .map((row) => (Array.isArray(row) ? row.map((cell) => String(cell ?? '').trim()) : []))
    .filter((row) => row.some((cell) => cell !== ''));

  if (all.length === 0) return { ok: false, error: 'No rows could be read out of that file.' };

  /*
    One column means it did not parse as a table.

    Usually a file saved with a delimiter Papa could not detect, or prose
    pasted into a .csv. Saying so is better than handing over a column of
    sentences and letting the model do its best with it - though a single
    column that is genuinely a list of domains is a real thing, so this only
    complains when there is more than one row and none of them split.
  */
  const columns = Math.max(...all.map((row) => row.length));
  if (columns === 1 && all.length > 1) {
    return {
      ok: false,
      error:
        'That read as one column, so the delimiter was not recognised. Open it, copy the rows, ' +
        'and paste them into the box - a table copied from a spreadsheet pastes in with its columns intact.',
    };
  }

  const kept = all.slice(0, MAX_CSV_ROWS);

  /*
    Trailing empty columns dropped.

    A sheet saved after someone clicked into column Z carries twenty-five
    empty cells on every row. Harmless to a parser and pure noise to anybody
    reading the box - and, in a prompt, several hundred tokens of nothing.
  */
  let width = 0;
  for (const row of kept) {
    for (let index = row.length - 1; index >= 0; index -= 1) {
      if (row[index] !== '') {
        width = Math.max(width, index + 1);
        break;
      }
    }
  }
  width = Math.max(1, width);

  const text = kept
    .map((row) =>
      Array.from({ length: width }, (_, index) => row[index] ?? '')
        .join(' | ')
        .replace(/\s+\|\s+$/, ''),
    )
    .join('\n');

  return {
    ok: true,
    table: {
      text,
      rows: kept.length,
      columns: width,
      truncated: all.length - kept.length,
    },
  };
}

/**
 * Should this file go down the spreadsheet path?
 *
 * Deliberately "is somebody handing us a spreadsheet" rather than "can we
 * read it". An .xlsx answers yes and is then refused by `decodeSheetBytes`
 * with a message that says to save it as CSV - which is the useful sentence,
 * and which was unreachable while this function answered the narrower
 * question and let Excel files fall through to the image handler.
 */
export function looksLikeSheet(file: { name?: string; type?: string }): boolean {
  const name = (file.name ?? '').toLowerCase();

  if (
    [...ACCEPTED_SHEET_EXTENSIONS, ...UNREADABLE_SHEET_EXTENSIONS].some((extension) =>
      name.endsWith(extension),
    )
  ) {
    return true;
  }

  const type = file.type ?? '';
  if (ACCEPTED_SHEET_TYPES.includes(type)) return true;

  // The mime types browsers give Excel and OpenDocument files.
  return (
    type.includes('spreadsheet') ||
    type === 'application/vnd.ms-excel' ||
    type === 'application/vnd.oasis.opendocument.spreadsheet'
  );
}
