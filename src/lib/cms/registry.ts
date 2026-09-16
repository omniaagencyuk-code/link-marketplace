import * as home from './pages/home';
import * as linkBuilding from './pages/link-building';
import * as guestPosts from './pages/guest-posts';
import * as nicheEdits from './pages/niche-edits';
import * as digitalPr from './pages/digital-pr';
import * as agencies from './pages/link-building-agencies';
import * as pricing from './pages/pricing';
import * as howItWorks from './pages/how-it-works';
import * as contentWriting from './pages/content-writing';
import * as terms from './pages/terms';
import * as privacy from './pages/privacy';
import * as cookies from './pages/cookies';
import type { PageDef, PageValues } from './types';

/**
 * Every editable page.
 *
 * A page becomes editable by adding its module here. The admin page list, the
 * editor form and the content resolver are all driven from this one array, so
 * there is no second place to register anything.
 */

export interface RegisteredPage {
  definition: PageDef;
  defaults: PageValues;
}

export const pageRegistry: RegisteredPage[] = [
  home,
  linkBuilding,
  guestPosts,
  nicheEdits,
  digitalPr,
  agencies,
  contentWriting,
  pricing,
  howItWorks,
  terms,
  privacy,
  cookies,
];

const bySlug = new Map(pageRegistry.map((page) => [page.definition.slug, page]));

export function getRegisteredPage(slug: string): RegisteredPage | null {
  return bySlug.get(slug) ?? null;
}

export function listRegisteredPages(): RegisteredPage[] {
  // The homepage first, then everything else alphabetically - it is the page
  // an editor reaches for most often.
  const [first, ...rest] = pageRegistry;
  return [
    ...(first ? [first] : []),
    ...rest.sort((a, b) => a.definition.label.localeCompare(b.definition.label)),
  ];
}

/** Slugs that may be written to, so a crafted request cannot invent a page. */
export function isKnownPageSlug(slug: string): boolean {
  return bySlug.has(slug);
}
