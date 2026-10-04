/**
 * Prove the link checker only accuses a publisher when it has grounds.
 *
 * Two different mistakes, and the second is the expensive one. Missing a dead
 * link costs a buyer a placement they paid for. Reporting a live link as dead
 * raises a claim against a publisher who did nothing wrong, and does it
 * automatically, by email, with a deadline - which costs a relationship.
 *
 * So every rule is checked against the page shape that triggers it, and every
 * way of failing to see a page is checked for not being treated as the page
 * being gone. No network: the fetching is a separate module precisely so this
 * can be exhaustive.
 */
import { normaliseUrl, sameUrl, isHomepage } from '../src/lib/monitoring/url';
import { verdictForPage, verdictForNetworkError, type FetchedPage } from '../src/lib/monitoring/verdict';
import { nextState, nextCheckAt, type LinkState } from '../src/lib/monitoring/status';
import { checkLink } from '../src/lib/monitoring/check';

let failed = 0;
const ok = (label: string) => console.log(`  PASS  ${label}`);
const bad = (label: string, detail?: string) => {
  failed += 1;
  console.log(`  FAIL  ${label}${detail ? ` - ${detail}` : ''}`);
};
const is = (label: string, actual: unknown, expected: unknown) =>
  actual === expected ? ok(label) : bad(label, `expected ${String(expected)}, got ${String(actual)}`);
const yes = (label: string, actual: boolean) => is(label, actual, true);

const TARGET = 'https://buyer.example/landing-page';
const PLACED = 'https://publisher.example/an-article';

function page(over: Partial<FetchedPage> = {}): FetchedPage {
  return {
    finalUrl: over.finalUrl ?? PLACED,
    status: over.status ?? 200,
    headers: over.headers ?? { 'content-type': 'text/html' },
    html: over.html ?? `<html><head><title>An article</title></head><body>
      <p>Words <a href="${TARGET}">the anchor</a> more words.</p></body></html>`,
  };
}

const check = (over: Partial<FetchedPage> = {}, expectsDofollow = true) =>
  verdictForPage(page(over), { placedUrl: PLACED, targetUrl: TARGET, expectsDofollow });

console.log('\n--- the same page written differently ---');
{
  /*
    A publisher links to `www.buyer.com/page/` and the order says
    `http://buyer.com/page?utm_source=x`. Those are one link to everybody
    except a string comparison, and treating them as two raises a claim
    against a publisher who did exactly what they were paid for.
  */
  is('protocol is ignored', normaliseUrl('http://a.example/p'), 'a.example/p');
  is('www is ignored', normaliseUrl('https://www.a.example/p'), 'a.example/p');
  is('a trailing slash is ignored', normaliseUrl('https://a.example/p/'), 'a.example/p');
  is('a query is ignored', normaliseUrl('https://a.example/p?utm_source=x'), 'a.example/p');
  is('a hash is ignored', normaliseUrl('https://a.example/p#section'), 'a.example/p');
  is('case is ignored', normaliseUrl('HTTPS://A.Example/p'), 'a.example/p');
  is('a scheme-less URL still parses', normaliseUrl('a.example/p'), 'a.example/p');

  yes('all of those are the same link', sameUrl('http://www.a.example/p/?x=1#y', 'https://a.example/p'));
  // The path is what identifies the page: two different articles are two links.
  yes('but a different path is not', !sameUrl('https://a.example/one', 'https://a.example/two'));
  yes('and neither is a different host', !sameUrl('https://a.example/p', 'https://b.example/p'));
  yes('an empty URL matches nothing', !sameUrl('', ''));

  yes('a bare domain is a homepage', isHomepage('https://a.example'));
  yes('with a trailing slash too', isHomepage('https://a.example/'));
  yes('an article is not', !isHomepage('https://a.example/an-article'));
}

