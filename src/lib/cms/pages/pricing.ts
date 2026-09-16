import { list, section, text, textarea } from '../fields';
import { brand } from '@/lib/config/brand';
import type { PageDef, PageValues } from '../types';

/**
 * /pricing
 *
 * Every number on this page is editable copy rather than a computed value.
 * That is deliberate: these are indicative ranges and plan prices, not live
 * marketplace prices, and the person who knows what they should say is the
 * person running the business - not a formatter. Individual listings still
 * show their own real price, which comes from the database.
 */

export const definition: PageDef = {
  slug: 'pricing',
  label: 'Pricing',
  path: '/pricing',
  description: 'Plans, indicative placement prices and the pricing FAQ.',
  sections: [
    section(
      'hero',
      'Hero',
      [
        text('eyebrow', 'Eyebrow', { maxLength: 60 }),
        text('title', 'Headline', { maxLength: 120 }),
        textarea('intro', 'Intro paragraph', { rows: 3, maxLength: 400 }),
      ],
      'The band at the top of the page.',
    ),

    section(
      'plans',
      'Plans',
      [
        list(
          'items',
          'Plans',
          [
            text('name', 'Plan name', { maxLength: 40 }),
            text('price', 'Price', {
              maxLength: 40,
              help: 'Written as you want it shown, e.g. "Free", "£99" or "Custom".',
            }),
            text('cadence', 'Under the price', { maxLength: 60, help: 'e.g. "per month".' }),
            textarea('description', 'Description', { rows: 2, maxLength: 300 }),
            textarea('features', 'Included', {
              rows: 6,
              maxLength: 800,
              help: 'One per line. Each line gets a tick.',
            }),
            textarea('excluded', 'Not included', {
              rows: 3,
              maxLength: 500,
              help: 'One per line. Each line gets a dash. Leave empty for none.',
            }),
            text('ctaLabel', 'Button label', { maxLength: 40 }),
            text('ctaHref', 'Button link', {
              maxLength: 200,
              help: 'An internal path like /signup, or a mailto: address.',
            }),
            text('featured', 'Highlight this plan?', {
              maxLength: 10,
              help: 'Type "yes" to give it the border and the "Most popular" badge. One plan only.',
            }),
          ],
          { itemLabelKey: 'name', minItems: 1, maxItems: 4 },
        ),
      ],
      'The three plan cards. Designed for three - a fourth will wrap.',
    ),

    section(
      'bands',
      'Typical prices table',
      [
        text('heading', 'Heading', { maxLength: 120 }),
        textarea('intro', 'Intro paragraph', { rows: 3, maxLength: 400 }),
        list(
          'items',
          'Rows',
          [
            text('band', 'Authority band', { maxLength: 40 }),
            text('guestPost', 'Guest post price', { maxLength: 40 }),
            text('nicheEdit', 'Niche edit price', { maxLength: 40 }),
            text('note', 'Typical publishers', { maxLength: 120 }),
          ],
          { itemLabelKey: 'band', maxItems: 12 },
        ),
        textarea('footnote', 'Small print under the table', { rows: 2, maxLength: 300 }),
      ],
      'Indicative ranges. Keep these honest - a visitor who finds real prices far off will not come back.',
    ),

    section(
      'faqs',
      'FAQs',
      [
        list(
          'items',
          'Questions',
          [
            text('question', 'Question', { maxLength: 200 }),
            textarea('answer', 'Answer', { rows: 4, maxLength: 800 }),
          ],
          { itemLabelKey: 'question', maxItems: 15 },
        ),
      ],
      'Shown on the page and published as FAQ structured data.',
    ),

    section(
      'seo',
      'Search engine listing',
      [
        text('metaTitle', 'Meta title', { maxLength: 70 }),
        textarea('metaDescription', 'Meta description', { rows: 3, maxLength: 170 }),
      ],
      'How the page appears in search results.',
    ),
  ],
};

