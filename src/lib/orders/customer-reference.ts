/**
 * The customer's own label for an order, cleaned.
 *
 * An agency has one Press Parrot login and gives it to its team. `reference`
 * is ours - LM-10428 - so when five people order through one account, the
 * label somebody typed is the only thing that tells their order from the
 * other four. We store it, show it, and search it. We never read it: it is
 * not parsed, not matched against anything and never acted on.
 *
 * Here rather than in `checkout-service` because two callers need it -
 * checkout and the edit on the order page - and because it is the kind of
 * rule worth being able to check without a database, a session or a Stripe
 * key. The same reason `promos/rules.ts` is its own file.
 */

/**
 * What the column will accept: 120 characters at most, trimmed, with nothing
 * in it that cannot be sent to Postgres. `undefined` for "no label", because
 * 0085 stores null rather than an empty string - whether an order has a
 * label has to be one question rather than two.
 */
export const MAX_CUSTOMER_REFERENCE = 120;

/*
  Control characters, and the ones that are not obviously control characters.

  C0 and DEL are the usual suspects. C1 (\u0080-\u009f) and the line and
  paragraph separators arrive by paste: a reference copied out of a
  spreadsheet cell or a Word document carries them, and they render as
  nothing while making two labels that look identical compare unequal.
  Replaced with a space rather than removed, so "Q4\nSarah" becomes
  "Q4 Sarah" rather than "Q4Sarah".
*/
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;

/*
  And the two that are nothing at all rather than a break.

  A byte order mark at the front of a pasted label, and a zero-width space
  in the middle of one, are both invisible: they make "Sarah Q4" and
  "Sarah Q4" different labels and a search for either find one of them.
  Removed rather than turned into a space, because unlike a newline they
  occupy no width on screen and inserting one would change what the person
  sees.

  Deliberately only those two. The zero-width joiner holds a family emoji
  together and the zero-width non-joiner is orthography in Persian and
  Hindi - removing either would break a label that is correct.
*/
const ZERO_WIDTH = /[\ufeff\u200b]/g;

/**
 * Clean a typed reference into what the database will take, or `undefined`.
 *
 * Nothing here rejects: a label is the customer's own, and refusing somebody's
 * purchase order number at checkout over a stray character would be refusing
 * the order. It is cut to fit instead, and the only input that yields nothing
 * is input that was nothing to begin with.
 */
export function cleanCustomerReference(value: string | undefined | null): string | undefined {
  const flattened = String(value ?? '')
    .replace(INVISIBLE, ' ')
    .replace(ZERO_WIDTH, '')
    // Runs of space collapse, because "Sarah     Q4" and "Sarah Q4" are the
    // same label to the person who typed them and a different one to a
    // search.
    .replace(/\s+/g, ' ')
    .trim();

  /*
    Cut by code point, not by UTF-16 unit.

    `slice(0, 120)` counts units, so a label whose 120th unit is half of an
    emoji is cut through the middle of it and leaves a lone surrogate - which
    cannot be encoded as UTF-8 and is refused on the way to Postgres, turning
    a long label into a failed checkout. Spreading to an array cuts whole
    characters, and it is also what `length()` counts in the database, so
    120 here is 120 there.
  */
  const cut = [...flattened].slice(0, MAX_CUSTOMER_REFERENCE).join('').trim();
  return cut || undefined;
}
