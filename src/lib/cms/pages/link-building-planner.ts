import { serviceSections } from './service-page-schema';
import { list, section, text, textarea } from '../fields';
import type { PageDef, PageValues } from '../types';

/**
 * /link-building-planner
 *
 * The public page for the one feature here that is free and deliberately
 * allowed to know nothing. It renders through `ServicePage` like the service
 * pages, because what it has to say has the same shape - what it is, what it
 * does, what it costs - and a seventh template would be a seventh thing to
 * keep looking like the other six.
 *
 * ## Everything here has to be true of the planner as built
 *
 * A marketing page is the easiest place in a codebase to make a claim
 * nothing enforces, and this feature's whole design is a list of things it
 * refuses to do. So the copy says what the code says:
 *
 *   * **No paid lookup, ever.** The only enrichment is `planner-metrics.ts`,
 *     one read of our own `websites` table, capped per account per hour. The
 *     page may say the planner is free without an asterisk because nothing
 *     behind it spends anything.
 *   * **Nothing is verified and nothing says it is.** "Live" means a person
 *     pressed Live. The page states that in the body and again in an FAQ,
 *     because a free tool implying it has confirmed a backlink is making a
 *     claim we cannot stand behind - and a landing page is exactly where
 *     that claim gets made by accident.
 *   * **Blank is not zero**, and **paid and committed are never added
 *     together**. Both are selling points as well as rules, so both are
 *     said plainly rather than left for somebody to discover.
 *
 * Nothing here quotes a figure about the inventory. The marketplace preview
 * below the hero is counted per request from the same source the
 * marketplace uses; a number typed into this file is a number that goes
 * stale the week after it ships, which is how a gateway came to advertise
 * 5,247 listings against an inventory of 12,190.
 */

/**
 * The `preview` section, carrying the animation's captions.
 *
 * The shared schema's `preview` is a heading and a line over the redacted
 * marketplace table. This page shows the planner being used instead, so the
 * section keeps the same key - the band reads `preview` either way, and a
 * page that had been edited before this changed keeps its heading - and gains
 * the six captions beside the animation.
 */
const plannerBandSection = section(
  'preview',
  'The planner animation',
  [
    text('heading', 'Heading', { maxLength: 120 }),
    textarea('body', 'Supporting copy', { rows: 3, maxLength: 400 }),
    list(
      'steps',
      'Captions beside the animation',
      [
        text('label', 'Label', { maxLength: 60 }),
        textarea('body', 'One line', { rows: 2, maxLength: 200 }),
      ],
      {
        itemLabelKey: 'label',
        maxItems: 6,
        help:
          'Six, in the order the animation runs: the plan, typing a domain, the metrics arriving, the month and price, marking it live, the totals. The animation highlights whichever one it is on, so re-ordering these without re-ordering the animation would highlight the wrong line.',
      },
    ),
  ],
  'The animated panel. The publishers in it are invented, on reserved .example domains, and the project is example.com - the panel says it is a demonstration on its face.',
);

export const definition: PageDef = {
  slug: 'link-building-planner',
  label: 'Link building planner',
  path: '/link-building-planner',
  description: 'The public page for the free Link Building Planner.',
  sections: serviceSections().map((item) =>
    item.key === 'preview' ? plannerBandSection : item,
  ),
};

