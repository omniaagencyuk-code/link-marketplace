import { legalSections } from './legal-page-schema';
import type { PageDef, PageValues } from '../types';

/**
 * /privacy
 *
 * Describes what the application actually stores, which is knowable from the
 * schema: an account, the orders placed against it, and the content briefs
 * attached to those orders. It does not claim certifications the business does
 * not hold. Needs legal review and an ICO registration number before launch.
 */

export const definition: PageDef = {
  slug: 'privacy',
  label: 'Privacy policy',
  path: '/privacy',
  description: 'What personal data Press Parrot holds and why. Needs legal review.',
  sections: legalSections(),
};

export const defaults: PageValues = {
  page: {
    title: 'Privacy Policy',
    updatedAt: '',
    intro: 'What we collect, why we collect it, and what you can ask us to do with it.',
    body: `## What we collect

**When you create an account:** your name, email address, and optionally your company name.

**When you place an order:** the websites you ordered, your target URLs, anchor text, any instructions you give, and any article you upload.

**When you pay:** our payment provider processes your card details. We do not store card numbers.

**When you use the site:** standard server logs, including IP address, for security and to prevent abuse.

## Why we hold it

- To provide the service you have asked for and to fulfil your orders
- To communicate with you about your orders
- To take payment and issue invoices
- To keep the platform secure, including limiting repeated failed sign-in attempts
- To meet our legal and accounting obligations

## Sharing

**Publishers** receive the information needed to publish your placement: the article, the target URL and the anchor text. They do not receive your account details.

**Our payment provider** processes payments.

**Our hosting and database providers** store the data on our behalf.

We do not sell personal data.

## How long we keep it

Account and order records are kept while your account is open and for as long as we are required to keep financial records afterwards.

You can ask us to close your account at any time.

## Your rights

You can ask us to:

- Give you a copy of the data we hold about you
- Correct anything that is wrong
- Delete your data, where we are not required to keep it
- Stop using it for a particular purpose

To make a request, contact us at the support address shown in the footer. If you are not satisfied with our response, you can complain to the Information Commissioner's Office.

## Cookies

See our [cookie policy](/cookies) for what we store in your browser and why.

## Changes

The date at the top shows when this policy last changed.`,
  },
  seo: {
    metaTitle: 'Privacy Policy',
    metaDescription:
      'What personal data Press Parrot collects, why we hold it, who we share it with and how to exercise your rights.',
  },
};
