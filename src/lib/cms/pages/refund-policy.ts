import { legalSections } from './legal-page-schema';
import type { PageDef, PageValues } from '../types';

/**
 * /refund-policy
 *
 * Where the answer to "can I have my money back" lives, and the only place it
 * lives. Section 7 of /terms used to carry a three-line version of it and now
 * points here instead: two documents answering the same question is one
 * document somebody will update and one they will not, and a customer who
 * found the stale one would be reading a promise we were not keeping.
 *
 * The figures are deliberately absent from this body. The guarantee's length,
 * the publisher's deadline, how often a link is checked and how many failed
 * checks it takes are rendered above it by `GuaranteePanel`, straight from the
 * constants the checker runs on. `verify:sections` fails if a figure of that
 * shape appears in the editable copy, because an editor cannot know they have
 * just contradicted the job that pays the claims.
 *
 * Everything the body does state is either what /terms already said - cancel
 * before it reaches a publisher, work already done may be withheld - or what
 * the code already does. A solicitor should review the wording; nothing here
 * should need business decisions that have not already been taken.
 */

export const definition: PageDef = {
  slug: 'refund-policy',
  label: 'Refund policy',
  path: '/refund-policy',
  description: 'When money comes back, and how. Needs legal review.',
  sections: legalSections(),
};

export const defaults: PageValues = {
  page: {
    title: 'Refund Policy',
    updatedAt: '',
    intro:
      'What happens to your money when a placement is cancelled, cannot be delivered, or comes down after it went live.',
    body: `## What this covers

Money paid to Press Parrot for placements and for content we write. It sits alongside our [terms of service](/terms), which govern everything else about using the marketplace.

## Before an order reaches a publisher

An order can be cancelled for a full refund at any point before it has been sent to a publisher and before any content has been written for it. Ask, and it is done.

Opening a checkout and not finishing it charges you nothing. An order sitting unpaid is not an order and does not need cancelling.

## Once work has started

Once a publisher has begun work on a placement, or an article has been written, we may keep the cost of the work already done and refund the rest. We tell you that figure before anything is processed.

## A placement we cannot deliver

If a placement cannot be delivered - the publisher withdraws, the site changes its rules, the article is refused and cannot be reworked - you choose between a replacement of comparable quality and a full refund of that placement. The choice is yours.

Nothing about a placement is final until there is a live URL.

## A link that comes down

Every placement is watched for as long as the guarantee runs, on the terms set out above. If the link goes and the publisher does not put it back, you choose a replacement or your money back for that placement.

Three things are deliberately not treated as a link that was taken down: a page we cannot read at all, an article that moved to a new address with the link intact, and a link a search engine chose to ignore. The first is our blind spot rather than the publisher's fault, the second is still the placement you bought, and the third is not something any publisher can promise.

## Content we write

Content is refundable in full until a writer starts on it. After that, a draft that does not match the brief is reworked rather than refunded, because the brief is what we agreed to deliver. Where we cannot get a draft to match the brief, the content is refunded.

Content bought alongside a placement is refunded separately from it. They are separate pieces of work and one can succeed while the other does not.

## What we do not refund

Rankings, traffic, revenue, or any other commercial outcome. A link is a placement on a page, and what a search engine does with it is theirs to decide.

A live placement that went out against the wrong landing page or anchor text, where those are what you gave us. Tell us before it goes live and changing it costs nothing.

## How a refund reaches you

Back to the card or account that paid, through Stripe, for the amount that was charged to it. We do not hold a balance and we do not issue credit in place of money unless you ask us to.

A refund is processed by a person rather than automatically, so allow a working day or two at our end on top of however long your bank takes.

## Asking for one

Reply to the email about the order, or raise an issue against the placement from the order in your dashboard. Both reach the same people.`,
  },
  seo: {
    metaTitle: 'Refund Policy',
    metaDescription:
      'When Press Parrot refunds a placement or an article: cancellations, placements that cannot be delivered, and links that come down under the guarantee.',
  },
};
