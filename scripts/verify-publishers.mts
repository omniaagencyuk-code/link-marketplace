/**
 * Prove the "list your site" form accepts what it should and no more.
 *
 * No key, no network, no database: the rules are pure, which is the point.
 * This is the second form on the site a stranger can submit, and the
 * failures matter in both directions. A rule too strict turns away a
 * publisher who was offering us inventory and says nothing; a rule too loose
 * is a row the database refuses, which the person experiences as the form
 * being broken.
 *
 * The one rule here that is not in `verify:enquiries` is the price. A number
 * stored without knowing its currency becomes what we think a placement
 * costs, which is the mistake `repeat-offers.ts` has a floor against from
 * the other direction, so the pair is checked exhaustively.
 */
import { looksAutomated, readStoredPrice, readSubmission } from '../src/lib/publishers/rules';
import {
  CURRENCIES,
  LIMITS,
  PLACEMENT_TYPES,
  SUBMISSION_STATUSES,
  isPlacementType,
  isSubmissionCurrency,
  isSubmissionSource,
  isSubmissionStatus,
} from '../src/lib/publishers/options';

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
  fullName: 'Marta Nowak',
  email: 'marta@thelocalpost.co.uk',
  domain: 'thelocalpost.co.uk',
  placementType: 'Guest post',
  price: '180',
  currency: 'GBP',
  message: 'No gambling or crypto. Two week turnaround.',
  source: 'list-your-site',
  phone: '',
});

console.log('\n== an offer that should go through ==');
{
  const verdict = readSubmission(complete());
  yes('a complete offer is accepted', verdict.ok);
  if (verdict.ok) {
    is('the name survives', verdict.value.fullName, 'Marta Nowak');
    is('the domain survives', verdict.value.domain, 'thelocalpost.co.uk');
    is('what they offer survives', verdict.value.placementType, 'Guest post');
    is('the price is stored in minor units', verdict.value.priceMinor, 18_000);
    is('with its currency', verdict.value.currency, 'GBP');
    is('the message survives', verdict.value.message, 'No gambling or crypto. Two week turnaround.');
    is('and the source', verdict.value.source, 'list-your-site');
  }
}

console.log('\n== what it needs ==');
{
  for (const [field, input] of [
    ['fullName', { ...complete(), fullName: '   ' }],
    ['email', { ...complete(), email: '' }],
    ['domain', { ...complete(), domain: ' ' }],
  ] as const) {
    const verdict = readSubmission(input);
    yes(`a missing ${field} is refused`, !verdict.ok);
    if (!verdict.ok) yes(`  and the message is against ${field}`, Boolean(verdict.errors[field]));
  }

  const noMessage = readSubmission({ ...complete(), message: '' });
  yes('the message is optional', noMessage.ok);
  if (noMessage.ok) is('and comes back undefined rather than blank', noMessage.value.message, undefined);

  const noType = readSubmission({ ...complete(), placementType: '' });
  yes('what they offer is optional', noType.ok);

  const noPrice = readSubmission({ ...complete(), price: '' });
  yes('the price is optional', noPrice.ok);
  if (noPrice.ok) {
    is('and brings no currency with it', noPrice.value.currency, undefined);
    is('nor a price of zero', noPrice.value.priceMinor, undefined);
  }
}

console.log('\n== the address ==');
{
  for (const address of ['marta@thelocalpost.co.uk', 'a+b@sub.domain.example', "o'brien@news.ie"]) {
    yes(`${address} is accepted`, readSubmission({ ...complete(), email: address }).ok);
  }
  for (const address of ['marta', 'marta@', '@thelocalpost.co.uk', 'marta@localhost', 'a b@c.com']) {
    yes(`${address} is refused`, !readSubmission({ ...complete(), email: address }).ok);
  }

  const shouty = readSubmission({ ...complete(), email: 'Marta@TheLocalPost.co.uk' });
  if (shouty.ok) {
    is('an address is lower-cased', shouty.value.email, 'marta@thelocalpost.co.uk');
  }
}

