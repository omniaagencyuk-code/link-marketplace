import { nicheName } from '@/lib/data/categories';
import { countryName } from '@/lib/data/countries';
import { linkTypeLabels } from '@/lib/utils/labels';
import { acceptedNicheLabel } from '@/lib/config/accepted-niches';
import type { Website } from '@/lib/types';

/**
 * What a listing's overview panel says when nobody has written one.
 *
 * Listings arrive from a CSV or from a publisher's reply and neither carries an
 * editorial write-up, so "Website Overview" was a heading with nothing under it
 * across the marketplace.
 *
 * It leads with what the publication is about, because that is what somebody
 * opening a listing wants and it is what the panel is called. Then the terms a
 * placement is sold on, then the topics the publisher has agreed to carry.
 *
 * ## What it takes from a default and what it will not
 *
 * The word count, link count, link attribute and sponsored-label policy are
 * `emptyRules()` defaults on an imported listing - nothing distinguishes them
 * from a publisher having stated them. They are printed anyway, because they
 * are the standard terms we sell on and hold a publisher to unless their own
 * email said otherwise, at which point extraction overwrites them. That is a
 * decision about the business, not about the data.
 *
 * Two things are still left out, and for a different reason in each case.
 *
 * The country, where it came from the old marketplace-wide 'GB' default:
 * `country` is undefined for those, so a listing nobody has placed says nothing
 * about where it is read rather than claiming Britain.
 *
 * Domain rating, traffic and referring domains: they change on every Ahrefs
 * refresh, so prose quoting them is wrong within a week while reading as
 * authoritative. The panel directly below renders them live.
 */

function sentenceList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

/**
 * What the publication is about.
 *
 * `description` is the publisher's own line where the import carried one, and
 * it is the only field here that says anything specific about the site - so it
 * leads when it exists. Without it there is the category and the market, which
 * is thin but true; nothing is guessed from the domain name.
 */
function subject(website: Website): string {
  const described = (website.description ?? '').trim();
  const niche = nicheName(website.niche).toLowerCase();

  const secondary = (website.secondaryNiches ?? []).filter(Boolean);
  const also =
    secondary.length > 0
      ? ` It also covers ${sentenceList(secondary.map((slug) => nicheName(slug).toLowerCase()))}.`
      : '';

  const where = website.country ? ` Its readership is mainly in ${countryName(website.country)}.` : '';

  if (described) {
    const stop = /[.!?]$/.test(described) ? '' : '.';
    return `${described}${stop}${also}${where}`;
  }

  return `${website.domain} is a ${niche} publication.${also}${where}`;
}

/** What can be bought, and how long it takes. */
function placements(website: Website): string {
  const available = (website.services ?? []).filter((service) => service.available);
  if (available.length === 0) return '';

  // Plural: a publisher offers guest posts rather than guest post.
  const kinds = sentenceList(
    available.map((service) => `${(linkTypeLabels[service.type] ?? service.type).toLowerCase()}s`),
  );

  const windows = available
    .map((service) => [service.turnaroundMinDays, service.turnaroundMaxDays] as const)
    .filter(([min, max]) => min > 0 && max > 0);

  // Zero means nobody stated one, so none is invented.
  const turnaround = windows.length
    ? ` Turnaround is typically ${Math.min(...windows.map(([min]) => min))} to ${Math.max(
        ...windows.map(([, max]) => max),
      )} working days from approval.`
    : '';

  return `This publisher offers ${kinds}.${turnaround}`;
}

/** The terms a placement is sold on. */
function terms(website: Website): string {
  const { rules } = website;
  const said: string[] = [];

  const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
  const count = WORDS[rules.maxLinks] ?? String(rules.maxLinks);
  const links = rules.maxLinks > 0
    ? ` with up to ${count} ${rules.maxLinks === 1 ? 'link' : 'links'}`
    : '';
  if (rules.minWordCount > 0 && rules.maxWordCount > 0) {
    said.push(`articles run ${rules.minWordCount} to ${rules.maxWordCount} words${links}`);
  } else if (links) {
    said.push(`articles take${links}`);
  }
  if (rules.linkAttribute) said.push(`links are ${rules.linkAttribute}`);
  if (rules.sponsoredTag === 'always') said.push('posts carry a sponsored label');
  if (rules.sponsoredTag === 'never') said.push('posts carry no sponsored label');
  if (rules.sponsoredTag === 'on-request') said.push('a sponsored label is applied on request');

  if (rules.contentProvidedBy === 'publisher') said.push('the publisher writes the article');
  if (rules.contentProvidedBy === 'buyer') said.push('the article is supplied by the buyer');
  if (rules.contentProvidedBy === 'either') said.push('you can supply the article or have it written');

  if (said.length === 0) return '';

  const first = `${said[0]!.charAt(0).toUpperCase()}${said[0]!.slice(1)}`;
  return said.length === 1 ? `${first}.` : `${first}, ${sentenceList(said.slice(1))}.`;
}

/**
 * Only what the publisher has actually agreed to carry.
 *
 * A colon list with the labels exactly as the rules panel writes them: several
 * contain "and" - "Gambling and iGaming", "Crypto and web3" - so an ordinary
 * list reads as four topics rather than two however it is punctuated.
 *
 * Silence is neither. A publisher who has never mentioned gambling has not
 * agreed to carry it and has not refused it, so nothing is said about the
 * topics they did not raise - the rule extraction follows, for the same reason.
 */
function topics(website: Website): string {
  const accepted = (website.rules.acceptedNiches ?? []).filter(Boolean);
  const restricted = (website.rules.restrictedNiches ?? []).filter(Boolean);

  const lines: string[] = [];
  if (accepted.length > 0) {
    lines.push(`Topics this publisher has agreed to carry: ${accepted.map(acceptedNicheLabel).join(', ')}.`);
  }
  if (restricted.length > 0) {
    lines.push(`It has said it will not take: ${restricted.join(', ')}.`);
  }
  return lines.join(' ');
}

/**
 * The listing's overview: what was written, or what the record supports.
 *
 * Derived rather than stored, so an overview an administrator writes always
 * wins and a listing whose facts change gets a description that changed with
 * them. Paragraphs join the way the panel splits them.
 */
export function websiteOverview(website: Website): string {
  if ((website.overview ?? '').trim()) return website.overview;

  return [subject(website), placements(website), terms(website), topics(website)]
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .join('\n\n');
}
