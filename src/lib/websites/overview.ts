import { nicheName } from '@/lib/data/categories';
import { countryName } from '@/lib/data/countries';
import { linkTypeLabels } from '@/lib/utils/labels';
import { acceptedNicheLabel } from '@/lib/config/accepted-niches';
import type { Website } from '@/lib/types';

/**
 * What we can honestly say about a listing nobody has written up.
 *
 * Almost every listing arrived from a CSV or from a publisher's reply, and
 * neither carries an editorial overview - so the "Website Overview" panel on
 * the listing page was a heading with nothing under it for the whole
 * marketplace.
 *
 * Three rules, and the second is the one that cut this down to half its first
 * draft:
 *
 * Nothing is invented. The seeded demo overview asserts a site has "been part
 * of the network since 2024" and that "all placements are permanent with no
 * yearly renewal fee". Fine for fabricated demo rows, false claims on a real
 * publisher - permanence is a term we record per publisher and frequently
 * record as something else.
 *
 * Nothing that is only a default. This is the trap, and it is the same one the
 * country column had: `emptyRules()` creates every imported listing with
 * 800-1600 words, one link, `dofollow`, no sponsored label and "either" for who
 * writes it. None of that came from a publisher. The first version of this file
 * read those fields and would have written "links are dofollow" onto seventeen
 * hundred listings on the strength of a default - which is the single claim in
 * this marketplace a buyer is actually paying for. So the word counts, the link
 * count, the link attribute, the sponsored-label policy, who supplies the
 * article and the language are all absent below, and will stay absent until
 * they are recorded rather than defaulted.
 *
 * Nothing that moves. Domain rating, traffic and referring domains are the most
 * quotable numbers we hold and are not written into the prose: they change on
 * every Ahrefs refresh, and text quoting them would be wrong within a week
 * while looking authoritative. The panel directly below renders them live.
 *
 * Used as a fallback rather than written into the column, so an overview an
 * administrator writes by hand always wins, and a listing whose facts change
 * gets a description that changed with them.
 */

/**
 * A readable list.
 *
 * Semicolons when an item already contains "and", because several niche labels
 * do - "Gambling and iGaming", "Crypto and web3" - and the obvious join
 * produced "gambling and igaming and crypto and web3", which reads as four
 * topics rather than two.
 */
function sentenceList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  const joint = items.some((item) => / and /.test(item)) ? '; ' : ', ';
  const last = items.some((item) => / and /.test(item)) ? '; and ' : ' and ';
  return `${items.slice(0, -1).join(joint)}${last}${items.at(-1)}`;
}

/** What the publication is and who reads it. */
function identity(website: Website): string {
  const parts: string[] = [`${website.domain} is a ${nicheName(website.niche).toLowerCase()} publication`];

  const secondary = website.secondaryNiches.filter(Boolean);
  if (secondary.length > 0) {
    parts.push(`that also covers ${sentenceList(secondary.map((slug) => nicheName(slug).toLowerCase()))}`);
  }

  /*
    The country is the one of these that is now trustworthy: `country` is
    undefined when its source is the old default, so a listing nobody has
    placed says nothing about where it is read rather than claiming Britain.

    The language is not. Every imported listing was created `en` whether or not
    anybody said so, so it is left out on the same grounds as the link rules.
  */
  const where = website.country ? ` Its audience is primarily in ${countryName(website.country)}.` : '';

  return `${parts.join(' ')}.${where}`;
}

/** What you can buy, and how long it takes. */
function placements(website: Website): string {
  const available = website.services.filter((service) => service.available);
  if (available.length === 0) return '';

  // Plural, because a publisher offers guest posts rather than guest post.
  const kinds = sentenceList(
    available.map((service) => `${(linkTypeLabels[service.type] ?? service.type).toLowerCase()}s`),
  );

  const windows = available
    .map((service) => [service.turnaroundMinDays, service.turnaroundMaxDays] as const)
    .filter(([min, max]) => min > 0 && max > 0);

  const turnaround = windows.length
    ? ` Turnaround is typically ${Math.min(...windows.map(([min]) => min))} to ${Math.max(
        ...windows.map(([, max]) => max),
      )} working days from approval.`
    : '';

  // `contentProvidedBy` defaults to 'either' on every import, so who writes the
  // article is not stated here. It is on the listing's own rules panel, where a
  // buyer can see it is a default rather than read it as a promise.
  return `This publisher offers ${kinds}.${turnaround}`;
}

/** Only what the publisher has actually agreed to carry. */
function topics(website: Website): string {
  const accepted = website.rules.acceptedNiches.filter(Boolean);
  const restricted = website.rules.restrictedNiches.filter(Boolean);

  /*
    A colon and commas, with the labels left as they are written.

    Several of them contain "and" - "Gambling and iGaming", "Crypto and web3" -
    so an ordinary list reads as four topics rather than two however it is
    punctuated. A colon makes the boundary unambiguous without rewriting the
    labels, which have to keep matching the ones on the rules panel below.
  */
  const lines: string[] = [];
  if (accepted.length > 0) {
    lines.push(`Topics this publisher has agreed to carry: ${accepted.map(acceptedNicheLabel).join(', ')}.`);
  }
  if (restricted.length > 0) {
    lines.push(`It has said it will not take: ${restricted.join(', ')}.`);
  }

  /*
    Silence is not a refusal and is not an acceptance.

    A publisher who has never mentioned gambling has neither agreed to carry it
    nor refused it, so nothing is said about the topics they did not raise -
    the same rule the extraction follows, for the same reason.
  */
  return lines.join(' ');
}

/**
 * The listing's overview: what was written, or what the record supports.
 *
 * Paragraphs are joined the way the panel splits them, so a hand-written
 * overview and a derived one render identically.
 */
export function websiteOverview(website: Website): string {
  if (website.overview.trim()) return website.overview;

  return [identity(website), placements(website), topics(website)]
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .join('\n\n');
}
