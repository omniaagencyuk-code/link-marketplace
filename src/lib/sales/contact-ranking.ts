import type { HunterPerson } from './hunter-client';

/**
 * Who to write to, out of everyone Hunter found.
 *
 * Pure: people in, one of them out, with the reason. No network and no
 * database, so the ranking can be checked against the shapes Hunter really
 * returns - including the ones where it returns almost nothing.
 *
 * ## Why this is a ranking and not "take the first"
 *
 * Hunter returns whoever it has, in no useful order. At a forty-person agency
 * that is often a developer, an accounts address and the head of SEO, and only
 * one of those three will read an email about buying placements. Writing to
 * the wrong one does not get forwarded - it gets deleted, and the company is
 * then burned for a month because the next email looks like a follow-up to
 * something nobody read.
 */

export interface RankedContact {
  person: HunterPerson;
  score: number;
  /** One line, for the panel, so a choice can be overruled on its merits. */
  reason: string;
}

/**
 * Roles that cannot be the right recipient, checked first.
 *
 * Checked first, and that ordering is the whole point rather than a detail.
 * `verify:sales` caught the reason: "Talent Acquisition" matched the marketing
 * pattern on the word "Acquisition" and a recruiter outranked an engineer. A
 * title that names a disqualifying function is disqualified whatever else it
 * also says, because the person reading that mailbox has a job and it is not
 * buying placements.
 *
 * Support, billing and recruitment are read by people whose job is to route
 * mail elsewhere. A sales address is read by somebody trying to sell to us.
 */
const DISQUALIFYING_ROLES: { pattern: RegExp; weight: number; why: string }[] = [
  { pattern: /\b(support|helpdesk|customer (service|success))\b/i, weight: -25, why: 'a support desk' },
  { pattern: /\b(billing|accounts payable|invoic|bookkeep)\b/i, weight: -25, why: 'an accounts desk' },
  { pattern: /\b(recruit|talent|hr|human resources)\b/i, weight: -25, why: 'recruitment' },
  { pattern: /\b(sales|business development|bdm?)\b/i, weight: -15, why: 'sells to us, not buys' },
  { pattern: /\b(developer|engineer|devops|designer|qa)\b/i, weight: -12, why: 'not a buyer' },
];

/**
 * Roles that decide this.
 *
 * Marketing, SEO and growth own the budget this is spent from; a founder at a
 * small company is the budget.
 */
const QUALIFYING_ROLES: { pattern: RegExp; weight: number; why: string }[] = [
  { pattern: /\b(seo|search)\b/i, weight: 30, why: 'owns SEO' },
  { pattern: /\b(link|outreach)\b/i, weight: 30, why: 'owns outreach' },
  { pattern: /\b(marketing|growth|demand gen|acquisition)\b/i, weight: 24, why: 'owns marketing' },
  { pattern: /\b(content|editorial)\b/i, weight: 22, why: 'owns content' },
  { pattern: /\b(founder|owner|ceo|director|principal|head)\b/i, weight: 20, why: 'decides' },
  { pattern: /\b(digital|pr|communications)\b/i, weight: 16, why: 'adjacent to this' },
  { pattern: /\b(account manager|client services)\b/i, weight: 8, why: 'client-facing' },
];

/**
 * Addresses nobody reads as a person.
 *
 * A role address is read by whoever is on rota, and an email to one is an
 * email to a queue. It is not disqualifying - at a two-person affiliate
 * `hello@` is the only address there is - but it loses to a named person every
 * time.
 */
const ROLE_MAILBOXES = [
  'info',
  'hello',
  'contact',
  'enquiries',
  'enquiry',
  'admin',
  'office',
  'team',
  'mail',
  'sales',
  'support',
  'help',
  'billing',
  'accounts',
  'noreply',
  'no-reply',
  'postmaster',
  'webmaster',
  'privacy',
  'legal',
  'jobs',
  'careers',
  'press',
];

export function rankContacts(people: HunterPerson[]): RankedContact[] {
  return people
    .map((person) => {
      const parts: string[] = [];
      let score = 0;

      const title = person.position ?? '';

      /*
        Disqualifiers first, and only one match either way.

        A "Head of SEO and Content" is one person, not two reasons' worth of
        score. And a title that names a disqualifying function does not get to
        earn points from another word in it: that was the bug - "Talent
        Acquisition" scoring as marketing.
      */
      const blocked = DISQUALIFYING_ROLES.find((entry) => entry.pattern.test(title));
      if (blocked) {
        score += blocked.weight;
        parts.push(blocked.why);
      } else {
        const wanted = QUALIFYING_ROLES.find((entry) => entry.pattern.test(title));
        if (wanted) {
          score += wanted.weight;
          parts.push(wanted.why);
        }
      }

      if (!title) parts.push('no job title');

      /*
        Hunter's confidence, and the gap between unverified and unknown.

        Undefined is not zero. Plenty of real addresses come back unscored,
        and treating that as a zero-confidence address would rank a scored
        role mailbox above an unscored named person - which is the wrong way
        round, because the name is the stronger signal.
      */
      if (typeof person.confidence === 'number') {
        score += Math.round((person.confidence / 100) * 25);
        if (person.confidence >= 90) parts.push('high confidence');
        else if (person.confidence < 50) parts.push('low confidence');
      } else {
        score += 10;
        parts.push('unscored');
      }

      /*
        `accept_all` is not verified.

        A catch-all domain accepts mail for addresses that belong to nobody, so
        a lookup there tells us nothing about whether this person exists. It
        must not rank alongside a genuinely verified address: the bounces land
        on our sending reputation, and a provider that decides we are a spam
        source stops delivering the orders too.
      */
      if (person.verification === 'valid') {
        score += 20;
        parts.push('verified');
      } else if (person.verification === 'invalid') {
        score -= 60;
        parts.push('verified as invalid');
      } else if (person.verification === 'accept_all') {
        parts.push('catch-all domain, unverifiable');
      } else if (person.verification === 'disposable') {
        score -= 60;
        parts.push('a disposable address');
      }

      const mailbox = person.email.split('@')[0]?.toLowerCase() ?? '';
      const isRole = ROLE_MAILBOXES.some(
        (name) => mailbox === name || mailbox.startsWith(`${name}.`) || mailbox.startsWith(`${name}-`),
      );
      if (isRole) {
        score -= 18;
        parts.push('a role address, not a person');
      } else if (person.firstName) {
        score += 10;
        parts.push('a named person');
      }

      return {
        person,
        score,
        reason: parts.length > 0 ? parts.join(', ') : 'nothing to go on',
      };
    })
    .sort((a, b) => b.score - a.score || a.person.email.localeCompare(b.person.email));
}

/**
 * The one to write to, or nobody.
 *
 * Returns nothing rather than the least-bad option in two cases, and both are
 * deliberate. An address Hunter verified as invalid or disposable will bounce,
 * and a bounce costs sending reputation that is shared with every order
 * confirmation we send. An empty list is an honest "we could not reach them",
 * which a human can act on; a guess is a bounce nobody chose.
 */
export function bestContact(people: HunterPerson[]): RankedContact | null {
  const ranked = rankContacts(people).filter(
    (entry) =>
      entry.person.verification !== 'invalid' && entry.person.verification !== 'disposable',
  );

  return ranked[0] ?? null;
}
