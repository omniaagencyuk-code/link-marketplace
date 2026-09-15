import * as linkBuilding from './pages/link-building';
import * as guestPosts from './pages/guest-posts';
import * as nicheEdits from './pages/niche-edits';
import * as digitalPr from './pages/digital-pr';
import * as agencies from './pages/link-building-agencies';
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
  linkBuilding,
  guestPosts,
  nicheEdits,
  digitalPr,
  agencies,
];

const bySlug = new Map(pageRegistry.map((page) => [page.definition.slug, page]));

export function getRegisteredPage(slug: string): RegisteredPage | null {
  return bySlug.get(slug) ?? null;
}

export function listRegisteredPages(): RegisteredPage[] {
  return [...pageRegistry].sort((a, b) => a.definition.label.localeCompare(b.definition.label));
}

/** Slugs that may be written to, so a crafted request cannot invent a page. */
export function isKnownPageSlug(slug: string): boolean {
  return bySlug.has(slug);
}
