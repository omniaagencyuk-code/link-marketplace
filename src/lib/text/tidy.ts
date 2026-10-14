/**
 * Text a person typed, cleaned for storage.
 *
 * One copy of a rule that two features need: an order's customer reference
 * and a pricing enquiry are both free text from a human, both rendered on
 * screens we own, and both stored in a column with a length and a trim
 * constraint on it. Two copies of the cleaning would drift, and the one that
 * drifted would be the one letting a value through that the column refuses -
 * which surfaces as a failed checkout or a lost enquiry, not as a bug report.
 *
 * Nothing here rejects. It cuts to fit and tidies; the only input that comes
 * back as nothing is input that was nothing to begin with. Refusing somebody's
 * purchase order number over a stray character is refusing the order.
 */

/*
  Control characters, and the ones that are not obviously control characters.

  C0 and DEL are the usual suspects. C1 (\u0080-\u009f) and the line and
  paragraph separators arrive by paste: text copied out of a spreadsheet cell
  or a Word document carries them, and they render as nothing while making two
  values that look identical compare unequal. Replaced with a space rather
  than removed, so "Q4\u0085Sarah" becomes "Q4 Sarah" rather than "Q4Sarah".

  Note what is absent: \n, \r and \t are in the C0 range and would be caught
  here, so `multiline` below handles them before this runs.
*/
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;

/*
  And the two that are nothing at all rather than a break.

  A byte order mark at the front of a pasted value, and a zero-width space in
  the middle of one, are both invisible: they make two values that look
  identical compare unequal and a search for either find one of them. Removed
  rather than turned into a space, because unlike a newline they occupy no
  width and inserting one would change what the person sees.

  Deliberately only those two. The zero-width joiner holds a family emoji
  together and the zero-width non-joiner is orthography in Persian and Hindi -
  removing either would break a value that is correct.
*/
const ZERO_WIDTH = /[﻿​]/g;

export interface TidyOptions {
  /** Characters to keep, counted the way Postgres `length()` counts them. */
  maxChars: number;
  /**
   * Keep line breaks.
   *
   * A reference is one line and a run of whitespace in it is a typo. A
   * requirements box is somebody's paragraphs, and flattening them into one
   * line destroys what they wrote to be read.
   */
  multiline?: boolean;
}

/** One line: invisibles out, runs of whitespace to one space, ends trimmed. */
function tidyLine(value: string): string {
  return value
    .replace(INVISIBLE, ' ')
    .replace(ZERO_WIDTH, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Clean a typed value into what a bounded text column will take, or
 * `undefined` when there is nothing left.
 *
 * `undefined` rather than an empty string, because the columns that hold
 * these store null for absent: "is there a value" has to be one question
 * rather than two, or every read needs to know that '' and null mean the
 * same thing - and one of them will forget.
 */
export function tidyText(
  value: string | undefined | null,
  { maxChars, multiline = false }: TidyOptions,
): string | undefined {
  const raw = String(value ?? '');

  /*
    Multiline is tidied a line at a time rather than in one pass.

    Newlines are C0 characters, so the invisible sweep would turn every one
    of them into a space and flatten the paragraphs this option exists to
    keep. Splitting first means each line gets exactly the single-line
    treatment and the breaks between them are never candidates for it.
  */
  const flattened = multiline
    ? raw
        // CRLF and a lone CR both become one newline, so what is stored does
        // not depend on which operating system typed it.
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map(tidyLine)
        .join('\n')
        // Three or more blank lines is somebody leaning on the return key and
        // renders as a hole in an admin screen. Two is a paragraph break.
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    : tidyLine(raw);

  /*
    Cut by code point, not by UTF-16 unit.

    `slice(0, n)` counts units, so a value whose last kept unit is half of an
    emoji is cut through the middle of it and leaves a lone surrogate - which
    cannot be encoded as UTF-8 and is refused on the way to Postgres, turning
    a long value into a failed write. Spreading to an array cuts whole
    characters, and it is also what `length()` counts in the database, so
    `maxChars` here is `maxChars` there.
  */
  const cut = [...flattened].slice(0, maxChars).join('').trim();
  return cut || undefined;
}
