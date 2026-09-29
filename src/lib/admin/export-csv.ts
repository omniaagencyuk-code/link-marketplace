/**
 * Turning rows into a CSV somebody opens in Excel.
 *
 * Two things make this worth being a tested function rather than a join with
 * commas.
 *
 * The first is quoting. A publisher's notes contain commas, quotation marks
 * and newlines, because they were written by a person in an email, and any of
 * the three silently shifts every later column into the wrong one.
 *
 * The second is that a spreadsheet treats a leading =, +, - or @ as a
 * formula. The text in this export came from strangers - publisher names,
 * titles, notes read out of their replies - so a cell reading
 * `=HYPERLINK("http://...")` is a link somebody's spreadsheet offers to
 * follow, and worse is possible. Every such cell is prefixed with an
 * apostrophe, which Excel and Sheets both read as "this is text" and neither
 * displays.
 */

/** Characters a spreadsheet will try to evaluate when they lead a cell. */
const FORMULA_LEAD = /^[=+\-@\t\r]/;

/**
 * Make a cell a spreadsheet will not evaluate.
 *
 * Exported on its own because the CSV importer writes files too, and two
 * copies of this is how the rule gets fixed in one place and not the other.
 */
export function defuseFormula(text: string): string {
  return FORMULA_LEAD.test(text) ? `'${text}` : text;
}

export function csvCell(value: unknown): string {
  if (value == null) return '';

  // Defused before quoting, so the apostrophe ends up inside the quotes.
  const text = defuseFormula(String(value));

  // A cell needs quoting if it contains the delimiter, a quote or a newline.
  // Quoting more than necessary is harmless; quoting less corrupts the file.
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => unknown;
}

/**
 * A whole file, header row first.
 *
 * CRLF line endings, which is what RFC 4180 says and what stops Excel on
 * Windows reading a multi-line cell as several rows.
 */
export function toCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
  const lines = [columns.map((column) => csvCell(column.header)).join(',')];
  for (const row of rows) {
    lines.push(columns.map((column) => csvCell(column.value(row))).join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}

/**
 * A filename that sorts by date and says what it holds.
 *
 * Dated because these accumulate in a downloads folder, and a file called
 * `websites.csv` three times over is three files nobody can tell apart.
 */
export function csvFilename(prefix: string, on = new Date()): string {
  const stamp = on.toISOString().slice(0, 10);
  return `${prefix}-${stamp}.csv`;
}