console.log('\n== the site ==');
{
  /*
    One publisher pasting a URL and another typing a bare domain are offering
    the same site, and the duplicate only shows up if both reduce to the same
    string. These go through the importer's own normaliser rather than a
    second one written here.
  */
  for (const typed of [
    'thelocalpost.co.uk',
    'www.thelocalpost.co.uk',
    'https://thelocalpost.co.uk',
    'https://www.thelocalpost.co.uk/write-for-us?ref=x',
    '  HTTPS://WWW.TheLocalPost.co.uk/  ',
    'thelocalpost.co.uk.',
  ]) {
    const verdict = readSubmission({ ...complete(), domain: typed });
    if (!verdict.ok) {
      bad(`"${typed}" was refused`);
    } else {
      is(`"${typed}" reduces to the same site`, verdict.value.domain, 'thelocalpost.co.uk');
    }
  }

  for (const nonsense of ['localhost', 'not a domain', 'http://', '.', 'example', 'exa mple.com']) {
    yes(`"${nonsense}" is refused`, !readSubmission({ ...complete(), domain: nonsense }).ok);
  }
}

console.log('\n== the price, and the currency it is meaningless without ==');
{
  for (const [typed, minor] of [
    ['180', 18_000],
    ['180.50', 18_050],
    ['1,200', 120_000],
    ['£180', 18_000],
    [' 180 ', 18_000],
    ['1.2k', 120_000],
    ['99.99', 9_999],
  ] as const) {
    const verdict = readSubmission({ ...complete(), price: typed });
    if (!verdict.ok) bad(`"${typed}" was refused`);
    else is(`"${typed}" reads as ${minor} minor units`, verdict.value.priceMinor, minor);
  }

  for (const nonsense of ['free', 'about 200', '-50', '0']) {
    const verdict = readSubmission({ ...complete(), price: nonsense });
    yes(`"${nonsense}" is refused`, !verdict.ok);
    if (!verdict.ok) yes('  and the message is against the price', Boolean(verdict.errors.price));
  }

  const silly = readSubmission({ ...complete(), price: '2000000' });
  yes('a price above the ceiling is refused', !silly.ok);
  const atLimit = readSubmission({ ...complete(), price: String(LIMITS.maxPrice) });
  yes('and the ceiling itself is accepted', atLimit.ok);

  /*
    The rule worth arguing about: a price whose currency we do not recognise
    is dropped, and everything else is kept. The submission still reaches us
    with the site, the name and the address, and the price becomes a question
    we can ask - which is cheaper than storing a number nobody can read.
  */
  for (const currency of ['', 'CHF', 'pounds', 'gbp£']) {
    const verdict = readSubmission({ ...complete(), currency });
    yes(`a price in "${currency}" does not refuse the offer`, verdict.ok);
    if (verdict.ok) {
      is('  the price is dropped', verdict.value.priceMinor, undefined);
      is('  with its currency', verdict.value.currency, undefined);
      is('  and the site is kept', verdict.value.domain, 'thelocalpost.co.uk');
    }
  }

  const lower = readSubmission({ ...complete(), currency: 'gbp' });
  if (lower.ok) is('a lower-case currency is still a currency', lower.value.currency, 'GBP');

  /*
    A currency typed into the box beats the dropdown beside it. Somebody
    writing "$150" has said what they mean; the dropdown's default is
    something they may never have looked at, and storing pounds against a
    dollar price is exactly the number this column pair exists to stop.
  */
  for (const [typed, chosen, expected, minor] of [
    ['$150', 'GBP', 'USD', 15_000],
    ['150 EUR', 'GBP', 'EUR', 15_000],
    ['€99.50', 'GBP', 'EUR', 9_950],
    ['£150', 'CHF', 'GBP', 15_000],
    ['150', 'USD', 'USD', 15_000],
  ] as const) {
    const verdict = readSubmission({ ...complete(), price: typed, currency: chosen });
    if (!verdict.ok) {
      bad(`"${typed}" with ${chosen} selected was refused`);
    } else {
      is(`"${typed}" is read as ${expected}`, verdict.value.currency, expected);
      is('  and keeps its pennies', verdict.value.priceMinor, minor);
    }
  }

  // Neither half is ever present without the other, whatever went in.
  for (const input of [
    complete(),
    { ...complete(), price: '' },
    { ...complete(), currency: 'CHF' },
    { ...complete(), price: '', currency: '' },
  ]) {
    const verdict = readSubmission(input);
    if (verdict.ok) {
      yes(
        'a price and a currency are both present or both absent',
        (verdict.value.priceMinor === undefined) === (verdict.value.currency === undefined),
      );
    }
  }
}

