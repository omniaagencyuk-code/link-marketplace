/**
 * Prove the pricing enquiry form accepts what it should and no more.
 *
 * No key, no network, no database: the rules are pure, which is the point.
 * This is the only form on the site a stranger can submit, so what it will
 * and will not take is worth checking exhaustively rather than by sampling,
 * and the failures matter in both directions. A rule too strict loses an
 * agency that wanted to spend money with us and says nothing; a rule too
 * loose is a row the database refuses, which the person experiences as the
 * form being broken.
 *
 * `tidyText` is checked here too, because the enquiry is the first caller to
 * use its multiline mode and `verify:orders` only covers the single-line one.
 */
import { looksAutomated, readEnquiry } from '../src/lib/enquiries/rules';
import {
  BUDGET_BANDS,
  INTERESTS,
  LIMITS,
  isBudgetBand,
  isEnquirySource,
  isEnquiryStatus,
  isInterest,
} from '../src/lib/enquiries/options';
import { tidyText } from '../src/lib/text/tidy';

let failed = 0;
const ok = (l: string) => console.log(`  PASS  ${l}`);
const bad = (l: string) => {
  console.log(`  FAIL  ${l}`);
  failed += 1;
};
const yes = (l: string, condition: boolean) => (condition ? ok(l) : bad(l));
const is = <T,>(l: string, actual: T, expected: T) =>
  actual === expected
    ? ok(l)
    : bad(`${l} (got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)})`);

/** A submission with everything filled in, for varying one thing at a time. */
const complete = () => ({
  fullName: 'Sarah Okafor',
  email: 'sarah@northbound.co.uk',
  company: 'Northbound Media',
  budgetBand: '£2,500–£5,000',
  interest: 'Agency partnership',
  message: 'We place about twenty links a month across four client sites.',
  source: 'pricing-page',
  website: '',
});

const chars = (value: string) => [...value].length;

console.log('\n== a submission that should go through ==');
{
  const verdict = readEnquiry(complete());
  yes('a complete enquiry is accepted', verdict.ok);
  if (verdict.ok) {
    is('the name survives', verdict.value.fullName, 'Sarah Okafor');
    is('the company survives', verdict.value.company, 'Northbound Media');
    is('the budget band survives', verdict.value.budgetBand, '£2,500–£5,000');
    is('the interest survives', verdict.value.interest, 'Agency partnership');
    is('the source survives', verdict.value.source, 'pricing-page');
    is(
      'and so does what they wrote',
      verdict.value.message,
      'We place about twenty links a month across four client sites.',
    );
  }
}

console.log('\n== only three things are actually required ==');
{
  const verdict = readEnquiry({
    fullName: 'Jo',
    email: 'jo@example.com',
    message: 'Interested in bulk.',
  });
  yes('name, email and message are enough', verdict.ok);
  if (verdict.ok) {
    is('no company is undefined, not an empty string', verdict.value.company, undefined);
    is('no budget is undefined', verdict.value.budgetBand, undefined);
    is('no interest is undefined', verdict.value.interest, undefined);
    is('and the source falls back rather than failing', verdict.value.source, 'pricing-page');
  }
}

/*
  `undefined` rather than '' because 0086 stores null for all three. "Did
  they tell us their company" has to be one question rather than two, or
  every read of the admin table needs to know that '' and null mean the same
  thing - and one of them will forget.
*/

console.log('\n== what is refused, and what it says ==');
{
  const verdict = readEnquiry({ fullName: '', email: '', message: '' });
  yes('an empty form is refused', !verdict.ok);
  if (!verdict.ok) {
    yes('all three are reported at once, not one at a time', Object.keys(verdict.errors).length === 3);
    yes('the name has a message', Boolean(verdict.errors.fullName));
    yes('the email has one', Boolean(verdict.errors.email));
    yes('the message has one', Boolean(verdict.errors.message));
  }
}

/*
  Three at once rather than the first: the form renders each message under
  its own field, and a verdict carrying one error is a person fixing one
  thing per round trip.
*/

