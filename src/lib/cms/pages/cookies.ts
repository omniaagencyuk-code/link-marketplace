import { legalSections } from './legal-page-schema';
import type { PageDef, PageValues } from '../types';

/**
 * /cookies
 *
 * Describes what the application genuinely stores in the browser today: the
 * session cookie, and the localStorage keys the basket and shortlist use. It
 * lists no analytics or advertising cookies because none are set. If tracking
 * is added later, this page and a consent banner both need revisiting.
 */

export const definition: PageDef = {
  slug: 'cookies',
  label: 'Cookie policy',
  path: '/cookies',
  description: 'What Press Parrot stores in the browser. Needs legal review.',
  sections: legalSections(),
};

export const defaults: PageValues = {
  page: {
    title: 'Cookie Policy',
    updatedAt: '',
    intro: 'What we store in your browser, and what each thing is for.',
    body: `## Essential cookies

These are needed for the site to work and cannot be turned off.

**Session cookie.** Set when you sign in, so that each page you request knows who you are. It is removed when you sign out.

**Security cookies.** Used to keep your session valid and to protect forms from being submitted from another site.

## Stored in your browser

As well as cookies, we keep a small amount of information in your browser's local storage:

**Your basket.** Placements you have added but not yet ordered, so they are still there when you come back.

**Your shortlist.** Websites you have saved while browsing.

**Interface preferences**, such as which view you last used in the marketplace.

This information stays on your device and is not sent to us. Clearing your browser data will remove it.

## Analytics and advertising

We do not currently set analytics or advertising cookies. If that changes, this page will be updated and you will be asked for consent first.

## Managing cookies

Your browser can block or delete cookies. Blocking the essential ones will stop you signing in.

## Changes

The date at the top shows when this policy last changed.`,
  },
  seo: {
    metaTitle: 'Cookie Policy',
    metaDescription:
      'The cookies and browser storage Press Parrot uses, what each is for, and how to manage them.',
  },
};
