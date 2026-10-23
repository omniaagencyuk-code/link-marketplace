/**
 * Prove the /link-building redesign kept every word the old page had.
 *
 * The page was redrawn, not rewritten: new composition, new layout, new
 * animation, and the same copy, headings, internal links, FAQ and structured
 * data it ranked with. `service-redraw.mts` is the comparison - both pages
 * rendered from the same shipped content, and anything the old one said that
 * the new one does not is a failure. What is here is what is particular to
 * this page.
 *
 * No key, no database, no network, no browser.
 */
import { BadgeCheck, Gauge, Receipt, Workflow } from 'lucide-react';
import * as linkBuilding from '../src/lib/cms/pages/link-building';
import { LinkBuildingPage } from '../src/components/link-building/link-building-page';
import { ORDER_STEPS } from '../src/components/marketing/order-steps';
import { ServicePage } from '../src/components/marketing/service-page';
import { compareRedraw, report } from './service-redraw.mts';

const { check, after } = compareRedraw({
  page: linkBuilding,
  redrawn: LinkBuildingPage,
  template: ServicePage,
  highlightIcons: [BadgeCheck, Gauge, Receipt, Workflow],
  path: '/link-building',
  breadcrumbLabel: 'Link building',
  counts: { highlights: 4, bodySections: 5, faqs: 5, related: 6 },
  furniture: [
    'Domain Rating',
    'Organic Traffic',
    'Referring Domains',
    'Country',
    'Niche',
    'Price',
    'Turnaround',
    'Link Type',
    'Unlock the Marketplace',
    'Create a free account to browse publishers and pricing.',
    'Website names are not shown to signed-out visitors.',
  ],
});

console.log("\n== this page's own drawing ==");
{
  /*
    The four steps are the order flow, labelled and numbered. They are copy
    that is not in the CMS and was not on the old template either, so there
    is nothing to compare them against - the assertion is that the band on
    the page is the one shared module's, not a second set of words. Read out
    of that module for the same reason the rest is read out of `defaults`.
  */
  for (const [index, step] of ORDER_STEPS.entries()) {
    check.yes(`step ${index + 1} is "${step.label}"`, after.includes(step.label));
  }
  check.is('four of them', ORDER_STEPS.length, 4);
  check.yes('and they are numbered', after.includes('Step 1') && after.includes('Step 4'));

  // The mascot is decoration and says so, rather than carrying a caption a
  // screen reader has to listen to.
  check.yes('the mascot has an empty alt', after.includes('alt=""'));
}

report(check);
