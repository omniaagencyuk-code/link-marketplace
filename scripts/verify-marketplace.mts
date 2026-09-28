/**
 * Prove the marketplace shows a buyer what they can actually buy.
 *
 * Choosing a topic at the top is three promises: only publishers who accept
 * it, priced for it, and carried into the order. The first two are pure and
 * are checked here - a card reading "from $499" that cannot be bought at
 * $499 is worse than no price at all.
 */
import { acceptsTopic, forTopic, pricedForTopic } from '../src/lib/marketplace/topic';
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

console.log(failed ? `\n  ${failed} FAILED\n` : '\n  all passed\n');
process.exit(failed ? 1 : 0);