console.log('\n--- hard failures: the placement is really gone ---');
{
  is('a 404 is hard', check({ status: 404 }).kind, 'hard');
  is('and a 410', check({ status: 410 }).kind, 'hard');

  /*
    A domain that no longer resolves is the publisher's site being gone. Every
    other network error is us failing to see, not them failing to host.
  */
  const gone = verdictForNetworkError(Object.assign(new Error('getaddrinfo ENOTFOUND publisher.example'), { code: 'ENOTFOUND' }));
  is('a domain that no longer resolves is hard', gone.kind, 'hard');

  // An article answering on the front page has been taken down, with the
  // homepage standing in for it.
  is('an article redirected to the homepage is hard', check({ finalUrl: 'https://publisher.example/' }).kind, 'hard');

  is(
    'a noindex header is hard',
    check({ headers: { 'content-type': 'text/html', 'x-robots-tag': 'noindex, nofollow' } }).kind,
    'hard',
  );
  is(
    'a noindex meta tag is hard',
    check({ html: `<html><head><meta name="robots" content="noindex"></head><body><a href="${TARGET}">x</a></body></html>` }).kind,
    'hard',
  );
  is(
    'and a googlebot noindex',
    check({ html: `<html><head><meta name="googlebot" content="noindex"></head><body><a href="${TARGET}">x</a></body></html>` }).kind,
    'hard',
  );

  // A canonical elsewhere tells search engines to credit that page instead,
  // which removes the value while leaving the link visible.
  is(
    'a canonical pointing somewhere else is hard',
    check({ html: `<html><head><link rel="canonical" href="https://publisher.example/other"></head><body><a href="${TARGET}">x</a></body></html>` }).kind,
    'hard',
  );

  is(
    'no link to the target at all is hard',
    check({ html: '<html><body><p>The article, with the link removed.</p></body></html>' }).kind,
    'hard',
  );

  for (const rel of ['nofollow', 'sponsored', 'ugc', 'noopener nofollow']) {
    is(
      `rel="${rel}" on the only link is hard`,
      check({ html: `<html><body><a href="${TARGET}" rel="${rel}">x</a></body></html>` }).kind,
      'hard',
    );
  }
}

console.log('\n--- soft failures: we could not see, which is not the same thing ---');
{
  /*
    The rule with teeth. A guarantee that fires on our own blind spots is worse
    than no guarantee: it emails publishers a deadline because their firewall
    is strict.
  */
  for (const status of [401, 403, 429]) {
    is(`a ${status} is soft`, check({ status }).kind, 'soft');
  }
  for (const status of [500, 502, 503]) {
    is(`a ${status} is soft`, check({ status }).kind, 'soft');
  }

  is(
    'a Cloudflare challenge header is soft',
    check({ status: 403, headers: { 'content-type': 'text/html', 'cf-mitigated': 'challenge' } }).kind,
    'soft',
  );
  is(
    'and a "Just a moment" title',
    check({ html: '<html><head><title>Just a moment...</title></head><body></body></html>' }).kind,
    'soft',
  );

  is('a timeout is soft', verdictForNetworkError(new Error('The operation was aborted due to timeout')).kind, 'soft');
  is('a connection reset is soft', verdictForNetworkError(new Error('ECONNRESET')).kind, 'soft');
  is('an unknown network error is soft', verdictForNetworkError(new Error('socket hang up')).kind, 'soft');
}

console.log('\n--- a link that is simply fine ---');
{
  is('a plain live link passes', check().kind, 'ok');
  is('a relative-cased href passes', check({ html: `<html><body><a href="HTTPS://WWW.BUYER.EXAMPLE/landing-page/">x</a></body></html>` }).kind, 'ok');
  is('a self-referencing canonical is not a failure', check({ html: `<html><head><link rel="canonical" href="${PLACED}"></head><body><a href="${TARGET}">x</a></body></html>` }).kind, 'ok');
  is('a relative canonical resolves before it is judged', check({ html: `<html><head><link rel="canonical" href="/an-article"></head><body><a href="${TARGET}">x</a></body></html>` }).kind, 'ok');

  // A page with both a followed and a nofollowed link to the same target still
  // passes the value the buyer paid for.
  is(
    'one followed link among nofollowed ones passes',
    check({ html: `<html><body><a href="${TARGET}" rel="nofollow">a</a><a href="${TARGET}">b</a></body></html>` }).kind,
    'ok',
  );
  // When the buyer did not pay for a followed link, the rel does not matter.
  is('nofollow is fine when it was not expected', check({ html: `<html><body><a href="${TARGET}" rel="nofollow">x</a></body></html>` }, false).kind, 'ok');
  // A homepage placement that stays on the homepage has not been taken down.
  is(
    'a homepage placement is not "redirected to the homepage"',
    verdictForPage(page({ finalUrl: 'https://publisher.example/' }), {
      placedUrl: 'https://publisher.example/',
      targetUrl: TARGET,
      expectsDofollow: true,
    }).kind,
    'ok',
  );
}