{
  const verdict = readEnquiry({ ...complete(), fullName: '   ' });
  yes('a name of nothing but spaces is missing, not present', !verdict.ok);
  if (!verdict.ok) yes('and it is the name that is reported', Boolean(verdict.errors.fullName));
}

{
  const verdict = readEnquiry({ ...complete(), message: '\n\n   \n' });
  yes('a message of nothing but blank lines is missing too', !verdict.ok);
}

for (const address of ['sarah', 'sarah@', '@northbound.co.uk', 'sarah@northbound', 'a b@c.com']) {
  const verdict = readEnquiry({ ...complete(), email: address });
  yes(`"${address}" is refused as an address`, !verdict.ok);
}

for (const address of [
  'sarah@northbound.co.uk',
  'sarah+q4@northbound.co.uk',
  "o'brien@example.ie",
  'sarah@agency.marketing',
  'a@b.co',
]) {
  const verdict = readEnquiry({ ...complete(), email: address });
  yes(`"${address}" is accepted`, verdict.ok);
}

/*
  The accepted list is the half worth having. Every stricter address regex
  anybody writes rejects something real - apostrophes in Irish surnames, new
  top level domains, plus-addressing - and turning away a buyer to feel
  rigorous is the expensive error. A typo costs one bounced reply.
*/

console.log('\n== an address is stored in one case ==');
{
  const verdict = readEnquiry({ ...complete(), email: 'Sarah@Northbound.CO.UK' });
  yes('mixed case is accepted', verdict.ok);
  if (verdict.ok) {
    is('and stored lower-cased', verdict.value.email, 'sarah@northbound.co.uk');
  }
}

console.log('\n== a dropdown answer we did not offer ==');
{
  const verdict = readEnquiry({ ...complete(), budgetBand: '£1,000,000+' });
  yes('the enquiry is still accepted', verdict.ok);
  if (verdict.ok) {
    is('and the unknown band is dropped rather than stored', verdict.value.budgetBand, undefined);
    is('while everything else survives', verdict.value.fullName, 'Sarah Okafor');
  }
}

{
  const verdict = readEnquiry({ ...complete(), interest: 'Something else entirely' });
  yes('the same for an unknown interest', verdict.ok && verdict.value.interest === undefined);
}

{
  const verdict = readEnquiry({ ...complete(), source: 'somewhere-else' });
  yes(
    'and an unknown source falls back rather than refusing',
    verdict.ok && verdict.value.source === 'pricing-page',
  );
}

{
  const verdict = readEnquiry({ ...complete(), source: 'marketplace-banner' });
  yes(
    'a source we do use is kept, so the banner can be told apart',
    verdict.ok && verdict.value.source === 'marketplace-banner',
  );
}

/*
  Dropped rather than refused, deliberately. No real submission can produce
  one of these - the form only renders the options in `options.ts` - so a
  value we did not offer means a tampered or stale post, and refusing it
  would throw away a name, an address and a message over a field that was
  optional in the first place.
*/

console.log('\n== every option the form offers is one the rules accept ==');
{
  let mismatches = 0;
  for (const band of BUDGET_BANDS) {
    const verdict = readEnquiry({ ...complete(), budgetBand: band });
    if (!verdict.ok || verdict.value.budgetBand !== band) mismatches += 1;
  }
  yes(`all ${BUDGET_BANDS.length} budget bands round-trip`, mismatches === 0);

  mismatches = 0;
  for (const interest of INTERESTS) {
    const verdict = readEnquiry({ ...complete(), interest });
    if (!verdict.ok || verdict.value.interest !== interest) mismatches += 1;
  }
  yes(`all ${INTERESTS.length} interests round-trip`, mismatches === 0);
}

/*
  The check that catches the real mistake here: somebody edits a label in
  `options.ts` for the dropdown and the guard stops recognising it, so the
  form offers an answer the rules then silently discard.
*/

console.log('\n== the honeypot ==');
yes('an empty honeypot is a person', !looksAutomated(complete()));
yes('a filled one is not', looksAutomated({ ...complete(), website: 'http://spam.example' }));
yes('and whitespace in it is still empty', !looksAutomated({ ...complete(), website: '   ' }));

