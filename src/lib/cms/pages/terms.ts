import { legalSections } from './legal-page-schema';
import type { PageDef, PageValues } from '../types';

/**
 * /terms
 *
 * A first draft describing how Press Parrot actually works, written to be
 * edited rather than relied on as it stands. It deliberately promises nothing
 * the platform does not do: no uptime guarantee, no ranking guarantee, no
 * refund terms beyond what the marketing pages already say. A solicitor should
 * review it before it carries any weight.
 */

export const definition: PageDef = {
  slug: 'terms',
  label: 'Terms of service',
  path: '/terms',
  description: 'The agreement between Press Parrot and its customers. Needs legal review.',
  sections: legalSections(),
};

export const defaults: PageValues = {
  page: {
    title: 'Terms of Service',
    updatedAt: '',
    intro:
      'These terms govern your use of Press Parrot and the placements and content you order through it.',
    body: `## 1. Who we are

Press Parrot operates a marketplace connecting advertisers with publishers who accept sponsored articles and link placements, and provides content writing as a separate service.

## 2. Accounts

You need an account to browse the marketplace and to place an order. Accounts are free. You are responsible for keeping your login details secure and for activity carried out under your account.

You must give accurate information when registering, and keep it up to date.

## 3. Orders

Placing an order is an offer to buy a placement on the terms shown on the listing at the time you order. An order is accepted when we confirm it.

The price shown on a listing is the price for that placement. Where content is ordered alongside a placement, the content price is shown separately before checkout.

## 4. Publication

Publishers are independent businesses. We do not control their editorial decisions. A publisher may decline content that does not meet their guidelines, and may ask for changes.

Turnaround times shown on a listing are estimates based on that publisher's typical performance. They are not deadlines we guarantee.

## 5. Content you supply

Where you supply an article, you confirm that you own it or have the right to publish it, and that it does not infringe anyone's rights, defame anyone, or break any law.

You keep ownership of content you supply. You grant us and the publisher the right to publish it.

## 6. Content we write

Where you order content from us, ownership passes to you on payment. One round of revisions is included unless the listing says otherwise.

## 7. Cancellation and refunds

You may cancel an order before it has been sent to a publisher, for a full refund.

Once a publisher has begun work, or content has been written, we may withhold the cost of work already done.

If a placement cannot be delivered, we will offer a replacement of comparable quality or a refund.

## 8. What we do not promise

We do not guarantee search engine rankings, traffic, or any commercial outcome. Search engines decide independently how to treat any link.

We do not guarantee that a published link will remain in place indefinitely. Publishers may restructure, remove or archive content.

## 9. Acceptable use

You may not use Press Parrot to place content that is unlawful, misleading, or that promotes activity you are not licensed to promote. Publishers set their own rules about regulated topics, and those rules are shown on each listing.

## 10. Payment

Payment is taken at checkout. Prices are shown exclusive of VAT unless stated; VAT is added where applicable.

## 11. Liability

Nothing in these terms limits liability for death or personal injury caused by negligence, for fraud, or for anything else that cannot be limited by law.

Subject to that, our liability in connection with an order is limited to the amount you paid for it.

## 12. Changes

We may change these terms. The date at the top shows when they last changed. Material changes will be notified to account holders.

## 13. Governing law

These terms are governed by the law of England and Wales.

## 14. Contact

Questions about these terms can be sent to our support address, shown in the footer.`,
  },
  seo: {
    metaTitle: 'Terms of Service',
    metaDescription:
      'The terms governing use of the Press Parrot marketplace, placements ordered through it and content written by us.',
  },
};
