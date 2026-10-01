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

/* eslint-disable @typescript-eslint/no-explicit-any */
function site(over: Partial<any> = {}): WebsiteListItem {
  const services = over.services ?? [
    { id: 's1', type: 'guest-post', priceMinor: 20000, available: true },
  ];
  return {
    id: over.id ?? 'w1',
    domain: over.domain ?? 'example.com',
    rules: { acceptedNiches: over.accepted ?? [] },
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

console.log(failed ? `\n  ${failed} FAILED\n` : '\n  all passed\n');
process.exit(failed ? 1 : 0);