export const defaults: PageValues = {
  hero: {
    eyebrow: 'Pricing',
    title: 'Pay for placements, not for access',
    intro:
      'Every website in the marketplace has a fixed price shown up front. Plans are optional and exist to give high volume teams discounts and tooling.',
  },

  plans: {
    items: [
      {
        name: 'Starter',
        price: 'Free',
        cadence: 'Pay per placement',
        description: 'For individual SEOs and small sites placing a handful of links each month.',
        features:
          'Full marketplace access\nSaved website shortlists\nStandard marketplace pricing\nEmail support',
        excluded: 'Volume discounts\nDedicated account manager\nAPI access',
        ctaLabel: 'Create an account',
        ctaHref: '/signup',
        featured: '',
      },
      {
        name: 'Growth',
        price: '£99',
        cadence: 'per month',
        description: 'For agencies running multiple client campaigns with monthly link budgets.',
        features:
          'Everything in Starter\n7% discount on every placement\nBulk ordering and CSV export\nClient workspaces and reporting\nPriority support within 4 hours',
        excluded: 'Dedicated account manager',
        ctaLabel: 'Start with Growth',
        ctaHref: '/signup?plan=growth',
        featured: 'yes',
      },
      {
        name: 'Agency',
        price: 'Custom',
        cadence: 'Annual contract',
        description: 'For teams spending five figures a month across many domains and markets.',
        features:
          'Everything in Growth\nNegotiated publisher rates\nDedicated account manager\nAPI access and white labelling\nInvoiced billing with 30 day terms',
        excluded: '',
        ctaLabel: 'Talk to sales',
        ctaHref: `mailto:${brand.salesEmail}`,
        featured: '',
      },
    ],
  },

  bands: {
    heading: 'Typical placement prices',
    intro:
      'Indicative ranges across the marketplace. Individual listings always show their own fixed price, and digital PR is quoted per campaign.',
    items: [
      {
        band: 'DR 20-39',
        guestPost: 'from £120',
        nicheEdit: 'from £90',
        note: 'Niche blogs and regional titles',
      },
      {
        band: 'DR 40-54',
        guestPost: 'from £180',
        nicheEdit: 'from £135',
        note: 'Established category sites',
      },
      {
        band: 'DR 55-64',
        guestPost: 'from £260',
        nicheEdit: 'from £195',
        note: 'Well known publications',
      },
      {
        band: 'DR 65-74',
        guestPost: 'from £420',
        nicheEdit: 'from £310',
        note: 'National and high authority media',
      },
      {
        band: 'DR 75+',
        guestPost: 'from £890',
        nicheEdit: 'from £650',
        note: 'Tier one press, digital PR only on some',
      },
    ],
    footnote:
      'Prices are shown in GBP and exclude VAT. Growth and Agency plans apply their discount automatically at checkout.',
  },

  faqs: {
    items: [
      {
        question: 'Do I need a subscription to buy links?',
        answer:
          'No. The marketplace is open on the free Starter plan and you only pay for the placements you order. Paid plans exist for teams that want discounts, bulk tools and reporting.',
      },
      {
        question: 'Why do prices vary so much between sites?',
        answer:
          'Price follows demand, authority and editorial effort. A DR 70 national title with a real newsroom costs more than a DR 35 niche blog because the audience, scrutiny and link value are different.',
      },
      {
        question: 'Are there any hidden fees?',
        answer:
          'No. The price on the listing is the price you pay, including writing where the publisher supplies content. VAT is added at checkout for UK customers.',
      },
      {
        question: 'What happens if a placement is not delivered?',
        answer:
          'If a publisher cannot deliver within the stated turnaround you get a full refund or a free replacement on a comparable site. Cancelled orders are refunded within five working days.',
      },
    ],
  },

  seo: {
    metaTitle: 'Pricing',
    metaDescription:
      'Transparent per-placement pricing with no subscription required. See typical guest post and niche edit prices by domain rating, plus optional agency plans.',
  },
};