console.log('\n== a price read back out of the table ==');
{
  /*
    The admin screen reads this, and a figure with no currency is not a
    cheap price - it is a number nobody can act on. The column pair cannot
    hold one without the other, but a row written by hand could, so the read
    side refuses the same combinations the write side does.
  */
  const good = readStoredPrice(18_000, 'GBP');
  yes('a stored pair comes back', good !== null);
  if (good) {
    is('  with its figure', good.priceMinor, 18_000);
    is('  and its currency', good.currency, 'GBP');
  }

  yes('a figure with no currency is nothing', readStoredPrice(18_000, null) === null);
  yes('a currency with no figure is nothing', readStoredPrice(null, 'GBP') === null);
  yes('a currency we do not price in is nothing', readStoredPrice(18_000, 'CHF') === null);
  yes('and neither is a price of zero', readStoredPrice(0, 'GBP') === null);
}

console.log('\n== what is dropped rather than refused ==');
{
  const tampered = readSubmission({ ...complete(), placementType: 'Billboard' });
  yes('a choice we never offered does not refuse the offer', tampered.ok);
  if (tampered.ok) is('  it is dropped', tampered.value.placementType, undefined);

  const elsewhere = readSubmission({ ...complete(), source: 'somewhere-else' });
  yes('an unknown source does not refuse it either', elsewhere.ok);
  if (elsewhere.ok) is('  it falls back to the page', elsewhere.value.source, 'list-your-site');
}

console.log('\n== the ceilings ==');
{
  const long = readSubmission({
    ...complete(),
    fullName: 'a'.repeat(400),
    message: 'b'.repeat(9_000),
  });
  yes('an over-long submission is cut rather than refused', long.ok);
  if (long.ok) {
    yes('  the name fits the column', long.value.fullName.length <= LIMITS.name);
    yes('  and the message does', (long.value.message ?? '').length <= LIMITS.message);
  }
}

console.log('\n== the honeypot ==');
{
  yes('an empty phone field is a person', !looksAutomated(complete()));
  yes('a filled one is not', looksAutomated({ ...complete(), phone: 'anything' }));
  yes('and whitespace in it still is', !looksAutomated({ ...complete(), phone: '   ' }));

  /*
    The honeypot is not named `website`, and this is the assertion that keeps
    it that way. The pricing form's hidden field has that name; here a
    website is the whole submission, so sharing the name would discard every
    real publisher.
  */
  const real = readSubmission({ ...complete(), domain: 'thelocalpost.co.uk' });
  yes('a submission with a website in it is not treated as a bot', real.ok);
}

console.log('\n== the guards agree with the lists ==');
yes('every placement type is recognised', PLACEMENT_TYPES.every(isPlacementType));
yes('a made-up one is not', !isPlacementType('Billboard'));
yes('every currency is recognised', CURRENCIES.every(isSubmissionCurrency));
yes('a currency we do not price in is not', !isSubmissionCurrency('CHF'));
yes('the source is recognised', isSubmissionSource('list-your-site'));
yes('a made-up source is not', !isSubmissionSource('somewhere'));
yes('every status is recognised', SUBMISSION_STATUSES.every(isSubmissionStatus));
yes('a made-up status is not', !isSubmissionStatus('pending'));
/*
  `closed` in particular: it is what a pricing enquiry ends as, and an offer
  of a site deliberately ends as `listed` or `declined` instead. Which way it
  went is the only part worth knowing when the same domain writes in again.
*/
yes('and "closed" is not one of them', !isSubmissionStatus('closed'));

console.log(failed === 0 ? '\n  all passed' : `\n  ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
