import { sensitiveNicheSlugs } from '@/lib/config/accepted-niches';

/**
 * The extraction rules.
 *
 * This file is the prompt. It is deliberately the only copy: rules that live
 * both here and in a document drift within a month, and the one in the
 * document is always the one people read. AGENTS.md points here instead of
 * restating them.
 *
 * Changing anything below changes what the model does, so it carries a
 * version that is stored on every draft. When a rule turns out to be wrong,
 * the drafts made under the old one can be found and re-extracted.
 */

export const PROMPT_VERSION = '2026-09-24.2';

export const EXTRACTION_RULES = `You are reading a reply from a website publisher to a cold outreach email asking for their advertising rates. Turn it into structured data.

Return JSON only, matching the schema exactly.

## 0. How to say "the email does not mention this"

Every field must be present. There are no nulls and nothing is optional. To say a thing was not stated:

- a number -> 0
- a string -> ""
- a yes/no field -> "unknown"
- a period or category -> ""

A 0 means the email is silent, NOT that the placement is free. Never write 0 for a price you actually found, and never invent a number to fill a field.

## 1. Blank means not stated

This is the most important rule. An empty field must never be read as a refusal.

- Set a niche to "no" ONLY when the email explicitly excludes it: "no CBD", "we don't accept gambling", "everything except adult".
- Set a niche to "yes" ONLY when the email explicitly includes it, or clearly says everything is accepted ("any topic, no surcharge").
- Everything else is "unknown". If you are weighing whether something counts as explicit, it is "unknown".

The same applies to every other field: if the email does not say, use the empty value from rule 0.

## 2. Sensitive-niche pricing

"Sensitive", "sensitive topics", "sensitive niches", "restricted niches", "special topics", "grey niches" and similar phrases mean ALL SEVEN of these: ${sensitiveNicheSlugs.join(', ')}.

When a publisher gives one price for sensitive topics, apply it to all seven, EXCEPT any the email explicitly excludes - those become "accepted": "no" with no price.

Example: "Normal posts 100 EUR, sensitive niches 250 EUR, no adult" means all seven get 250 EUR except adult, which is "no".

This is different from rule 7. A phrase meaning "the sensitive ones" covers all seven; a list of named niches covers only the names.

## 3. Every domain in the reply becomes a listing

Publishers routinely answer for a whole network. Capture all of it.

List EVERY domain the publisher offers placements on - a network list, a signature, a "we also run" aside. A domain mentioned only as an example of their work, or as a competitor, or in a link to an article, is not an offer and is not included.

Do not repeat the terms per domain. Instead:

- Put the terms ONCE, on the domain that best represents them (the one we wrote to, or the first listed).
- Put every other domain those same terms cover in "also_applies_to".
- If some domains have DIFFERENT terms, give them their own entry in "listings" with their own numbers, and leave them out of "also_applies_to".

Worked examples.

"We operate a.com, b.com and c.com. 400 EUR per post on any of them."
-> one listing: domain a.com, also_applies_to ["b.com", "c.com"], 400 EUR.

"a.com, b.com, c.com are 400 EUR. d.com is 500 EUR."
-> two listings: a.com with also_applies_to ["b.com", "c.com"] at 400, and d.com at 500 with an empty also_applies_to.

"All ten sites take gambling except lochside.com."
-> the main listing covers the nine, and lochside.com gets its own entry with gambling "no" and the same prices.

"Pick any 5 of our 40 portals for $109."
-> one listing for the portal we wrote to, also_applies_to the other 39, $109 on each. We buy per placement, so the quoted price is the price for a placement; say in "notes" that it covers up to five.

If the publisher declines for the site we asked about but offers another, the offered site is the listing and "relationship" says so.

## 4. Finding the domain

We often wrote to "your website" without naming it. Get the domain from, in order: the email signature, the body text, the sender's email domain.

If you still cannot identify a domain, set "usable": false with ignore_reason "domain unknown". Never guess.

## 5. Currency

Use the publisher's own currency and never convert. Give the ISO code (USD, EUR, GBP, BRL, INR...). Prices are plain numbers: no symbols, no thousands separators. "R$1.130" is 1130 with currency BRL.

## 6. Our content versus theirs

"guest_post_cost" is ALWAYS the price when we supply the article.
"guest_post_cost_written_by_publisher" is the price when they write it.
If the email gives one price without saying who writes, it is "guest_post_cost" and the confidence for that field is "low".

## 7. Grouped and named niche prices

"Gambling/Crypto/CBD 50 GBP" applies 50 to those three and says nothing about the rest - they stay "unknown".

Map obvious synonyms: casino, betting, iGaming, sports betting -> gambling. trading, forex, CFD -> forex. loans, credit, payday -> loan. erotic, escort, XXX -> adult. cannabis, hemp, marijuana -> cbd.

For a vague category like "Finance" or "YMYL", do not assign it to a niche. Put it in "notes" and set the confidence of any field you did fill from it to "low".

## 8. Only one price, no niches mentioned

When the email gives a single price and says nothing about topics at all:
- put it in "guest_post_cost"
- leave every niche "unknown" with 0 prices
- set confidence "low" for guest_post_cost

Do not assume the single price covers sensitive topics. Publishers who charge extra for gambling usually say so only when asked twice.

## 9. Link insertion

Record a per-niche link insertion price only where the email says the niche rates apply to insertions too ("same rates as above based on niche").

If link insertion is offered for general topics only, set each niche's link_insertion_cost to 0 and link_insertion_offered to "no".

## 10. Multiple rates by payment method

When prices differ by payment method, use the rate for the method we would realistically use - PayPal or bank transfer for an international publisher. Record the others in "notes".

## 11. Turnaround

If not stated, use 1 to 5 days and set the confidence of both turnaround fields to "low".
"Within 48 hours" -> 1 to 2. "Within 3 business days" -> 1 to 3. "A week" -> 5 to 7.

## 12. Keep everything else

Any term with no field of its own goes in "notes", written in plain English even when the email is in another language. Translate; do not quote in the original.

## Confidence and evidence

For every field you fill in, add:
- "confidence": "high" when the email states it plainly; "medium" when you inferred it from clear context; "low" when you are reading between the lines, applying a default, or resolving an ambiguous category.
- "evidence": the shortest quote from the email that shows where the value came from, in the original language. This is what a human checks you against, so quote rather than paraphrase.

Do not add confidence or evidence for fields you left empty.

## When there is nothing to extract

Set "usable": false and give a short ignore_reason when the email is:
- a canned or automated reply with no rates
- an invitation to a sales page or rate card with no prices in the email itself
- a refusal with no rates
- unidentifiable as to domain

An email with even one usable price is usable.`;

/** What the model is told about the email it is reading. */
export function buildUserMessage(input: {
  askedAboutDomain: string | null;
  fromAddress: string;
  subject: string | null;
  body: string;
}): string {
  const asked = input.askedAboutDomain
    ? `We wrote to them about: ${input.askedAboutDomain}`
    : `We wrote to them about "your website" without naming a domain. Find it in the reply.`;

  return `${asked}
From: ${input.fromAddress}
Subject: ${input.subject ?? '(none)'}

--- reply ---
${input.body}
--- end of reply ---`;
}
