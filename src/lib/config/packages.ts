import { emptyFilters } from '@/lib/marketplace/filters';
import type { LinkPackage } from '@/lib/packages/rules';

/**
 * The link building packages, as shipped.
 *
 * ## Why a config file and not a table
 *
 * Because nobody knows yet which packages sell. These are three guesses at
 * how a buyer thinks about a budget, and they will be wrong in ways only
 * orders can reveal. A config file is a deploy away from changing and costs
 * nothing to ship; an admin screen for editing packages is a screen built
 * before anyone has edited one.
 *
 * When they are being tuned often enough for that to chafe, the pattern to
 * copy is `navigation_menus`: a table holding a row only for a package
 * somebody has saved, empty on the day it ships, and an empty table meaning
 * exactly what is written here. Reset is a `delete`, never a write of
 * today's defaults - a package list frozen at this release's three is the
 * one that never gets the fourth.
 *
 * ## What a package may and may not say
 *
 * A name, a sentence and a search. No price: `LinkPackage` has nowhere to
 * put one, deliberately, and every figure on the page is computed from the
 * listings the basket would hold. No count of matches either - that moves
 * with the inventory, and a number typed here would be a claim about
 * stock we would stop checking.
 *
 * The blurbs describe the shape of what you get and never the outcome. We
 * sell placements on publishers; we do not sell rankings, and a package
 * named for a result would be promising one.
 */
export const linkPackages: LinkPackage[] = [
  {
    slug: 'starter',
    name: 'Starter',
    blurb:
      'Five placements on established sites with real readers. A first push for a new page, or a steady month.',
    filters: { ...emptyFilters, drMin: 20, drMax: 45, linkTypes: ['guest-post'] },
    count: 5,
    /*
      Strongest first inside the band, which is also what decides the price.
      Cheapest-first would make "from" literally true and hand the buyer the
      five weakest sites that qualify - a package nobody would buy twice.
    */
    sort: 'dr-desc',
  },
  {
    slug: 'growth',
    name: 'Growth',
    blurb:
      'Ten placements across a mid-authority range, mixing guest posts and niche edits on sites with measured traffic.',
    filters: {
      ...emptyFilters,
      drMin: 40,
      drMax: 65,
      trafficMin: 1000,
      linkTypes: ['guest-post', 'niche-edit'],
    },
    count: 10,
    sort: 'dr-desc',
  },
  {
    slug: 'authority',
    name: 'Authority',
    blurb:
      'Ten placements on the strongest publishers in the marketplace, each with substantial organic traffic.',
    filters: {
      ...emptyFilters,
      drMin: 65,
      trafficMin: 10_000,
      linkTypes: ['guest-post', 'niche-edit'],
    },
    count: 10,
    sort: 'dr-desc',
  },
];

/** One package by slug, or null. */
export function packageBySlug(slug: string): LinkPackage | null {
  return linkPackages.find((pkg) => pkg.slug === slug) ?? null;
}
