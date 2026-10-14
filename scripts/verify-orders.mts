/**
 * Prove the customer's own reference on an order is cleaned to something the
 * column will take.
 *
 * No database, no network, no key: the rule is a pure function, and the
 * reason it is one is that this check can then be exhaustive. It needs to
 * be, because the failure it guards against is a refused insert *at
 * checkout* - the customer has filled in a basket, typed a purchase order
 * number with an em dash pasted out of a spreadsheet, and pressed the
 * button. A label is never worth losing an order over.
 *
 * The property at the end is the one that matters. 0085 gives the column two
 * conditions - between 1 and 120 characters, and equal to its own `btrim` -
 * and the only thing standing between a typed label and those conditions is
 * this function. So rather than trusting a handful of examples, every nasty
 * input below is asserted to come out either as nothing at all or as
 * something the column accepts.
 */
import {
  cleanCustomerReference,
  MAX_CUSTOMER_REFERENCE,
} from '../src/lib/orders/customer-reference';

let failed = 0;
const ok = (l: string) => console.log(`  PASS  ${l}`);
const bad = (l: string) => {
  console.log(`  FAIL  ${l}`);
  failed += 1;
};
const yes = (l: string, condition: boolean) => (condition ? ok(l) : bad(l));
const is = <T,>(l: string, actual: T, expected: T) =>
  actual === expected ? ok(l) : bad(`${l} (got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)})`);

/** Characters, the way Postgres `length()` counts them. */
const chars = (value: string) => [...value].length;

console.log('\n== nothing is nothing ==');

is('undefined is no reference', cleanCustomerReference(undefined), undefined);
is('null is no reference', cleanCustomerReference(null), undefined);
is('an empty string is no reference', cleanCustomerReference(''), undefined);
is('spaces alone are no reference', cleanCustomerReference('     '), undefined);
is('a tab alone is no reference', cleanCustomerReference('\t'), undefined);
is('a newline alone is no reference', cleanCustomerReference('\n\n'), undefined);
is(
  'and a non-breaking space alone is no reference',
  cleanCustomerReference('  '),
  undefined,
);

/*
  The point of all seven: 0085 stores null rather than an empty string, so
  "does this order carry a label" is one question. A function that returned
  '' for any of them would put a row in the database that reads as labelled
  and renders as blank, and every screen would then need to know that both
  mean the same thing. One of them would forget.
*/

console.log('\n== what a person actually types ==');

is('a plain label is kept', cleanCustomerReference('Sarah'), 'Sarah');
is(
  'a label with punctuation is kept as typed',
  cleanCustomerReference('Sarah - Northbound Q4'),
  'Sarah - Northbound Q4',
);
is('a purchase order number is kept', cleanCustomerReference('PO #88213'), 'PO #88213');
is('accents survive', cleanCustomerReference('Café Noir'), 'Café Noir');
is('so do emoji', cleanCustomerReference('Q4 🚀'), 'Q4 🚀');
is(
  'a label that needs no cleaning comes back identical',
  cleanCustomerReference('Dev — PO 88213 (Q4)'),
  'Dev — PO 88213 (Q4)',
);

console.log('\n== cleaning, not rejecting ==');

is('surrounding space goes', cleanCustomerReference('   Sarah   '), 'Sarah');
is('a run of spaces inside collapses', cleanCustomerReference('Sarah     Q4'), 'Sarah Q4');
is('a tab inside becomes a space', cleanCustomerReference('Sarah\tQ4'), 'Sarah Q4');
is('a newline inside becomes a space', cleanCustomerReference('Sarah\nQ4'), 'Sarah Q4');
is('a carriage return too', cleanCustomerReference('Sarah\r\nQ4'), 'Sarah Q4');

/*
  A space rather than nothing, deliberately.

  "Q4\nSarah" is two things somebody wrote on two lines. Removing the newline
  gives "Q4Sarah", which is neither of them and is not what a search for
  "Sarah" would be typed against.
*/
is('a null byte becomes a space rather than vanishing', cleanCustomerReference('Q4\u0000Sarah'), 'Q4 Sarah');
is('DEL too', cleanCustomerReference('Q4\u007fSarah'), 'Q4 Sarah');