console.log('\n== what the column will take ==');
{
  const verdict = readEnquiry({
    ...complete(),
    fullName: 'a'.repeat(400),
    company: 'b'.repeat(400),
    message: 'c'.repeat(9000),
  });
  yes('over-long fields are cut rather than refused', verdict.ok);
  if (verdict.ok) {
    is('the name fits its column', chars(verdict.value.fullName), LIMITS.name);
    is('the company fits its column', chars(verdict.value.company ?? ''), LIMITS.company);
    is('the message fits its column', chars(verdict.value.message), LIMITS.message);
  }
}

{
  // The boundary where cutting by UTF-16 unit would leave half a character.
  const verdict = readEnquiry({ ...complete(), fullName: '🚀'.repeat(200) });
  yes('a name of emoji is accepted', verdict.ok);
  if (verdict.ok) {
    is('cut to 120 characters', chars(verdict.value.fullName), LIMITS.name);
    yes(
      'and still encodable as UTF-8, so no emoji was cut in half',
      Buffer.from(verdict.value.fullName, 'utf8').toString('utf8') === verdict.value.fullName,
    );
  }
}

console.log('\n== paragraphs survive, noise does not ==');
is(
  'line breaks are kept in the message',
  tidyText('First line.\nSecond line.', { maxChars: 500, multiline: true }),
  'First line.\nSecond line.',
);
is(
  'a blank line between paragraphs is kept',
  tidyText('One.\n\nTwo.', { maxChars: 500, multiline: true }),
  'One.\n\nTwo.',
);
is(
  'six blank lines are not',
  tidyText('One.\n\n\n\n\n\nTwo.', { maxChars: 500, multiline: true }),
  'One.\n\nTwo.',
);
is(
  'windows line endings become one newline each',
  tidyText('One.\r\nTwo.', { maxChars: 500, multiline: true }),
  'One.\nTwo.',
);
is(
  'an old mac carriage return does too',
  tidyText('One.\rTwo.', { maxChars: 500, multiline: true }),
  'One.\nTwo.',
);
is(
  'trailing spaces before a break go',
  tidyText('One.   \n   Two.', { maxChars: 500, multiline: true }),
  'One.\nTwo.',
);
is(
  'a tab inside a line is still a space',
  tidyText('One.\tTwo.', { maxChars: 500, multiline: true }),
  'One. Two.',
);
is(
  'and a single-line field still loses its newlines',
  tidyText('One.\nTwo.', { maxChars: 500 }),
  'One. Two.',
);

/*
  That last pair is the whole reason `multiline` exists. The same sweep that
  turns a stray control character into a space would turn every newline into
  one too, because a newline *is* a C0 character - so a requirements box
  would arrive as one run-on line and the person's paragraphs would be gone.
*/

{
  const verdict = readEnquiry({
    ...complete(),
    message: 'We need:\n\n- 20 links a month\n- UK finance sites\n\nBudget is flexible.',
  });
  yes('a real multi-paragraph message is accepted', verdict.ok);
  if (verdict.ok) {
    yes('with its list intact', verdict.value.message.includes('\n- 20 links a month'));
    yes('and its blank lines', verdict.value.message.includes('\n\n'));
  }
}

console.log('\n== the guards agree with the lists ==');
yes('every budget band is recognised', BUDGET_BANDS.every(isBudgetBand));
yes('every interest is recognised', INTERESTS.every(isInterest));
yes('a made-up band is not', !isBudgetBand('£17'));
yes('a made-up interest is not', !isInterest('Something'));
yes('the two sources are recognised', isEnquirySource('pricing-page') && isEnquirySource('marketplace-banner'));
yes('a made-up source is not', !isEnquirySource('somewhere'));
yes(
  'the four statuses are recognised',
  ['new', 'in-progress', 'closed', 'spam'].every(isEnquiryStatus),
);
yes('a made-up status is not', !isEnquiryStatus('pending'));

console.log(failed === 0 ? '\n  all passed' : `\n  ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
