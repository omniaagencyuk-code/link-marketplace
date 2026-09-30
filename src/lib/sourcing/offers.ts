/**
 * Two people offering the same site.
 *
 * It happens often: a publisher answers, and so does a reseller who has that
 * publisher in their portfolio. Both drafts are stored, both are real, and
 * until now approving the second silently overwrote the first - the losing
 * price and contact vanished from every screen, though they were still in
 * the table.
 *
 * Pure: given the offers and today's rates, say which is cheapest and which
 * sender looks like the site's own. Nothing here decides anything; it lays
 * the two side by side so a person can.
 */

export type SenderSignal =
  /** The sender's email domain is the site itself. Almost always the owner. */
  | 'owner-match'
  /** A gmail.com or similar. Common for resellers and brokers. */
  | 'free-email'
  /** A business address at some other domain. Could be either. */
  | 'third-party';

/*
  The providers a reseller uses, not an exhaustive list of webmail.

  Being on it is not an accusation - plenty of small publishers run their
  business from a personal address. It is one signal of three, shown rather
  than acted on.
*/
const FREE_EMAIL = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'hotmail.com', 'hotmail.co.uk',
  'outlook.com', 'live.com', 'msn.com', 'aol.com', 'icloud.com', 'me.com', 'mac.com',
  'protonmail.com', 'proton.me', 'gmx.com', 'gmx.de', 'mail.ru', 'yandex.ru', 'yandex.com',
  'qq.com', '163.com', '126.com', 'web.de', 'free.fr', 'orange.fr', 'wanadoo.fr', 'libero.it',
  'seznam.cz', 'zoho.com', 'hushmail.com', 'tutanota.com', 'fastmail.com',
]);

function bare(host: string): string {
  return host.trim().toLowerCase().replace(/^www\./, '');
}

/** The domain part of an address, or '' when there is not one. */
export function senderDomain(address: string): string {
  const at = address.lastIndexOf('@');
  return at === -1 ? '' : bare(address.slice(at + 1));
}

/**
 * How the sender relates to the site they are offering.
 *
 * A subdomain counts as a match in either direction: the person who runs
 * modalova.com is the person who runs us.modalova.com, and a reply from
 * either address about either site is the same publisher.
 */
export function senderSignal(address: string, siteDomain: string): SenderSignal {
  const from = senderDomain(address);
  const site = bare(siteDomain);
  if (!from || !site) return 'third-party';

  if (from === site) return 'owner-match';
  if (from.endsWith(`.${site}`) || site.endsWith(`.${from}`)) return 'owner-match';
  if (FREE_EMAIL.has(from)) return 'free-email';
  return 'third-party';
}

export function signalLabel(signal: SenderSignal): string {
  switch (signal) {
    case 'owner-match':
      return 'Writes from the site’s own domain';
    case 'free-email':
      return 'Free email address';
    default:
      return 'Writes from another domain';
  }
}

export interface Offer {
  draftId: string;
  domain: string;
  fromAddress: string;
  /** What they charge us, in their currency. Null when they quoted none. */
  cost: number | null;
  currency: string | null;
  sentAt: string | null;
  status: string;
}

export interface RankedOffer extends Offer {
  signal: SenderSignal;
  /** The cost in our own currency, for comparing. Null when it cannot be. */
  costInBase: number | null;
  /** True for the cheapest offer that could be converted at all. */
  cheapest: boolean;
}

/**
 * The offers for one domain, cheapest first.
 *
 * Comparing means converting, and a price we cannot convert is not cheaper
 * than anything - it is unknown, and it sorts last rather than first. That
 * is the same rule the margin report follows, and for the same reason: a
 * number without its currency looked cheapest once and was not.
 */
export function rankOffers(offers: Offer[], rates: Map<string, number>): RankedOffer[] {
  const ranked: RankedOffer[] = offers.map((offer) => {
    const rate = offer.currency ? rates.get(offer.currency.toUpperCase()) : undefined;
    const costInBase =
      offer.cost != null && offer.cost > 0 && rate ? offer.cost * rate : null;

    return { ...offer, signal: senderSignal(offer.fromAddress, offer.domain), costInBase, cheapest: false };
  });

  ranked.sort((a, b) => {
    if (a.costInBase == null && b.costInBase == null) return 0;
    if (a.costInBase == null) return 1;
    if (b.costInBase == null) return -1;
    return a.costInBase - b.costInBase;
  });

  const first = ranked.find((offer) => offer.costInBase != null);
  if (first) first.cheapest = true;

  return ranked;
}

/**
 * True when every offer still waiting is the same person quoting the same
 * price.
 *
 * The common shape of this queue, and the one worth naming. A reseller
 * mails the same list every fortnight, each reply is read, and six weeks
 * later a domain sits here with seven drafts on it that are all one offer
 * repeated. There is nothing to choose between them - approving any of them
 * produces the same listing - and reading seven rows to discover that is the
 * work this says can be skipped.
 *
 * Only pending offers count. An approved one is a listing already; what is
 * being asked is whether the drafts still waiting say anything new.
 *
 * Deliberately strict. Two addresses at one company are not the same person,
 * and two prices a pound apart are still a choice, so anything but an exact
 * repeat falls through to the ordinary comparison.
 */
export function offersAgree(ranked: RankedOffer[]): boolean {
  const waiting = ranked.filter((offer) => offer.status === 'pending');
  if (waiting.length < 2) return false;

  const first = waiting[0] as RankedOffer;
  const address = (offer: RankedOffer) => offer.fromAddress.trim().toLowerCase();
  const money = (offer: RankedOffer) => `${offer.cost ?? ''}|${(offer.currency ?? '').toUpperCase()}`;

  return waiting.every((offer) => address(offer) === address(first) && money(offer) === money(first));
}

/**
 * What to say about a set of offers, if anything.
 *
 * Null when there is nothing worth saying - one offer, or several that agree.
 * The interesting case is when the cheapest is not the one writing from the
 * site's own domain, because that is when the two signals disagree and a
 * person has to decide which they trust.
 */
export function offersNote(ranked: RankedOffer[]): string | null {
  if (ranked.length < 2) return null;

  const cheapest = ranked.find((offer) => offer.cheapest);
  const owner = ranked.find((offer) => offer.signal === 'owner-match');

  if (!cheapest) return 'Neither offer could be converted, so they cannot be compared on price.';
  if (owner && owner.draftId !== cheapest.draftId) {
    return 'The cheapest offer is not the one writing from the site’s own domain. A reseller with a bulk deal can undercut the owner - or the owner may not know their site is being sold.';
  }
  if (owner) return 'The cheapest offer is also the one writing from the site’s own domain.';
  return 'None of these write from the site’s own domain, so they are all likely resellers.';
}