/*
  The ones that arrive by paste rather than by typing. A reference copied out
  of a spreadsheet cell or a Word document carries C1 controls and the line
  and paragraph separators; they render as nothing at all, which makes two
  labels that look identical compare unequal and a search for the visible
  text find neither.
*/
is('a C1 control becomes a space', cleanCustomerReference('Q4\u0085Sarah'), 'Q4 Sarah');
is('a line separator becomes a space', cleanCustomerReference('Q4\u2028Sarah'), 'Q4 Sarah');
is('a paragraph separator becomes a space', cleanCustomerReference('Q4\u2029Sarah'), 'Q4 Sarah');
/*
  A non-breaking space is the commonest paste artifact there is - every
  spreadsheet and most word processors produce them - and it is a space on
  screen, so it collapses with the rest rather than being stripped.
*/
is('a non-breaking space inside becomes a space', cleanCustomerReference('Sarah\u00a0Q4'), 'Sarah Q4');

/*
  The two that are nothing at all rather than a break. A byte order mark at
  the front of a pasted label and a zero-width space in the middle both make
  two labels that look identical compare unequal, and neither occupies any
  width - so they go rather than becoming a space, which would put a gap
  where the person sees none.
*/
is('a byte order mark goes', cleanCustomerReference('\ufeffSarah Q4'), 'Sarah Q4');
is('a zero-width space goes without leaving a gap', cleanCustomerReference('Sarah\u200bQ4'), 'SarahQ4');

/*
  And the zero-width characters that are not noise. The joiner is what holds
  a family emoji together as one character rather than four people, and the
  non-joiner is orthography in Persian and Hindi. Stripping either would
  break a label that was right.
*/
is('a zero-width joiner is left alone', cleanCustomerReference('\u{1f469}\u200d\u{1f469}\u200d\u{1f467}\u200d\u{1f466}'), '\u{1f469}\u200d\u{1f469}\u200d\u{1f467}\u200d\u{1f466}');
is('and a zero-width non-joiner too', cleanCustomerReference('\u0645\u06cc\u200c\u062e\u0648\u0627\u0646\u0645'), '\u0645\u06cc\u200c\u062e\u0648\u0627\u0646\u0645');

is(
  'and a label that is nothing but those is no reference',
  cleanCustomerReference('\u2028\u0085\u0000'),
  undefined,
);

console.log('\n== the ceiling ==');

is('120 characters is the ceiling', MAX_CUSTOMER_REFERENCE, 120);
is('120 characters are kept whole', chars(cleanCustomerReference('a'.repeat(120)) ?? ''), 120);
is('121 are cut to 120', chars(cleanCustomerReference('a'.repeat(121)) ?? ''), 120);
is('and 5,000 are cut to 120 rather than refused', chars(cleanCustomerReference('a'.repeat(5000)) ?? ''), 120);

/*
  Cut by character, not by UTF-16 unit, and this is the check that tells the
  two apart.

  `slice(0, 120)` counts units. An emoji is two of them, so a label of 200
  emoji sliced that way is 60 whole emoji and then half of the 61st - a lone
  surrogate, which cannot be encoded as UTF-8 and is refused on its way to
  Postgres. The customer's long label would not be shortened, it would fail
  the checkout.
*/
const manyEmoji = cleanCustomerReference('🚀'.repeat(200)) ?? '';
is('200 emoji are cut to 120 characters', chars(manyEmoji), 120);
yes(
  'and to 240 UTF-16 units, which is what cutting by unit would have got wrong',
  manyEmoji.length === 240,
);
yes(
  'the result survives being encoded as UTF-8, so no emoji was cut in half',
  Buffer.from(manyEmoji, 'utf8').toString('utf8') === manyEmoji,
);

