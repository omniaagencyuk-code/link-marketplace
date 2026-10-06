import { segmentDefinition } from '@/lib/config/sales-segments';
import type { MatchedListing, QualificationReason, SalesSegment } from '@/lib/types/sales';
import { brand } from '@/lib/config/brand';

/**
 * The rules the model follows when writing an outbound email.
 *
 * **This file is the prompt.** One copy, for the reason AGENTS.md gives about
 * `extraction-rules.ts`: rules kept in code and in a document drift within a
 * month, and the stale copy is the one somebody reads. Change them here and
 * bump `EMAIL_PROMPT_VERSION` in the same edit - every draft records the
 * version it was written under, so when a line turns out to be wrong the
 * emails sent under it can be found.
 *
 * The rules that matter here are not about tone. They are:
 *
 * - **Every number comes from the data given.** The prices, the DRs, the
 *   traffic and the counts are passed in from our own inventory. A model that
 *   invents "DR 70+ sites from £99" has written a quote we have to honour or
 *   refuse, and both are worse than sending nothing.
 *
 * - **Every claim about them comes from a quote.** The qualification carries
 *   the sentences their own site said. An email may refer to those and to
 *   nothing else about them - no guesses about their clients, their traffic or
 *   their problems.
 *
 * - **No pressure, no fake familiarity, no invented history.** "Following up
 *   on our last conversation" when there was none is a lie, and it is the
 *   single fastest way to make a company tell their filter about us.
 */

export const EMAIL_PROMPT_VERSION = 'sales-email-1';

export const EMAIL_RULES = `
You write one short outbound email from ${brand.name}, a marketplace that sells
guest post and link placements on real publisher websites.

You are writing to one person at one company, for the first time unless you are
told otherwise. The email has to be worth the thirty seconds it takes to read.

# The absolute rules

**Every number you write must be one you were given.** Prices, domain ratings,
traffic figures and inventory counts are supplied to you from our own database.
Do not round them, do not add to them, do not write "from £99" because it reads
better, and do not describe a range you were not given. A price in this email
is a price we have to honour.

**Every claim about their company must rest on a quote you were given.** You
will be given sentences taken from their own website. You may refer to what
those say. You may not guess at their clients, their rankings, their traffic,
their team size, their budget or their problems. If you were given no quotes,
write an email that does not characterise them at all - that is a perfectly good
email, and an invented one is not.

**Never imply a history that does not exist.** No "following up", no "as
discussed", no "thanks for your time last week", no "I noticed you downloaded".
If this is a follow-up you will be told which step it is and what the previous
email said.

**Never mention where their email address came from.** It is true and it is
irrelevant, and saying it makes the email about us.

# Shape

Subject: under 55 characters, lower case except names, no colons, no "Re:", no
emoji, nothing that reads like a newsletter. It should look like a line a person
typed.

Body: 70 to 130 words. Plain text. Short paragraphs, one blank line between
them. No greeting flourishes, no "I hope this email finds you well", no bullet
lists of benefits, no postscript.

Structure that works:
  1. One line that says why them, grounded in a quote if you have one.
  2. One or two lines of what we have, using the real listings given.
  3. One question that is easy to answer.

Sign off with just the sender's first name - it will be appended; do not write
a signature, a company footer, or an unsubscribe line. Those are added after
you.

# The ask

One question, answerable in a sentence. "Worth a look?" or "want the list for
your niche?" or "which niches are you buying in at the moment?".

Never ask for a call, a demo, a meeting or fifteen minutes. Never give two
options. Never ask them to click anything.

# Tone

Write like one practitioner to another. They know what a backlink is; do not
explain SEO to an SEO agency.

Do not use: "I hope this finds you well", "reach out", "circle back", "leverage",
"synergy", "game-changer", "solution", "unlock", "supercharge", "in today's
digital landscape", "as you know", "I'd love to". No exclamation marks.

Do not flatter. "Your blog is amazing" from a stranger is read as a template,
because it is one.

# What you must not do

Do not write anything about them you cannot point at a quote for.
Do not write a number you were not given.
Do not claim a result, a case study, a client or a guarantee you were not given.
Do not write more than one question.
Do not write a subject line that promises something the body does not deliver.
`.trim();

