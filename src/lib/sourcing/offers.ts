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

/**
 * How much cheaper an undercut may be before a person has to look at it.
 *
 * A seller who already quoted us 400 EUR and now says 350 is negotiating. One
 * who says 4 has almost certainly not: a ten-post package read as a single
 * placement, a DKK figure tagged EUR, a "from" teaser rate. The difference
 * matters because an undercut is approved without anybody reading it, and the
 * number it writes is what we think the placement costs - we either honour a
 * margin built on it or go back to the publisher and retract.
 *
 * A tenth is the line. Below it the draft goes to a person instead, which
 * costs one card on the duplicates page; above it, a genuine renegotiation
 * (half price is a good one) still goes through on its own.
 */
export const UNDERCUT_FLOOR = 0.1;

/**
 * Which seller an offer is from, for deciding whether two offers are one
 * seller quoting twice.
 *
 * The domain after the `@`, because that is what identifies the business:
 * `info@holdsport.dk` and `frank@holdsport.dk` are two people at one company
 * reading from one rate card, and treating them as rival offers is how a
 * domain comes to sit in the duplicates queue with four rows that say the
 * same thing.
 *
 * Two exceptions, both of which would otherwise delete a real offer:
 *
 * - **A free provider is not a company.** `joe@gmail.com` and
 *   `sara@gmail.com` are two unrelated sellers who happen to share a mail
 *   host, and collapsing them would throw away one of two genuine competing
 *   prices. For those the whole address is the key, so only the identical
 *   address counts as a repeat.
 * - **No address is not a shared address.** A draft whose email we never
 *   recorded gets a key of its own and groups with nothing, rather than every
 *   such draft collapsing into one.
 *
 * Exact on the host, deliberately. `holdsport.dk` and `mail.holdsport.dk` are
 * near certainly the same company, but near certainly is the wrong standard
 * for an operation whose failure mode is silently binning a cheaper quote.
 */
export function sellerKey(offer: { draftId: string; fromAddress: string }): string {
  const address = offer.fromAddress.trim().toLowerCase();
  const host = senderDomain(address);
  if (!address || !host) return `draft:${offer.draftId}`;
  if (FREE_EMAIL.has(host)) return `address:${address}`;
  return `domain:${host}`;
}

export type RepeatVerdict =
  /** Delete it. The same seller already offers this site at this price or less. */
  | { draftId: string; verdict: 'redundant'; because: string }
  /** Approve it. The same seller now wants less than we are recorded as paying. */
  | { draftId: string; verdict: 'undercuts'; because: string }
  /** Leave it for a person. */
  | { draftId: string; verdict: 'decide'; because: string };

/**
 * One seller quoting the same site twice is not a decision.
 *
 * Most of the duplicates queue is not two publishers competing. It is one
 * reseller mailing the same list every fortnight, every reply read, every
 * reading producing another draft - so a domain accumulates four rows at one
 * price from one company and somebody has to open all four to find that out.
 * Those rows are not information and nobody should be reading them.
 *
 * Per seller, then, rather than per draft: keep the cheapest offer that can
 * be compared, and say what the rest are.
 *
 * - **`redundant`** - a repeat. The same seller's cheapest is already here, or
 *   already approved, at this price or less. Nothing it could tell us is new,
 *   so it is deleted. The email stays, as always, so the reply can be read
 *   again.
 * - **`undercuts`** - the same seller now wants strictly less than the offer
 *   of theirs we already approved. That is the one case worth acting on
 *   without being asked, because the answer is never "no": we are being
 *   offered the same placement by the same company for less money.
 * - **`decide`** - everything else. A seller we have not heard from before on
 *   this domain, a price neither side can convert, or an undercut steep enough
 *   to look like a misreading.
 *
 * What is NOT collapsed is the point of the function as much as what is. Two
 * different sellers remain two offers however alike their prices, because
 * choosing between them is the decision this queue exists for.
 *
 * Pure. It is handed every offer on one domain and returns a verdict for each
 * one still pending; nothing is read or written here.
 */
export function resolveRepeats(offers: RankedOffer[]): RepeatVerdict[] {
  const bySeller = new Map<string, RankedOffer[]>();
  for (const offer of offers) {
    const key = sellerKey(offer);
    bySeller.set(key, [...(bySeller.get(key) ?? []), offer]);
  }

  const verdicts: RepeatVerdict[] = [];

  for (const group of bySeller.values()) {
    /*
      What this seller already has on the site.

      Anything not pending has been through `approveDraft`, so its price and
      contact are on the listing - that is what an undercut undercuts. The
      cheapest of them, because approving twice leaves two, and the live
      number is the lower one only if the later approval was lower. Taking the
      cheapest is the conservative read: it makes an undercut harder to claim,
      never easier.
    */
    const held = group
      .filter((offer) => offer.status !== 'pending' && offer.costInBase != null)
      .sort((a, b) => (a.costInBase as number) - (b.costInBase as number));
    const incumbent = held[0] ?? null;

    const waiting = group.filter((offer) => offer.status === 'pending');

    /*
      A price we cannot convert is never redundant.

      It might be the cheaper quote we were hoping for, read from an email
      that said a number without saying in what. Deleting it on the grounds
      that it is not cheaper assumes the thing we just said we cannot know, so
      it goes to a person instead. Rare enough to be free: two drafts in a
      backlog of seven thousand.
    */
    for (const offer of waiting.filter((o) => o.costInBase == null)) {
      verdicts.push({
        draftId: offer.draftId,
        verdict: 'decide',
        because: 'this price cannot be converted, so it cannot be compared with the others',
      });
    }

    const comparable = waiting
      .filter((offer) => offer.costInBase != null)
      .sort((a, b) => (a.costInBase as number) - (b.costInBase as number));

    const best = comparable[0];
    if (!best) continue;

    // Every other copy from this seller, whatever happens to the cheapest.
    // They are dearer than one we are keeping and from the same company.
    for (const offer of comparable.slice(1)) {
      verdicts.push({
        draftId: offer.draftId,
        verdict: 'redundant',
        because: `the same seller offers ${offer.domain} at the same price or less on another draft`,
      });
    }

    if (!incumbent) {
      verdicts.push({
        draftId: best.draftId,
        verdict: 'decide',
        because: 'the cheapest offer from a seller we have not already approved for this site',
      });
      continue;
    }

    const now = best.costInBase as number;
    const before = incumbent.costInBase as number;

    if (now >= before) {
      verdicts.push({
        draftId: best.draftId,
        verdict: 'redundant',
        because: `the same seller is already approved for ${best.domain} at this price or less`,
      });
      continue;
    }

    if (now < before * UNDERCUT_FLOOR) {
      verdicts.push({
        draftId: best.draftId,
        verdict: 'decide',
        because: `the same seller now wants under a tenth of the approved price for ${best.domain}, which is more likely a misreading than a discount`,
      });
      continue;
    }

    verdicts.push({
      draftId: best.draftId,
      verdict: 'undercuts',
      because: `the same seller now wants less for ${best.domain} than the offer of theirs we approved`,
    });
  }

  return verdicts;
}