console.log('\n--- what a verdict does to the record ---');
{
  const live: LinkState = { status: 'live', hardFailures: 0, softFailures: 0, lostAt: null, guaranteeEndsAt: '2027-01-01T00:00:00.000Z' };

  const first = nextState(live, 'hard');
  is('one hard failure is "failing", not lost', first.status, 'failing');
  is('and opens no claim', first.becameLost, false);

  const second = nextState({ ...live, status: 'failing', hardFailures: 1 }, 'hard');
  is('two in a row is lost', second.status, 'lost');
  yes('which is when the claim opens', second.becameLost);
  yes('and when it was lost is recorded', Boolean(second.lostAt));

  // Already lost and failing again must not open a second claim.
  const again = nextState({ ...live, status: 'lost', hardFailures: 2, lostAt: '2026-01-01T00:00:00.000Z' }, 'hard');
  is('a link already lost stays lost', again.status, 'lost');
  is('without opening another claim', again.becameLost, false);
  is('and keeps the date it was first lost', again.lostAt, '2026-01-01T00:00:00.000Z');

  /*
    No number of soft failures may produce lost. This is the assertion that
    stops the guarantee firing on our own blind spots.
  */
  let soft: LinkState = live;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const next = nextState(soft, 'soft');
    if (next.status === 'lost') bad('soft failures must never mark a link lost');
    soft = { ...soft, status: next.status, softFailures: next.softFailures, lostAt: next.lostAt };
  }
  ok('ten soft failures in a row never mark a link lost');

  /*
    And no number of them may un-lose one.

    A publisher who removes an article and then puts the site behind a
    firewall was turning `lost` into `unverifiable` on the third failed read -
    and the maintenance job only hands a claim to the buyer while the link is
    still lost, so the whole guarantee closed itself quietly.
  */
  let blocked: LinkState = { ...live, status: 'lost', hardFailures: 2, lostAt: '2026-01-01T00:00:00.000Z' };
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const next = nextState(blocked, 'soft');
    blocked = { ...blocked, status: next.status, softFailures: next.softFailures, lostAt: next.lostAt };
  }
  is('a lost link that starts blocking us stays lost', blocked.status, 'lost');
  is('and keeps the date it was lost', blocked.lostAt, '2026-01-01T00:00:00.000Z');
  is('three of them is "unverifiable"', nextState({ ...live, softFailures: 2 }, 'soft').status, 'unverifiable');
  is('two is not yet', nextState({ ...live, softFailures: 1 }, 'soft').status, 'live');

  // A soft failure neither increments nor forgives the hard counter: a link
  // that failed once and was then unreadable has not been cleared.
  is('a soft failure leaves the hard counter alone', nextState({ ...live, hardFailures: 1 }, 'soft').hardFailures, 1);

  const recovered = nextState({ ...live, status: 'lost', hardFailures: 2, lostAt: '2026-01-01T00:00:00.000Z' }, 'ok');
  is('a good check makes it live again', recovered.status, 'live');
  is('clears the date it was lost', recovered.lostAt, null);
  yes('and restores the claim', recovered.becameLive);
  is('both counters reset, so "in a row" means in a row', recovered.hardFailures + recovered.softFailures, 0);
}

console.log('\n--- when to look again ---');
{
  const now = new Date('2026-06-01T00:00:00.000Z');
  const days = (iso: string) => Math.round((new Date(iso).getTime() - now.getTime()) / 86_400_000);

  is('weekly while the guarantee runs', days(nextCheckAt('ok', '2027-01-01T00:00:00.000Z', now, () => 0)), 7);
  // The durability score keeps earning from links long after their guarantee,
  // so monitoring continues at a lower cadence rather than stopping.
  is('monthly after it ends', days(nextCheckAt('ok', '2026-01-01T00:00:00.000Z', now, () => 0)), 30);
  is('tomorrow after a hard failure', days(nextCheckAt('hard', '2027-01-01T00:00:00.000Z', now, () => 0)), 1);
  is('and after a soft one', days(nextCheckAt('soft', '2027-01-01T00:00:00.000Z', now, () => 0)), 1);

  // Jitter so a few thousand links do not all come due in the same minute.
  const jittered = new Date(nextCheckAt('ok', '2027-01-01T00:00:00.000Z', now, () => 0.999)).getTime();
  const plain = new Date(nextCheckAt('ok', '2027-01-01T00:00:00.000Z', now, () => 0)).getTime();
  const spread = (jittered - plain) / 3_600_000;
  yes(`jitter spreads checks over about six hours (${spread.toFixed(1)}h)`, spread > 5.9 && spread <= 6);
}

console.log('\n--- the checker end to end, without a network ---');
{
  const live = await checkLink(
    { placedUrl: PLACED, targetUrl: TARGET, expectsDofollow: true },
    async () => page(),
  );
  is('a good page reads as ok', live.verdict.kind, 'ok');

  const thrown = await checkLink(
    { placedUrl: PLACED, targetUrl: TARGET, expectsDofollow: true },
    async () => {
      throw Object.assign(new Error('getaddrinfo ENOTFOUND publisher.example'), { code: 'ENOTFOUND' });
    },
  );
  is('a dead domain reads as hard', thrown.verdict.kind, 'hard');

  // A throwing fetch must not take the run down with it: one unreachable site
  // in a batch of two hundred cannot cost the other hundred and ninety-nine.
  const timedOut = await checkLink(
    { placedUrl: PLACED, targetUrl: TARGET, expectsDofollow: true },
    async () => {
      throw new Error('The operation was aborted due to timeout');
    },
  );
  is('and a timeout as soft, not as a crash', timedOut.verdict.kind, 'soft');
}

console.log(failed ? `\n  ${failed} FAILED\n` : '\n  all passed\n');
process.exit(failed ? 1 : 0);
