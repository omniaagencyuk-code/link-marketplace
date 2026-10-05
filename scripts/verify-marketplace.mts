/**
 * Prove the marketplace shows a buyer what they can actually buy.
 *
 * Choosing a topic at the top is three promises: only publishers who accept
 * it, priced for it, and carried into the order. The first two are pure and
 * are checked here - a card reading "from $499" that cannot be bought at
 * $499 is worse than no price at all.
 */
import { acceptsTopic, forTopic, pricedForTopic } from '../src/lib/marketplace/topic';
import {
  BUYABLE_TOPICS,
  GENERAL_NICHE,
  acceptedNiches,
  isBuyableTopic,
  sensitiveNicheSlugs,
} from '../src/lib/config/accepted-niches';
import { sellableNiches } from '../src/lib/sourcing/review';
import { countryFromDomain } from '../src/lib/data/cctld';
import { candidatesPerSide, rankRelated } from '../src/lib/websites/related';
import { audienceBreakdown, shareFor, NAMED_COUNTRIES } from '../src/lib/websites/audience';
import { flagEmoji } from '../src/lib/data/flags';
import { runQuery, sortItems } from '../src/lib/services/query-engine';
import { flipSort, sortDirection } from '../src/lib/types/query';
import { sortOptions } from '../src/lib/utils/labels';
import { audiencePatch } from '../src/lib/services/refresh-service';
import { COUNTRY_SOURCES, outranksCountrySource } from '../src/lib/types/country';
import { cctldPairs } from './cctld-sql.mts';
import { readFileSync } from 'node:fs';
import type { WebsiteListItem } from '../src/lib/types';

let failed = 0;
const ok = (label: string) => console.log(`  PASS  ${label}`);
const bad = (label: string, detail?: string) => {
  failed += 1;
  console.log(`  FAIL  ${label}${detail ? ` - ${detail}` : ''}`);
};
const is = (label: string, actual: unknown, expected: unknown) =>
  actual === expected ? ok(label) : bad(label, `expected ${String(expected)}, got ${String(actual)}`);