export interface EmailBrief {
  companyName: string;
  domain: string;
  segment: SalesSegment;
  /** Their own words, already verified as real quotes. */
  quotes: QualificationReason[];
  /** Real listings from our inventory, with real prices. */
  listings: MatchedListing[];
  inventory?: { count: number; minDr: number; maxDr: number; fromPriceMinor: number };
  contactFirstName?: string;
  contactRole?: string;
  senderFirstName: string;
  /** Guidance from the campaign, where there is one. */
  angle?: string;
  stepNumber: number;
  /** What the previous email said, so a follow-up does not repeat it. */
  previousSubject?: string;
  previousBody?: string;
}

const money = (minor: number) =>
  `£${(minor / 100).toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;

/**
 * The brief, as a user turn.
 *
 * Volatile content after the rules, never before: the rules are a cached
 * system block of identical tokens on every call, and anything changing placed
 * ahead of them throws that cache away on every prospect.
 *
 * Prices are formatted here rather than passed as minor units. A model handed
 * `22000` will sometimes write "£22,000" - which is not a rounding error, it
 * is a quote a hundred times too high in an email somebody might accept.
 */
export function buildEmailBrief(brief: EmailBrief): string {
  const lines: string[] = [];

  lines.push(`# Who you are writing to`);
  lines.push('');
  lines.push(`Company: ${brief.companyName} (${brief.domain})`);
  lines.push(`They are: ${segmentDefinition(brief.segment).label}`);
  if (brief.contactFirstName) lines.push(`Person: ${brief.contactFirstName}`);
  if (brief.contactRole) lines.push(`Their role: ${brief.contactRole}`);
  lines.push(`You are: ${brief.senderFirstName}`);
  lines.push('');

  lines.push('# What we know they said, in their own words');
  lines.push('');
  if (brief.quotes.length > 0) {
    for (const quote of brief.quotes) {
      lines.push(`- "${quote.quote}" (${quote.claim})`);
    }
  } else {
    lines.push(
      'Nothing. Their website said nothing we can quote, so write an email that does not',
    );
    lines.push('characterise them at all. Do not invent a reason for writing to them.');
  }
  lines.push('');

  lines.push('# What we actually have for them');
  lines.push('');
  if (brief.inventory) {
    lines.push(
      `${brief.inventory.count} priced listings fit their niche, DR ${brief.inventory.minDr} to ` +
        `${brief.inventory.maxDr}, from ${money(brief.inventory.fromPriceMinor)}.`,
    );
    lines.push('');
  }
  if (brief.listings.length > 0) {
    lines.push('Specific listings you may name, with their real figures:');
    for (const listing of brief.listings) {
      lines.push(
        `- ${listing.domain} - DR ${listing.domainRating}, ` +
          `${listing.organicTraffic.toLocaleString('en-GB')} monthly organic visits, ` +
          `${money(listing.priceMinor)}`,
      );
    }
  } else {
    lines.push(
      'No specific listing fits their niche closely enough to name. Do not name one, and do',
    );
    lines.push('not describe our inventory in figures you were not given above.');
  }
  lines.push('');

  if (brief.angle) {
    lines.push('# What tends to matter to this kind of buyer');
    lines.push('');
    lines.push(brief.angle);
    lines.push('');
  }

  if (brief.stepNumber > 1) {
    lines.push(`# This is follow-up number ${brief.stepNumber - 1}`);
    lines.push('');
    lines.push(
      'They did not reply to the previous email. Do not repeat it, do not ask whether they',
    );
    lines.push(
      'saw it, and do not apologise for writing again. Say one new thing and ask one',
    );
    lines.push('easier question. Shorter than the first - 40 to 80 words.');
    lines.push('');
    if (brief.previousSubject) lines.push(`Previous subject: ${brief.previousSubject}`);
    if (brief.previousBody) {
      lines.push('Previous body:');
      lines.push(brief.previousBody);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Checks a draft before a human is asked to read it.
 *
 * Not a style guard - a factual one. The model has been told every number must
 * be one it was given, and this is where that is enforced rather than
 * requested: any money figure in the draft that does not appear in the brief
 * is a price we never quoted, and a draft carrying one is held back instead of
 * joining a review queue where it reads like all the others.
 *
 * Pure, so each rule can be checked against the draft that triggers it.
 */
export interface DraftProblem {
  kind: 'invented-price' | 'invented-history' | 'too-long' | 'too-short' | 'no-question' | 'banned-phrase';
  detail: string;
}

/** Phrases that are a lie rather than a cliché. */
const FABRICATED_HISTORY = [
  /\bfollowing up on (our|the|my) (last|previous|recent)\b/i,
  /\bas (discussed|promised|agreed)\b/i,
  /\bthanks for (your time|the chat|speaking)\b/i,
  /\bgreat (speaking|talking|meeting) (with )?you\b/i,
  /\bsince we (last )?(spoke|talked|met)\b/i,
  /\byou (downloaded|signed up|requested|enquired)\b/i,
];

export function checkDraft(
  draft: { subject: string; body: string },
  brief: EmailBrief,
): DraftProblem[] {
  const problems: DraftProblem[] = [];

  /*
    Every money figure in the draft has to be one we supplied.

    Normalised to pence before comparing, so £220 and £220.00 are the same
    number and "£22,000" is not. This is the rule that stops an email quoting a
    price nobody set - which we would then have to honour or retract, and both
    cost more than the email was worth.
  */
  const allowed = new Set<number>();
  for (const listing of brief.listings) allowed.add(listing.priceMinor);
  if (brief.inventory) {
    allowed.add(brief.inventory.fromPriceMinor);
    // The DR range is numbers too, but a DR is not money and is checked below.
  }

  const text = `${draft.subject}\n${draft.body}`;

  for (const match of text.matchAll(/£\s?([\d,]+(?:\.\d{1,2})?)/g)) {
    const figure = Number(match[1]!.replace(/,/g, ''));
    if (!Number.isFinite(figure)) continue;
    const minor = Math.round(figure * 100);
    if (!allowed.has(minor)) {
      problems.push({
        kind: 'invented-price',
        detail: `The draft says ${match[0]}, which is not a price it was given.`,
      });
    }
  }

  // Domain ratings, same rule. "DR 70+" when the brief said DR 61 is a claim
  // about inventory we do not have.
  const allowedDr = new Set<number>(brief.listings.map((listing) => listing.domainRating));
  if (brief.inventory) {
    allowedDr.add(brief.inventory.minDr);
    allowedDr.add(brief.inventory.maxDr);
  }
  for (const match of text.matchAll(/\bDR\s?(\d{1,2})\b/gi)) {
    const value = Number(match[1]);
    if (!allowedDr.has(value)) {
      problems.push({
        kind: 'invented-price',
        detail: `The draft says DR ${value}, which is not a figure it was given.`,
      });
    }
  }

  for (const pattern of FABRICATED_HISTORY) {
    const found = text.match(pattern);
    if (found) {
      problems.push({
        kind: 'invented-history',
        detail: `"${found[0]}" implies a conversation that did not happen.`,
      });
    }
  }

  const words = draft.body.trim().split(/\s+/).filter(Boolean).length;
  if (words > 190) {
    problems.push({ kind: 'too-long', detail: `${words} words. Nobody reads that from a stranger.` });
  }
  if (words < 25) {
    problems.push({ kind: 'too-short', detail: `${words} words. Too little to act on.` });
  }

  if (!draft.body.includes('?')) {
    problems.push({ kind: 'no-question', detail: 'There is nothing for them to answer.' });
  }

  const banned = ['i hope this email finds you well', 'circle back', 'game-changer', 'supercharge'];
  for (const phrase of banned) {
    if (text.toLowerCase().includes(phrase)) {
      problems.push({ kind: 'banned-phrase', detail: `"${phrase}"` });
    }
  }

  return problems;
}