/*
  The boundary, from both sides.

  Counting characters means there is no inside of an emoji to cut into: the
  120th character is either kept whole or dropped whole. 119 plain characters
  and an emoji is a 120-character label and the emoji stays; 120 plain
  characters and an emoji is the same label with the emoji gone. Cutting by
  UTF-16 unit would have kept half of it in the first case.
*/
const lastCharIsAnEmoji = cleanCustomerReference(`${'a'.repeat(119)}🚀tail`) ?? '';
is('an emoji that fits is the 120th character', chars(lastCharIsAnEmoji), 120);
is('and it is whole', [...lastCharIsAnEmoji].at(-1), '🚀');
yes(
  'and the result encodes as UTF-8, so no half of it was kept',
  Buffer.from(lastCharIsAnEmoji, 'utf8').toString('utf8') === lastCharIsAnEmoji,
);

const emojiPastTheEnd = cleanCustomerReference(`${'a'.repeat(120)}🚀tail`) ?? '';
is('an emoji past the end is dropped whole', emojiPastTheEnd, 'a'.repeat(120));
yes(
  'leaving nothing that cannot be encoded',
  Buffer.from(emojiPastTheEnd, 'utf8').toString('utf8') === emojiPastTheEnd,
);

is(
  'trailing space left by the cut goes too',
  cleanCustomerReference(`${'a'.repeat(119)} tail`),
  'a'.repeat(119),
);

console.log('\n== whatever is typed, the column will take it ==');

/*
  0085's two conditions, asserted against every input above and a few more.
  This is the property the whole function exists to hold: the output is
  either null or something `length(x) between 1 and 120 and x = btrim(x)`
  accepts. A new rule added to the function that broke either one would be
  caught here rather than at somebody's checkout.
*/
const nasty: (string | null | undefined)[] = [
  undefined,
  null,
  '',
  ' ',
  '\u0000',
  '\u0000\u0001\u0002',
  '\ufeff\u200b',
  '\u00a0\u00a0\u00a0',
  '\n\t\r',
  '\u2028\u2029\u0085',
  'Sarah',
  '  Sarah  ',
  'Sarah\u0000',
  '\u0000Sarah',
  'a'.repeat(5000),
  '🚀'.repeat(500),
  `${'a'.repeat(119)}🚀`,
  `${'a'.repeat(120)}\u0000`,
  `${'a'.repeat(120)} `,
  ` ${'a'.repeat(200)} `,
  '=SUM(A1:A9)',
  "'; drop table orders; --",
  '<script>alert(1)</script>',
  '%',
  '_',
  '\\',
  'é'.repeat(300),
  '👩‍👩‍👧‍👦',
  'ü'.normalize('NFD').repeat(100),
];

let breaches = 0;
for (const input of nasty) {
  const out = cleanCustomerReference(input);
  if (out === undefined) continue;
  const fits = chars(out) >= 1 && chars(out) <= MAX_CUSTOMER_REFERENCE;
  const trimmed = out === out.trim();
  const encodable = Buffer.from(out, 'utf8').toString('utf8') === out;
  if (!fits || !trimmed || !encodable) {
    breaches += 1;
    console.log(`        breach on ${JSON.stringify(input).slice(0, 40)}: ${JSON.stringify(out).slice(0, 60)}`);
  }
}
yes(`every one of the ${nasty.length} inputs comes out storable`, breaches === 0);

// The positive control beside it: the list is not all blanks, so the loop
// above really did test the conditions rather than skipping every row.
const kept = nasty.filter((input) => cleanCustomerReference(input) !== undefined).length;
yes(`and ${kept} of them are a real label rather than nothing`, kept >= 15);

/*
  A `=` at the front is left alone on purpose, and that is worth saying here
  because the obvious reading is that it was missed.

  Nothing exports an order to a spreadsheet today, so there is nowhere for a
  formula to be evaluated; the place that rule belongs is the export, where
  `planner/csv.ts` already applies it, rather than in the stored value. A
  label mangled on the way in is mangled for good, and the customer typed it.
*/
is('a formula is stored as the label somebody typed', cleanCustomerReference('=SUM(A1:A9)'), '=SUM(A1:A9)');

console.log(failed === 0 ? '\n  all passed' : `\n  ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