let seq = 0;
/* eslint-disable @typescript-eslint/no-explicit-any */
function site(over: Partial<any> = {}): WebsiteListItem {
  const services = over.services ?? [
    { id: 's1', type: 'guest-post', priceMinor: 20000, available: true },
  ];
  return {
    id: over.id ?? `w${(seq += 1)}`,
    domain: over.domain ?? 'example.com',
    rules: { acceptedNiches: over.accepted ?? [] },
    country: over.country,
    language: over.language ?? 'en',
    // runQuery reads metrics and rules; the topic helpers do not. One shape
    // serves both so a test cannot pass against a listing the marketplace
    // would never have accepted.
    metrics: over.metrics ?? {
      domainRating: over.dr ?? 50,
      organicTraffic: over.traffic ?? 10000,
      referringDomains: over.rd ?? 500,
      trafficTrend: [],
      audienceSplit: [],
    },
    fastestTurnaroundDays: over.turnaround ?? 5,
    createdAt: over.createdAt ?? '2026-01-01T00:00:00.000Z',
    secondaryNiches: over.secondaryNiches ?? [],
    niche: over.niche ?? 'business',
    services,
    nichePrices: over.nichePrices ?? [],
    headlineService: services[0] ?? null,
    headlinePriceMinor: services[0]?.priceMinor ?? 0,
    lowestPriceMinor: services[0]?.priceMinor ?? 0,
    availableLinkTypes: services.filter((s: any) => s.available).map((s: any) => s.type),
  } as unknown as WebsiteListItem;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

console.log('\n--- who will take it ---');
{
  const gambler = site({ accepted: ['gambling', 'crypto'] });
  const travel = site({ accepted: ['travel'] });

  is('a publisher who accepts it is shown', acceptsTopic(gambler, 'gambling' as never), true);
  is('one who does not is not', acceptsTopic(travel, 'gambling' as never), false);
  // The whole point: a buyer with a casino client must not shortlist ten
  // sites and find out at the order page which of them will take it.
  is('the marketplace narrows to the ones who will', forTopic([gambler, travel], 'gambling' as never).length, 1);
  is('and no topic means the whole marketplace', forTopic([gambler, travel], undefined).length, 2);
}

console.log('\n--- priced for it ---');
{
  const premium = site({
    accepted: ['gambling'],
    services: [{ id: 's1', type: 'guest-post', priceMinor: 20000, available: true }],
    nichePrices: [{ linkType: 'guest-post', niche: 'gambling', priceMinor: 49900 }],
  });

  const priced = pricedForTopic(premium, 'gambling' as never);
  // The number the card prints, the number it sorts on and the number the
  // buyer pays all have to be the same number.
  is('the headline price becomes the topic price', priced.headlinePriceMinor, 49900);
  is('and so does the "from" price', priced.lowestPriceMinor, 49900);
  is('the general price is untouched on the service', priced.services[0]?.priceMinor, 20000);

  const flat = site({ accepted: ['gambling'] });
  is('a publisher with no premium keeps their rate', pricedForTopic(flat, 'gambling' as never).lowestPriceMinor, 20000);
}

console.log('\n--- the cheapest across placements ---');
{
  const mixed = site({
    accepted: ['gambling'],
    services: [
      { id: 's1', type: 'guest-post', priceMinor: 30000, available: true },
      { id: 's2', type: 'niche-edit', priceMinor: 10000, available: true },
    ],
    nichePrices: [
      { linkType: 'guest-post', niche: 'gambling', priceMinor: 60000 },
      { linkType: 'niche-edit', niche: 'gambling', priceMinor: 25000 },
    ],
  });

  const priced = pricedForTopic(mixed, 'gambling' as never);
  is('"from" is the cheapest placement at the topic rate', priced.lowestPriceMinor, 25000);
  is('not the cheapest general one', priced.lowestPriceMinor === 10000, false);
}

console.log('\n--- only topics a publisher has answered ---');
{
  /*
    The picker offered all twenty-five topics. A publisher only ever states a
    position on the seven sensitive ones - `sellableNiches` returns those and
    nothing else - so asking for Sports or Technology asked a question no
    reply has ever answered, the filter correctly matched nobody, and the
    screen said "no websites found". An unanswerable question reading as an
    empty marketplace is the worst of both.
  */
  const answerable = new Set(sensitiveNicheSlugs as readonly string[]);
  for (const niche of acceptedNiches) {
    const canBeAnswered = answerable.has(niche.slug) || niche.slug === GENERAL_NICHE;
    is(`"${niche.slug}" is offered only if a reply could answer it`, isBuyableTopic(niche.slug), canBeAnswered);
  }

  is('the picker offers eight topics', BUYABLE_TOPICS.length, 8);
  is('general leads', BUYABLE_TOPICS[0], GENERAL_NICHE);

  /*
    General is everybody. Nothing records that a publisher accepts ordinary
    content because nobody has ever had to say so, and reading it off
    `acceptedNiches` like a sensitive topic told a buyer asking for ordinary
    content that the marketplace was empty.
  */
  const plain = site({ accepted: [] });
  is('every publisher takes general content', acceptsTopic(plain, GENERAL_NICHE as never), true);
  is(
    'so general keeps every publisher',
    forTopic([plain, site({ accepted: ['gambling'] })], GENERAL_NICHE as never).length,
    2,
  );
  // And a sensitive topic still narrows, which is the whole point of asking.
  is(
    'while gambling still narrows',
    forTopic([plain, site({ accepted: ['gambling'] })], 'gambling' as never).length,
    1,
  );

  // The guard that makes the list above true: if extraction ever learns to
  // record a stance on another topic, this fails and the picker can grow.
  const everySlugItCanReturn = sellableNiches({
    niches: Object.fromEntries(
      (sensitiveNicheSlugs as readonly string[]).map((slug) => [slug, { accepted: 'yes' }]),
    ),
  } as never);
  is(
    'extraction still answers only the sensitive topics',
    everySlugItCanReturn.length,
    sensitiveNicheSlugs.length,
  );
}

console.log('\n--- a link built before the picker shrank ---');
{
  /*
    `?topic=sports` is still a shareable URL. Honouring it would filter the
    marketplace to nobody while the dropdown showed blank - no option matches -
    which is an empty screen with no visible cause. The hook drops it, so the
    link opens the whole marketplace.

    Checked against the source because the hook is a client module: importing
    it here would pull in next/navigation.
  */
  const hook = readFileSync(
    new URL('../src/lib/hooks/use-marketplace-filters.ts', import.meta.url),
    'utf8',
  ).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  is(
    'the topic in the URL is checked before it is honoured',
    /topic:\s*buyableTopic\(/.test(hook),
    true,
  );
  is(
    'and is not cast straight out of the query string',
    /params\.get\('topic'\)\s*as\s/.test(hook),
    false,
  );
  is('a topic nobody can answer is not buyable', isBuyableTopic('sports'), false);
  is('one the picker offers is', isBuyableTopic('gambling'), true);
}

console.log('\n--- a market nobody stated ---');
{
  /*
    Every listing said United Kingdom. `country_code` was `not null` with no
    default, so something had to supply one, and the only thing supplying one
    was `newWebsiteDefaults` with a hard-coded 'GB'. A publisher list rarely
    carries a country and an email never does, so almost every listing claimed
    a market nobody had named - and ticking "United States" found nothing.
  */
  const defaults = readFileSync(
    new URL('../src/lib/import/to-website.ts', import.meta.url),
    'utf8',
  ).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  is(
    'a new listing is not born British',
    /country:\s*'GB'/.test(defaults),
    false,
  );
  is(
    'it takes the country its domain names',
    /country:\s*countryFromDomain\(domain\)/.test(defaults),
    true,
  );

  // The suffix is a real signal for exactly these, and worth nothing for the
  // ones sold as English words. Getting that wrong puts the guess back.
  is('a Danish domain is Danish', countryFromDomain('mgdk.dk'), 'DK');
  is('a .co.uk is British, under the ISO code', countryFromDomain('terracetalk.co.uk'), 'GB');
  is('a .com.au is Australian', countryFromDomain('shop.com.au'), 'AU');
  is('a .com names nothing', countryFromDomain('plainsite.com'), undefined);
  is('nor does .net', countryFromDomain('plainsite.net'), undefined);
  is('.io is not the Indian Ocean Territory', countryFromDomain('devtool.io'), undefined);
  is('.ai is not Anguilla', countryFromDomain('model.ai'), undefined);
  is('.co is not Colombia', countryFromDomain('brand.co'), undefined);
  is('.me is not Montenegro', countryFromDomain('about.me'), undefined);
  // And the registry-dominated European ones are trusted, because leaving
  // Italy and Austria unknown costs more coverage than it buys accuracy.
  is('.it is Italian', countryFromDomain('giornale.it'), 'IT');
  is('.at is Austrian', countryFromDomain('zeitung.at'), 'AT');
  is('.be is Belgian', countryFromDomain('krant.be'), 'BE');
  is('.in is Indian', countryFromDomain('times.in'), 'IN');

  /*
    The suffix list exists in the migration too, because the backfill runs in
    the database. A list kept in two places drifts, and the stale copy is the
    one that decides a publisher's market - so the migration's copy is
    generated from the module and this is what stops them parting.
  */
  const migration = readFileSync(
    new URL('../supabase/migrations/0043_country_nobody_stated.sql', import.meta.url),
    'utf8',
  );
  const inSql = [...migration.matchAll(/\('([a-z]{2})', '([A-Z]{2})'\)/g)].map(
    (match) => `${match[1]}=${match[2]}`,
  );
  const inCode = cctldPairs.map(([suffix, country]) => `${suffix}=${country}`);
  is('the migration carries every suffix the code trusts', inSql.length, inCode.length);
  is(
    'and exactly the same ones',
    inSql.slice().sort().join(',') === inCode.slice().sort().join(','),
    true,
  );
}

console.log('\n--- filtering by a country ---');
{
  const american = site({ country: 'US' });
  const unknown = site({ country: undefined });

  /*
    A listing whose market nobody has established is excluded by a country
    filter, not included in every one. "Publishers in the United States" has to
    mean publishers somebody has placed there - matching the unknowns would
    hand a buyer a shortlist that only looks like it answers their question.
  */
  is('a country filter keeps the listings in it', runQuery([american, unknown], { countries: ['US'] } as never).items.length, 1);
  is(
    'and the one it keeps is the one with the market',
    runQuery([american, unknown], { countries: ['US'] } as never).items[0]?.country,
    'US',
  );
  is('no country filter keeps both', runQuery([american, unknown], {} as never).items.length, 2);
}

console.log('\n--- the country Ahrefs measures ---');
{
  /*
    Ahrefs reports which countries a domain's traffic actually comes from. That
    is a better answer to "what market is this publisher in" than anything short
    of the publisher saying so, and it arrives for every domain in a refresh - so
    it is what establishes the country, rather than only being shown beside it.

    `topCountries` arrives sorted by traffic, so the first entry is the market.
  */
  const breakdown = {
    organicTraffic: 100000,
    topCountries: [
      { country: 'US', traffic: 71000 },
      { country: 'GB', traffic: 9000 },
    ],
  };

  const fromNothing = audiencePatch(breakdown, undefined);
  is('a listing with no market takes the measured one', fromNothing.country_code, 'US');
  is('and records that it was measured', fromNothing.country_source, 'measured');
  is('the share is the share of that same country', fromNothing.top_country_share, 71);

  const overGuess = audiencePatch(breakdown, { code: 'DE', source: 'domain' });
  is('a measurement replaces a country guessed from the domain', overGuess.country_code, 'US');

  /*
    The one it must never touch. A nightly job quietly undoing an
    administrator's edit is the same bug as the invented 'GB' - a value changing
    with nothing to say why - and it would be found weeks later by a buyer.
  */
  const overChoice = audiencePatch(breakdown, { code: 'FR', source: 'stated' });
  is('but never one a person chose', overChoice.country_code, undefined);
  is('and leaves its source alone too', overChoice.country_source, undefined);
  is(
    'while still measuring the share of the country that is held',
    overChoice.top_country_share,
    null,
  );

  const measuredAgain = audiencePatch(breakdown, { code: 'NL', source: 'measured' });
  is('a newer measurement replaces an older one', measuredAgain.country_code, 'US');

  // No breakdown, no claim. A refresh that measured nothing must not clear a
  // country it has nothing to say about.
  const nothingMeasured = audiencePatch(
    { organicTraffic: 0, topCountries: [] },
    { code: 'DE', source: 'domain' },
  );
  is('a refresh with no breakdown changes nothing', 'country_code' in nothingMeasured, false);

  is('stated outranks measured', outranksCountrySource('measured', 'stated'), false);
  is('measured outranks domain', outranksCountrySource('measured', 'domain'), true);
  is('domain does not outrank measured', outranksCountrySource('domain', 'measured'), false);
  is('anything beats no source at all', outranksCountrySource('domain', undefined), true);

  /*
    The database has its own copy of this list, in a check constraint. Two
    copies drift, and the drift shows up as a failed update on a value the
    application believes is legal.
  */
  const migration = readFileSync(
    new URL('../supabase/migrations/0044_country_source.sql', import.meta.url),
    'utf8',
  );
  const allowed = [...migration.matchAll(/country_source in \(([^)]+)\)/g)].flatMap((match) =>
    match[1]!.split(',').map((value) => value.trim().replace(/'/g, '')),
  );
  is(
    'the constraint allows exactly the sources the code knows',
    allowed.slice().sort().join(',') === COUNTRY_SOURCES.slice().sort().join(','),
    true,
  );
}

console.log('\n--- ordering, both ways ---');
{
  /*
    Every measure a buyer sorts on has to read from both ends. A shortlist is
    built by looking from one end or the other, and which end depends on whether
    somebody is spending a budget or filling one.

    DR and traffic were clickable columns whose second click did nothing: the
    header kept a map of opposites with only price in it. Referring domains was
    not clickable at all. Both halves now come from the key, so a column cannot
    be added half-wired.
  */
  const weak = site({
    dr: 20, traffic: 1000, rd: 50, turnaround: 10,
    services: [{ id: 's1', type: 'guest-post', priceMinor: 9000, available: true }],
  });
  const strong = site({
    dr: 80, traffic: 90000, rd: 9000, turnaround: 2,
    services: [{ id: 's1', type: 'guest-post', priceMinor: 65000, available: true }],
  });
  const pair = [weak, strong];

  const first = (sort: never) => sortItems(pair, sort, '')[0]?.id;

  is('highest DR first', first('dr-desc' as never), strong.id);
  is('and lowest DR first', first('dr-asc' as never), weak.id);
  is('highest traffic first', first('traffic-desc' as never), strong.id);
  is('and lowest traffic first', first('traffic-asc' as never), weak.id);
  is('most referring domains first', first('rd-desc' as never), strong.id);
  is('and fewest first', first('rd-asc' as never), weak.id);
  is('fastest turnaround first', first('turnaround-asc' as never), strong.id);
  is('and slowest first', first('turnaround-desc' as never), weak.id);

  /*
    The guard that makes the above a rule rather than eight examples: every
    order the dropdown offers must have an opposite that is also offered, and
    sorting by it must actually reverse the list. An order with no opposite is a
    column whose second click does nothing.
  */
  const offered = new Set(sortOptions.map((option) => option.value));
  let unpaired = 0;
  let notReversed = 0;
  for (const option of sortOptions) {
    const opposite = flipSort(option.value);
    if (!opposite) continue; // relevance and newest have no other end
    if (!offered.has(opposite)) unpaired += 1;
    const forwards = sortItems(pair, option.value, '').map((item) => item.id);
    const backwards = sortItems(pair, opposite, '').map((item) => item.id);
    if (forwards.join() === backwards.join()) notReversed += 1;
  }
  is('every order the dropdown offers has its opposite offered too', unpaired, 0);
  is('and sorting the other way actually reverses the list', notReversed, 0);

  // The header reads its arrow off the key, so the arrow cannot disagree with
  // the order. It used to be a ternary naming two keys by hand.
  is('a descending key reads as descending', sortDirection('rd-desc' as never), 'descending');
  is('an ascending one as ascending', sortDirection('turnaround-desc' as never), 'descending');
  is('relevance has no direction', sortDirection('relevance' as never), undefined);
  is('and no opposite', flipSort('relevance' as never), undefined);

  // Every sortable column in the table has to be an order the engine handles.
  const table = readFileSync(
    new URL('../src/components/marketplace/website-table.tsx', import.meta.url),
    'utf8',
  );
  const columnKeys = [...table.matchAll(/key:\s*'([a-z-]+)'/g)].map((match) => match[1]!);
  is('the table offers five sortable columns', columnKeys.length, 5);
  is(
    'and every one is an order the dropdown offers as well',
    columnKeys.every((key) => offered.has(key as never)),
    true,
  );
}

console.log('\n--- referring domains, which the refresh never wrote ---');
{
  /*
    Listings showed 0 referring domains after a refresh and a real figure when
    the same domain was checked in Ahrefs by hand.

    The cause was not a parsing bug or a bad reading: `refdomains` was never
    asked for. The batch request selected domain rating, traffic and the country
    breakdown and nothing else, and the update wrote those three - so the column
    kept whatever the CSV import left in it, which was zero for most, while
    everything around it updated. A refreshed listing read as a site with real
    traffic and no backlinks at all, and the marketplace filters on that column.
  */
  const client = readFileSync(
    new URL('../src/lib/ahrefs/client.ts', import.meta.url),
    'utf8',
  );

  is("the batch request asks for it",
    /'refdomains'/.test(client), true);
  // On the same request as the rest, so it is a column rather than a call.
  is(
    'on the one request that was already being made',
    (client.match(/batch-analysis\/batch-analysis/g) ?? []).length,
    1,
  );
  // Ahrefs' own guidance: `domain` mode excludes www and other subdomains.
  is('and still asks about the whole site',
    /mode: 'subdomains'/.test(client), true);

  const refresh = readFileSync(
    new URL('../src/lib/services/refresh-service.ts', import.meta.url),
    'utf8',
  );
  is('the refresh writes it',
    /referring_domains: metrics\.referringDomains/.test(refresh), true);

  /*
    And writes it only when Ahrefs gave one. A reading it did not give is not a
    reading of zero - the same rule that decides whether the row is written at
    all, and the rule whose absence here is what put zeros on the page.
  */
  is(
    'only when Ahrefs reported one',
    /metrics\.referringDomains == null[\s\S]{0,80}referring_domains/.test(refresh),
    true,
  );
  is(
    'and the parser leaves it out rather than calling it zero',
    /row\.refdomains == null \? \{\} : \{ referringDomains/.test(client),
    true,
  );

  /*
    A target Ahrefs knows nothing about is still skipped entirely, so a domain
    with no data stays due rather than being marked fresh at zero.

    Whitespace-tolerant, because the guard grew a fourth clause when keywords
    were added and a one-line regex broke on the wrapping. It failed, which is
    what a guard like this is for - but it was failing on formatting rather
    than on the rule, so it is written against the clauses now.
  */
  for (const column of ['domain_rating', 'org_traffic', 'refdomains', 'org_keywords']) {
    is(
      `a target with no ${column} counts towards being left alone`,
      new RegExp(`row\\.${column} == null`).test(client),
      true,
    );
  }

  /*
    ------------------------------------------------------------- keywords

    The same omission as `refdomains`, caught before it shipped rather than
    after. `org_keywords` is a column on the request already being made: the
    endpoint is priced by metric group, and `org_traffic` has already paid for
    the organic one, so the six-column select and the select with keywords both
    cost 90 units per domain - measured against the live API, not assumed.
  */
  is('the batch request asks for the keyword count', /'org_keywords'/.test(client), true);
  is(
    'the refresh writes it',
    /organic_keywords: metrics\.organicKeywords/.test(refresh),
    true,
  );
  is(
    'only when Ahrefs reported one',
    /metrics\.organicKeywords == null[\s\S]{0,120}organic_keywords/.test(refresh),
    true,
  );
  is(
    'and the parser leaves it out rather than calling it zero',
    /row\.org_keywords == null \? \{\} : \{ organicKeywords/.test(client),
    true,
  );

  // The panel shows a dash for a listing nobody has measured. A zero there is
  // a claim about the publisher, not about our data.
  const snippet = readFileSync(
    new URL('../src/components/marketplace/website-snippet.tsx', import.meta.url),
    'utf8',
  );
  is(
    'the panel shows the keyword count',
    /Organic keywords/.test(snippet),
    true,
  );
  is(
    'and a dash rather than a zero when it was never measured',
    /typeof website\.metrics\.organicKeywords === 'number'/.test(snippet),
    true,
  );
}

console.log('\n--- refreshing one tier ---');
{
  /*
    "Run now" took whatever was due in tier order, which is right for a nightly
    schedule and wrong for somebody at the screen deciding how to spend the
    month: five hundred overdue tier 3 domains is tens of thousands of units and
    it was all or nothing.
  */
  const refresh = readFileSync(
    new URL('../src/lib/services/refresh-service.ts', import.meta.url),
    'utf8',
  );

  is('the run takes an optional tier', /runRefresh\(options: RunOptions = \{\}\)/.test(refresh), true);
  is('and passes it to the selection', /p_tier: options\.tier \?\? null/.test(refresh), true);
  // Null is every tier, which is what the schedule wants and what the
  // one-argument form of the function did - so the nightly job is unchanged.
  is(
    'the scheduled run still asks for every tier',
    /runRefresh\(\)/.test(
      readFileSync(new URL('../src/app/api/cron/ahrefs-refresh/route.ts', import.meta.url), 'utf8'),
    ),
    true,
  );

  /*
    The tier comes from a browser. A value that is not a real tier would reach
    the database as a filter nothing matches - a run that spends nothing,
    refreshes nothing and reports that it completed.
  */
  const action = readFileSync(
    new URL('../src/app/admin/(protected)/refresh/actions.ts', import.meta.url),
    'utf8',
  );
  is(
    'a tier from the browser is checked before it is used',
    /tier === 1 \|\| tier === 2 \|\| tier === 3 \? tier : undefined/.test(action),
    true,
  );

  // The history is where somebody checks what a run cost, so it has to say
  // which slice it was.
  is('the run history records which tier ran', /in tier \$\{options\.tier\}/.test(refresh), true);

  const migration = readFileSync(
    new URL('../supabase/migrations/0045_refresh_one_tier.sql', import.meta.url),
    'utf8',
  );
  is('the selection filters on it', /p_tier is null or coalesce\(w\.ahrefs_tier, 3\) = p_tier/.test(migration), true);
  // The one-argument form stays: the database is migrated before the code that
  // uses it, so the running deploy must keep working through the gap.
  is(
    'and the old signature is left in place',
    !/drop function[^\n]*ahrefs_due_domains\(integer\)/.test(migration),
    true,
  );

  const button = readFileSync(
    new URL('../src/components/admin/run-tier.tsx', import.meta.url),
    'utf8',
  );
  is('the button asks before spending', /window\.confirm/.test(button), true);
  is('and names the count it will act on', /\$\{overdue\}/.test(button), true);
  is('a tier with nothing due offers no button', /overdue === 0/.test(button), true);
}

/*
  The related strip.

  The old version fetched sixty unordered listings to show four and filtered
  them in JavaScript, which meant a niche holding thirty sites out of eighteen
  hundred could miss all thirty and show an empty strip. The ranking is now
  pure and the database does the filtering, so the part that decides what a
  buyer sees can be checked by calling a function.
*/
{
  console.log('\n--- related listings ---');

  const site = (slug: string, domainRating: number) => ({ slug, metrics: { domainRating } });
  const current = site('target', 50);

  /*
    Distances chosen so none of them tie: 2, 4, 40 and 45 from DR 50. The
    first version of this used 46 and 54, which are both 4 away - so the slug
    tiebreak decided the order and the test was asserting the tiebreak while
    claiming to assert closeness. It failed, which is the only reason it was
    noticed.
  */
  const ranked = rankRelated(
    [site('far-below', 10), site('just-above', 54), site('just-below', 48), site('far-above', 95)],
    current,
    4,
  );
  is('closest Domain Rating first', ranked[0]?.slug, 'just-below');
  is('then the next closest', ranked[1]?.slug, 'just-above');
  is('then the next', ranked[2]?.slug, 'far-below');
  is('and the furthest last', ranked[3]?.slug, 'far-above');

  is(
    'the listing being read is never related to itself',
    rankRelated([site('target', 50), site('other', 51)], current, 4).map((s) => s.slug).join(),
    'other',
  );

  // The two queries feeding this overlap at the boundary, so the same listing
  // can arrive twice. It must appear once.
  is(
    'a listing returned by both queries appears once',
    rankRelated([site('dup', 55), site('dup', 55)], current, 4).length,
    1,
  );

  // Two sites on the same DR would otherwise swap places between page loads,
  // which looks like a bug in the page.
  is(
    'ties break on the slug rather than on arrival order',
    rankRelated([site('zebra', 55), site('alpha', 55)], current, 4).map((s) => s.slug).join(),
    'alpha,zebra',
  );
  is(
    'and the same answer whichever order they arrive in',
    rankRelated([site('alpha', 55), site('zebra', 55)], current, 4).map((s) => s.slug).join(),
    'alpha,zebra',
  );

  is('the limit is honoured', rankRelated([site('a', 51), site('b', 52), site('c', 53)], current, 2).length, 2);
  is('fewer candidates than the limit is not an error', rankRelated([site('a', 51)], current, 4).length, 1);
  is('no candidates is an empty strip', rankRelated([], current, 4).length, 0);

  /*
    A listing whose DR was never measured maps to 0, so it ranks last on its
    own merits. The point is that it is not silently dropped: it is in the
    same niche, which is the stronger relevance signal of the two.
  */
  const withUnmeasured = rankRelated([site('unmeasured', 0), site('close', 48)], current, 4);
  is('an unmeasured listing still appears', withUnmeasured.length, 2);
  is('but ranks behind a measured one', withUnmeasured[1]?.slug, 'unmeasured');

  /*
    Asking each side for the limit is enough, and asking for more would be
    fetching rows that cannot win: the nearest four overall are always inside
    the nearest four above plus the nearest four below.
  */
  is('each side is asked for the limit', candidatesPerSide(4), 4);
  is('and never for nothing', candidatesPerSide(0), 1);

  const repo = readFileSync(
    new URL('../src/lib/services/supabase/website-repository.ts', import.meta.url),
    'utf8',
  );
  const body = repo.slice(repo.indexOf('async getRelated'), repo.indexOf('async getByIds'));
  is('the sixty-row fetch is gone', /limit\(60\)/.test(body), false);
  is('the niche is filtered in the query', /primary_category_id/.test(body), true);
  is('the rows are ordered', /order\('domain_rating'/.test(body), true);
  is('unmeasured listings are not excluded', /domain_rating\.is\.null/.test(body), true);
  is('and it no longer re-reads the listing it was given', /getBySlug/.test(body), false);
}

/*
  The expanded marketplace row.

  A listing carries one country, which is the market it is established in. The
  panel shows where the readers actually are, because a site classified as
  United States sending forty per cent of its traffic to the United Kingdom is
  the whole decision for somebody buying for a British client - and the single
  country answer hides exactly that.
*/
{
  console.log('\n--- traffic by country ---');

  const split = (...pairs: [string, number][]) =>
    pairs.map(([country, share]) => ({ country: country as never, share }));

  const four = audienceBreakdown(split(['US', 46], ['GB', 40], ['CA', 7], ['AU', 4]));
  is('the named countries come through', four.length, 5);
  is('biggest first', four[0]?.country, 'US');
  is('and the remainder is combined', four[4]?.country, 'OTHER');
  is('which is what is missing, not what was dropped', four[4]?.share, 3);
  is('so the bars add up to a whole', four.reduce((total, s) => total + s.share, 0), 100);

  // Ahrefs returns a handful of countries whose shares rarely sum to a
  // hundred; the long tail is simply not reported. "Other" has to come from
  // the gap or it reads as zero on a site with a genuine tail.
  const tail = audienceBreakdown(split(['US', 30], ['GB', 20], ['CA', 10], ['AU', 5]));
  is('a long tail is accounted for', tail[4]?.share, 35);

  is(
    'only the top four are named',
    audienceBreakdown(split(['US', 30], ['GB', 25], ['CA', 20], ['AU', 15], ['DE', 5], ['FR', 5]))
      .filter((s) => !s.isOther).length,
    NAMED_COUNTRIES,
  );

  const one = audienceBreakdown(split(['US', 100]));
  is('a single country needs no Other row', one.length, 1);
  is('and fills the bar', one[0]?.share, 100);

  // A one per cent remainder is rounding, not a finding.
  is('a rounding remainder is not given a row', audienceBreakdown(split(['US', 99.6])).length, 1);

  is('no data is an empty breakdown, not a zero row', audienceBreakdown(undefined).length, 0);
  is('nor is an empty array', audienceBreakdown([]).length, 0);
  is('a zero share is not a country', audienceBreakdown(split(['US', 0])).length, 0);

  // A provider rounding every share up can push one past a hundred, and a bar
  // wider than its track looks like a rendering fault.
  is('a share over a hundred is clamped', audienceBreakdown(split(['US', 140]))[0]?.share, 100);

  is('arrives unsorted, leaves sorted', audienceBreakdown(split(['CA', 7], ['US', 46]))[0]?.country, 'US');

  // The arithmetic a future "at least 25% UK traffic" filter needs, kept here
  // so the filter and the panel cannot disagree about what a share is.
  is('a share can be read for one country', shareFor(split(['US', 46], ['GB', 40]), 'GB'), 40);
  is('case does not matter', shareFor(split(['US', 46]), 'us'), 46);
  is('a country with no traffic reads as zero', shareFor(split(['US', 46]), 'DE'), 0);
  is('and so does no data at all', shareFor(undefined, 'GB'), 0);

  console.log('\n--- country flags ---');
  is('a code becomes a flag', flagEmoji('GB'), '🇬🇧');
  is('lower case too', flagEmoji('us'), '🇺🇸');
  is('a bad code produces nothing rather than two stray symbols', flagEmoji('XYZ'), '');
  is('and so does nothing', flagEmoji(''), '');

  /*
    The panel must hide a term the publisher never stated rather than print a
    "No". These terms have been written to `websites` since the sourcing
    migration and were read by nothing until now, so this is the first thing
    standing between a buyer and a claim nobody made.
  */
  console.log('\n--- the expanded panel states only what it knows ---');
  const panel = readFileSync(
    new URL('../src/components/marketplace/website-snippet.tsx', import.meta.url),
    'utf8',
  );
  is('permanence is shown only when stated', /rules\.permanence \? \(/.test(panel), true);
  is('the dofollow expiry too', /typeof rules\.dofollowExpiresAfterMonths === 'number'/.test(panel), true);
  is('homepage placement too', /rules\.homepagePlacement === true/.test(panel), true);
  is(
    'a site with no country data says so rather than drawing empty bars',
    /No country traffic data/.test(panel),
    true,
  );
  is('delivered placements are hidden at zero', /website\.completedOrders > 0/.test(panel), true);
  is('example content is hidden when there is none', /examples\.length > 0/.test(panel), true);
  // Expanding a row must never cost a request: everything shown is already on
  // the listing the marketplace fetched.
  is('the panel fetches nothing', !/\bfetch\(|useEffect/.test(panel), true);
  is('and reuses the one add-to-order button', /AddToOrderButton/.test(panel), true);

  const editor = readFileSync(
    new URL('../src/components/admin/website-editor.tsx', import.meta.url),
    'utf8',
  );
  for (const field of [
    'permanence',
    'minLiveMonths',
    'dofollowExpiresAfterMonths',
    'homepagePlacement',
    'topicRestriction',
  ]) {
    is(`${field} can be edited in the admin`, new RegExp(`name="${field}"`).test(editor), true);
  }

  /*
    The three example rows are rendered from a loop, so their names are built
    rather than written out. Checked against the form instead of the markup:
    the contract that matters is that the save action reads the names the
    editor emits, and a literal-string check on the editor missed that
    entirely - it failed while the fields were working.
  */
  const saveAction = readFileSync(
    new URL('../src/app/admin/actions.ts', import.meta.url),
    'utf8',
  );
  is('the example rows are rendered from a loop', /name=\{`exampleTitle\$\{index\}`\}/.test(editor), true);
  is('with a path beside each', /name=\{`examplePath\$\{index\}`\}/.test(editor), true);
  is('and the save action reads those names', /exampleTitle\$\{index\}/.test(saveAction), true);
  is('and that one', /examplePath\$\{index\}/.test(saveAction), true);
  // A title with no path is a link to the homepage, which is an example of
  // nothing.
  is('a half-filled example row is dropped', /if \(!title \|\| !path\) return null/.test(saveAction), true);
}

console.log(failed ? `\n  ${failed} FAILED\n` : '\n  all passed\n');
process.exit(failed ? 1 : 0);
