/**
 * Whether this deployment can take real money, and how it decides.
 *
 * Pure rules, no key, no network: the readiness screen asks Stripe for the
 * facts and these are the judgements it makes about the answers.
 *
 * Worth being exhaustive about because of how the failure presents. On the
 * afternoon the live keys went in, every configuration answer was yes while
 * the site took nothing but sandbox payments - the keys were set, the
 * webhook existed, checkout opened and accepted a card. The only thing on
 * screen that said otherwise was `cs_test_` in a URL nobody reads.
 *
 * So a check that reports what is *configured* rather than what is *true*
 * is worse than no check: it is the same yes, with a tick beside it.
 */

import {
  keyMode,
  overallVerdict,
  readWebhooks,
  REQUIRED_WEBHOOK_EVENTS,
} from '../src/lib/stripe/readiness-rules.ts';

let failed = 0;
const ok = (l: string) => console.log(`  PASS  ${l}`);
const bad = (l: string) => {
  console.log(`  FAIL  ${l}`);
  failed += 1;
};
const yes = (l: string, condition: boolean) => (condition ? ok(l) : bad(l));
const is = (l: string, actual: unknown, expected: unknown) =>
  yes(l, JSON.stringify(actual) === JSON.stringify(expected));

console.log('\n--- live, or only pretending ---');

is('a live secret key', keyMode('sk_live_51ABCdef'), 'live');
is('a restricted live key counts too', keyMode('rk_live_51ABCdef'), 'live');
is('a test key', keyMode('sk_test_51ABCdef'), 'test');

/*
  The one that cost the afternoon. Stripe's sandboxes issue `sk_test_`
  exactly like classic test mode, and the sandbox API keys page is
  identical to the live one - same layout, same reveal button. "Not live"
  is the only distinction worth drawing, and it is the distinction that
  matters: either way the site takes no money.
*/
is('a sandbox key is a test key, because that is all it ever looks like', keyMode('sk_test_51XYZ'), 'test');

is('no key at all', keyMode(undefined), 'none');
is('and an empty one is the same thing', keyMode(''), 'none');
/*
  Named rather than guessed: a publishable key pasted into the secret slot
  is a real mistake, and "unrecognised" sends somebody to look at the value
  instead of at Stripe.
*/
is('a publishable key in the wrong box', keyMode('pk_live_51ABC'), 'unrecognised');
is('a webhook secret in the wrong box', keyMode('whsec_ABC'), 'unrecognised');

console.log('\n--- is Stripe pointed at us ---');

const URL_HERE = 'https://pressparrot.com/api/stripe/webhook';
const both = [...REQUIRED_WEBHOOK_EVENTS];

{
  const verdict = readWebhooks([{ url: URL_HERE, status: 'enabled', enabled_events: both }], URL_HERE);
  yes('an enabled endpoint for both events is found', verdict.found && verdict.enabled);
  is('with nothing missing', verdict.missingEvents, []);
}

yes(
  'a trailing slash is the same endpoint',
  readWebhooks([{ url: `${URL_HERE}/`, status: 'enabled', enabled_events: both }], URL_HERE).found,
);
/*
  And from the other side: `NEXT_PUBLIC_SITE_URL` is typed by hand into
  Vercel, so the slash is as likely to be on our end as on Stripe's.
*/
yes(
  'a trailing slash on our own URL is the same endpoint too',
  readWebhooks([{ url: URL_HERE, status: 'enabled', enabled_events: both }], `${URL_HERE}/`).found,
);
yes(
  'and so is a different case',
  readWebhooks([{ url: URL_HERE.toUpperCase(), status: 'enabled', enabled_events: both }], URL_HERE)
    .found,
);

{
  const verdict = readWebhooks(
    [{ url: 'https://example.test/api/stripe/webhook', status: 'enabled', enabled_events: both }],
    URL_HERE,
  );
  yes('an endpoint pointing somewhere else is not ours', verdict.found === false);
  yes('and is counted rather than ignored', verdict.others === 1);
  is('with both events reported missing', verdict.missingEvents, both);
}

{
  const verdict = readWebhooks(
    [{ url: URL_HERE, status: 'disabled', enabled_events: both }],
    URL_HERE,
  );
  yes('a disabled endpoint is found but not enabled', verdict.found && !verdict.enabled);
}

{
  const verdict = readWebhooks(
    [{ url: URL_HERE, status: 'enabled', enabled_events: ['checkout.session.completed'] }],
    URL_HERE,
  );
  is(
    'an endpoint missing the async event says which one',
    verdict.missingEvents,
    ['checkout.session.async_payment_succeeded'],
  );
}

/*
  Stripe lets an endpoint subscribe to everything. It is a blunt choice and
  a legitimate one, and reporting both events as missing against it would
  be the check crying wolf at a working integration.
*/
is(
  'a wildcard subscription covers both',
  readWebhooks([{ url: URL_HERE, status: 'enabled', enabled_events: ['*'] }], URL_HERE).missingEvents,
  [],
);

/*
  Two endpoints, one event each, is a shape somebody will build. What
  matters is whether the two events are covered between them.
*/
is(
  'two endpoints covering one event each are covered between them',
  readWebhooks(
    [
      { url: URL_HERE, status: 'enabled', enabled_events: ['checkout.session.completed'] },
      { url: URL_HERE, status: 'enabled', enabled_events: ['checkout.session.async_payment_succeeded'] },
    ],
    URL_HERE,
  ).missingEvents,
  [],
);

/*
  A disabled endpoint contributes nothing, even where an enabled one
  beside it would make the pair look complete.
*/
is(
  'a disabled endpoint does not help its neighbour',
  readWebhooks(
    [
      { url: URL_HERE, status: 'enabled', enabled_events: ['checkout.session.completed'] },
      { url: URL_HERE, status: 'disabled', enabled_events: ['checkout.session.async_payment_succeeded'] },
    ],
    URL_HERE,
  ).missingEvents,
  ['checkout.session.async_payment_succeeded'],
);

is(
  'no endpoints at all is not found',
  readWebhooks([], URL_HERE).found,
  false,
);

console.log('\n--- the sentence at the top ---');

is('one broken check makes the whole thing broken', overallVerdict([{ verdict: 'ok' }, { verdict: 'bad' }]), 'bad');
is('a warning survives a pile of fine', overallVerdict([{ verdict: 'ok' }, { verdict: 'warn' }]), 'warn');
is('broken beats a warning', overallVerdict([{ verdict: 'warn' }, { verdict: 'bad' }]), 'bad');
is('something unreadable is not a pass', overallVerdict([{ verdict: 'ok' }, { verdict: 'unknown' }]), 'unknown');
is('and all fine is fine', overallVerdict([{ verdict: 'ok' }, { verdict: 'ok' }]), 'ok');

console.log(failed === 0 ? '\n  all passed' : `\n  ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
