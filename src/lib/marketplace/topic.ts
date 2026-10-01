import { placementPrice } from '@/lib/utils/pricing';
import { GENERAL_NICHE } from '@/lib/config/accepted-niches';
import type { BuyerTier } from '@/lib/utils/pricing';
import type { AcceptedNicheSlug, WebsiteListItem } from '@/lib/types';

/**
 * Buying for a topic, rather than picking one at the end.
 *
 * Somebody buying links for a casino client knows that before they open the
 * marketplace. The topic is a property of the campaign, not of each
 * placement - so asking once, at the top, answers three questions at a
 * stroke: which publishers will take it, what they charge for it, and what
 * the order should say.
 *
 * Without it a buyer filters by category, which is what a site writes about
 * rather than what it will accept. They shortlist ten sites, add them, and
 * only then find out which will take gambling at all.
 *
 * Pure: no hooks, no fetching. The marketplace maps its list through this
 * before sorting, so the price being sorted on is the price on the card.
 */

/**
 * Will this publisher take content on that topic at all?
 *
 * `general` is everybody. It is the catch-all - ordinary content, at the
 * standard price - and no publisher has ever had to say they accept it, so
 * nothing records that they do. Reading it off `acceptedNiches` like the
 * sensitive topics would mean a buyer asking for ordinary content was told
 * the marketplace is empty, which is the opposite of true.
 */
export function acceptsTopic(
  website: Pick<WebsiteListItem, 'rules'>,
  topic: AcceptedNicheSlug,
): boolean {
  if (topic === GENERAL_NICHE) return true;
  return (website.rules.acceptedNiches ?? []).includes(topic);
}

/**
 * The same listing, priced for the topic.
 *
 * `headlinePriceMinor` and `lowestPriceMinor` are what the marketplace sorts
 * on, filters price ranges against and prints on the card. Rewriting them
 * here means every one of those agrees with every other without a single
 * caller having to remember the topic - and a card reading "from $499" is a
 * card you can actually buy at $499.
 */
export function pricedForTopic(
  website: WebsiteListItem,
  topic: AcceptedNicheSlug,
  tier: BuyerTier = 'standard',
): WebsiteListItem {
  const prices = website.availableLinkTypes
    .map((linkType) => placementPrice(website, linkType, topic, tier)?.priceMinor)
    .filter((price): price is number => typeof price === 'number' && price > 0);

  if (prices.length === 0) return website;

  const headline = website.headlineService
    ? placementPrice(website, website.headlineService.type, topic, tier)?.priceMinor
    : undefined;

  return {
    ...website,
    headlinePriceMinor: headline && headline > 0 ? headline : website.headlinePriceMinor,
    lowestPriceMinor: Math.min(...prices),
  };
}

/**
 * The marketplace, narrowed to one topic and priced for it.
 *
 * No topic means no change at all: the general marketplace is the default and
 * nothing about it moves until somebody says what they are buying for.
 */
export function forTopic(
  websites: WebsiteListItem[],
  topic: AcceptedNicheSlug | undefined,
  tier: BuyerTier = 'standard',
): WebsiteListItem[] {
  if (!topic) return websites;
  return websites
    .filter((website) => acceptsTopic(website, topic))
    .map((website) => pricedForTopic(website, topic, tier));
}