export const defaults: PageValues = {
  hero: {
    eyebrow: 'Free tool',
    title: 'The Link Building Planner',
    intro:
      'One row per link you plan to buy — from us or from anywhere else. Months, sources, prices, anchors, statuses and live URLs, all editable in place, with reports that add up what you have paid and what you are still committed to.',
    primaryCta: { label: 'Create Free Account', href: '/signup' },
    secondaryCta: { label: 'See How It Works', href: '/how-it-works' },
    microcopy: 'Free account, no subscription. The planner itself is free and stays free.',
  },

  highlights: {
    items: [
      {
        title: 'Every link, not just ours',
        body: 'A row is a link you plan to buy, wherever you buy it. Source is yours to fill in, so an agency running six suppliers can see the whole campaign in one place rather than in six exports.',
      },
      {
        title: 'Blank is not zero',
        body: 'A row nobody has researched yet has no domain rating and no price. It sorts last whichever way the arrow points, and counts as nothing in a total — rather than as a zero that drags your portfolio average down every time you add a row.',
      },
      {
        title: 'Paid and committed stay apart',
        body: 'Money that has left, and priced work still to be paid for. Two figures, never added together, because the sum would be a number that is neither of them.',
      },
      {
        title: 'Nothing to install',
        body: 'It is a screen in your account. CSV in and CSV out when you need a file, and the export is the one you can forward to a client.',
      },
    ],
  },

  preview: {
    heading: 'One row, start to finish',
    body: 'A plan with four links in it, and a fifth being added: the domain typed in, the metrics we already hold arriving against it, the month and the price set, and the status moved to Live by hand. Watch the two figures under the table on the last beat - going live moves what you have committed, not what you have paid.',
    steps: [
      {
        label: 'A row per link you plan',
        body: 'From us, from another marketplace, or from a publisher you deal with directly. The source is yours to fill in.',
      },
      {
        label: 'Type the domain',
        body: 'That is the whole of adding a row. Everything else can wait until you know it.',
      },
      {
        label: 'We fill in what we already hold',
        body: 'Domain rating, traffic, keywords and referring domains for a domain the marketplace lists, with the date they were measured. A domain we do not hold says so rather than guessing.',
      },
      {
        label: 'Set the month and the price',
        body: 'Blank is not zero: a row you have not priced yet is worth nothing in a total rather than counting as free.',
      },
      {
        label: 'You mark it live',
        body: 'There is no link checking here and nothing watches your placements. Live means somebody pressed Live.',
      },
      {
        label: 'Paid and committed stay apart',
        body: 'Money that has left, and priced work still to be paid for. A link going live does not make it paid, so the two figures never add up into one.',
      },
    ],
  },

  body: {
    sections: [
      {
        heading: 'A spreadsheet that knows about domains',
        content: `Most link building is planned in a spreadsheet, and for good reason: a plan has to hold whatever the campaign actually looks like, and no form anybody designs survives contact with that. The problem is never the spreadsheet. It is that the spreadsheet knows nothing about the domains in it, so every figure in it was pasted by hand from somewhere else and is as old as the day it was pasted.

The planner is the same grid with that one gap closed. Seventeen fields a row, every one editable in place: the domain, where you are buying it, the four metrics, link type, target URL, anchor text and anchor type, status, planned and live dates, the live URL, price and currency, whether it has been paid, and a notes field for the things that do not fit anywhere.

Filtering, sorting and paging all happen in the database, fifty rows to a page, so a plan with two thousand rows in it behaves like a plan with twenty.`,
      },
      {
        heading: 'What it deliberately does not do',
        content: `There is no link checking. No lost-link detection, no crawl of a publisher's site, no scheduled job watching your placements. **"Live" means somebody pressed Live** — it is a status on your own board, not a verification, and every screen that shows a live count says as much.

This is a decision rather than an omission. A free tool that implied it had confirmed a backlink would be making a claim we cannot stand behind, and the version of this feature that checked links would either cost money per row or be wrong quietly. Neither is worth having.

For the same reason there is no Ahrefs call, no Majestic, no Moz, no SEMrush, no model and no crawl anywhere in it. The only lookup of any kind asks our own publisher table about a domain you typed, and that is why the planner can be free without a limit on how long you use it.`,
      },
      {
        heading: 'What the reports answer',
        content: `Seven questions, all of them from your own rows and none of them estimated:

- How many links you planned in a month, and how many of those are marked live
- What you have paid, and what you are committed to, month by month
- Which sources you are spending with
- How the plan splits by link type and by anchor type
- Where everything currently sits by status

A report that needed a figure we do not hold is left out rather than filled in. Where a plan mixes currencies, the foreign rows are counted separately and never converted — an exchange rate we picked would turn your budget into our guess at your budget.`,
      },
      {
        heading: 'Importing an order you placed with us',
        content: `A placement bought through Press Parrot can be pulled into the plan in a click. Five fields are copied across and the row keeps a reference back to the order.

A reference, deliberately, not a copy that owns anything. Moving a planner row to Cancelled is you tidying your own board; it must not cancel a placement we are in the middle of delivering, and changing a planner price must not change what you were charged. Importing the same order twice gets you one row, enforced by the database rather than by anyone remembering.`,
      },
      {
        heading: 'Who can see your plan',
        content: `The planner tables carry one policy, scoped to your own account, on both reading and writing — and, unlike every other internal table here, **no admin policy at all**. There is no screen anywhere in the Press Parrot admin that lists your planner rows.

That is not decoration. A plan holds which suppliers an agency uses and what it pays them, which is exactly the information a marketplace should not have standing access to.`,
      },
    ],
  },

  faqs: {
    items: [
      {
        question: 'Is the planner really free?',
        answer:
          'Yes, with a free account and no subscription. It is free because nothing behind it spends anything: no Ahrefs, Majestic, Moz or SEMrush call, no model, no crawl. The only lookup reads our own publisher table, and it is capped per account per hour.',
      },
      {
        question: 'Does it check whether my links are still live?',
        answer:
          'No. There is no link checking and no lost-link detection — "Live" is a status you set, not something we have verified. Anything on your board marked live is marked live because a person marked it.',
      },
      {
        question: 'Can I plan links I am buying somewhere else?',
        answer:
          'That is the point of it. Every row has a source field you fill in yourself, so placements from us, from another marketplace and from a publisher you deal with directly all sit in the same plan with the same totals over them.',
      },
      {
        question: 'Does the planner change my orders with you?',
        answer:
          'Never. An imported order is referenced, not owned: a planner status cannot cancel a placement we are delivering, and a planner price cannot change what you were charged.',
      },
      {
        question: 'Can I get my data out?',
        answer:
          'CSV, in and out, with the columns the table shows. The export is written through the same guard the rest of the site uses, so a cell beginning with an equals sign opens as text in a spreadsheet rather than running as a formula.',
      },
      {
        question: 'What happens to a row I have not researched yet?',
        answer:
          'Nothing is assumed. A missing metric or price stays blank: last in a sort whichever way you point it, outside a price range in both directions, and worth nothing in a total. A blank is never read as a zero.',
      },
    ],
  },

  related: {
    items: [
      {
        label: 'Browse the marketplace',
        href: '/guest-posts',
        description: 'The publishers you can plan against.',
      },
      {
        label: 'Link building metrics',
        href: '/link-building-metrics',
        description: 'What the four figures in each row mean.',
      },
      {
        label: 'For agencies',
        href: '/link-building-agencies',
        description: 'Running campaigns for several clients.',
      },
      {
        label: 'Pricing',
        href: '/pricing',
        description: 'What placements cost when you buy here.',
      },
    ],
  },

  cta: {
    heading: 'Start your plan',
    body: 'Create a free account and the planner is there. No subscription, and nothing to cancel if you only ever use this.',
    primaryCta: { label: 'Create Free Account', href: '/signup' },
    secondaryCta: { label: 'See Pricing', href: '/pricing' },
  },

  seo: {
    metaTitle: 'Free Link Building Planner | Press Parrot',
    metaDescription:
      'Plan every link you buy — anywhere — in one place. Months, prices, anchors and statuses, with reports on paid and committed spend. Free, with no paid lookups behind it.',
  },
};
