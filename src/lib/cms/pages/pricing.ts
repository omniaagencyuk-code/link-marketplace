import { list, section, text, textarea } from '../fields';
import type { PageDef, PageValues } from '../types';

/**
 * /pricing
 *
 * The page no longer sells plans. Press Parrot is a marketplace: every
 * listing carries its own price and anybody can buy one placement without an
 * account tier, a subscription or a minimum. What the page is for now is the
 * other half of that - telling agencies, in-house teams and anybody ordering
 * regularly that a conversation about rates is welcome, and giving them a
 * form to start it.
 *
 * The plan cards, the monthly prices and the authority-band price table have
 * gone with that change. The band table in particular was a liability as
 * well as off-message: it quoted indicative ranges that nothing kept in step
 * with the marketplace, so a visitor who found a real listing far off the
 * range had been told a number we never charged.
 *
 * Every word below is editable, which is why it is here. What is deliberately
 * NOT editable is any claim about a discount: there are no percentages, no
 * minimum spends and no named rates anywhere in these defaults, because
 * `profiles.plan` still decides what a buyer is actually charged at checkout
 * and a page promising a figure the pricing code does not apply is a figure
 * we would have to honour or retract.
 */

export const definition: PageDef = {
  slug: 'pricing',
  label: 'Pricing',
  path: '/pricing',
  description: 'How buying works, who to talk to about rates, and the enquiry form.',
  sections: [
    section(
      'hero',
      'Hero',
      [
        text('eyebrow', 'Eyebrow', { maxLength: 60 }),
        text('title', 'Headline', { maxLength: 120 }),
        textarea('intro', 'Intro paragraph', { rows: 3, maxLength: 400 }),
        text('primaryCta', 'Primary button', {
          maxLength: 40,
          help: 'Scrolls down to the enquiry form. The link is fixed.',
        }),
        text('secondaryCta', 'Secondary button', {
          maxLength: 40,
          help: 'Goes to the marketplace. The link is fixed.',
        }),
        textarea('benefits', 'Three points under the buttons', {
          rows: 3,
          maxLength: 300,
          help: 'One per line. Each line gets a tick. Three fits the row.',
        }),
      ],
      'The band at the top of the page.',
    ),

    section(
      'options',
      'Ways to buy',
      [
        text('heading', 'Heading', { maxLength: 120 }),
        textarea('intro', 'Intro paragraph', { rows: 3, maxLength: 400 }),
        list(
          'items',
          'Cards',
          [
            text('icon', 'Icon', {
              maxLength: 20,
              help: 'One of: cart, layers, repeat, handshake. Anything else shows a dot.',
            }),
            text('heading', 'Heading', { maxLength: 60 }),
            textarea('description', 'Description', { rows: 3, maxLength: 400 }),
          ],
          { itemLabelKey: 'heading', minItems: 1, maxItems: 6 },
        ),
      ],
      'Four cards in two columns. Not plans - do not give these prices.',
    ),

    section(
      'agency',
      'For agencies',
      [
        text('label', 'Small label', { maxLength: 60 }),
        text('heading', 'Heading', { maxLength: 120 }),
        textarea('body', 'Paragraphs', {
          rows: 5,
          maxLength: 800,
          help: 'Blank line between paragraphs.',
        }),
        textarea('benefits', 'Points', {
          rows: 4,
          maxLength: 400,
          help: 'One per line. Each line gets a tick.',
        }),
        text('ctaLabel', 'Button label', {
          maxLength: 40,
          help: 'Scrolls down to the enquiry form. The link is fixed.',
        }),
      ],
      'The band for repeat buyers. Keep it an invitation - no figures, no minimum spend.',
    ),

    section(
      'enquiry',
      'Enquiry form',
      [
        text('heading', 'Heading', { maxLength: 120 }),
        textarea('intro', 'Intro paragraph', { rows: 3, maxLength: 400 }),
        textarea('reassurance', 'Small print under the button', { rows: 2, maxLength: 300 }),
      ],
      'The fields themselves are fixed, because what they collect is stored in a table.',
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
    eyebrow: 'Flexible pricing',
    title: 'Better rates for bigger ambitions.',
    intro:
      'Buy individual link placements at transparent marketplace prices, or speak to our team about exclusive rates for bulk orders, regular purchases and tailored link building campaigns.',
    primaryCta: 'Request custom pricing',
    secondaryCta: 'Browse marketplace',
    benefits: 'No subscriptions required\nTransparent marketplace prices\nNegotiated rates available',
  },

  options: {
    heading: 'Link building that works around you',
    intro:
      "Whether you're purchasing one placement or managing campaigns for multiple clients, Press Parrot offers flexible ways to buy.",
    items: [
      {
        icon: 'cart',
        heading: 'Pay as you go',
        description:
          'Browse our marketplace and purchase individual placements at their listed prices. No subscription fees or long-term commitments.',
      },
      {
        icon: 'layers',
        heading: 'Bulk order discounts',
        description:
          'Planning a larger campaign? Get in touch to discuss preferential rates when purchasing multiple placements.',
      },
      {
        icon: 'repeat',
        heading: 'Regular buyer rates',
        description:
          'Ordering links every month? We can discuss tailored pricing arrangements for agencies and customers with ongoing requirements.',
      },
      {
        icon: 'handshake',
        heading: 'Custom deals',
        description:
          "Have a particular budget, niche or list of websites in mind? Speak to our team and we'll see what we can arrange.",
      },
    ],
  },

  agency: {
    label: 'For agencies & frequent buyers',
    heading: "Buying links regularly? Let's talk.",
    body:
      'We work with SEO agencies, in-house marketing teams and independent professionals who need reliable link building at competitive rates.\n\nIf you are placing regular orders or managing multiple client campaigns, we would love to discuss how we can work together.',
    benefits:
      'Preferential pricing for eligible repeat buyers\nCustom quotes for larger campaigns\nFlexible arrangements based on your requirements',
    ctaLabel: 'Discuss agency rates',
  },

  enquiry: {
    heading: "Let's find a deal that works for you.",
    intro:
      'Tell us a little about your link building requirements and our team will get back to you to discuss available pricing options.',
    reassurance:
      'We will only use these details to reply to your enquiry. No account needed, and nothing is charged.',
  },

  faqs: {
    items: [
      {
        question: 'Do I need a subscription to use Press Parrot?',
        answer:
          'No. You can browse our marketplace and purchase individual placements without paying a monthly subscription.',
      },
      {
        question: 'Can I get a discount for ordering multiple links?',
        answer:
          "We may be able to offer preferential rates for larger orders. Contact our team with your requirements and we'll discuss what's possible.",
      },
      {
        question: 'Do you offer special rates for SEO agencies?',
        answer:
          'Yes, we welcome enquiries from agencies and frequent buyers looking to establish ongoing purchasing arrangements.',
      },
      {
        question: 'Is there a minimum order quantity?',
        answer:
          'There is no minimum order quantity for standard marketplace purchases. You can order individual placements.',
      },
      {
        question: 'Can I negotiate pricing on specific websites?',
        answer:
          'You can contact us to discuss specific websites or campaigns. Any negotiated pricing will depend on availability and the individual placement.',
      },
      {
        question: 'Can I purchase links without contacting your team?',
        answer:
          'Yes. Standard marketplace orders can be completed directly using the publicly listed prices.',
      },
    ],
  },

  seo: {
    metaTitle: 'Link Building Pricing & Bulk Order Discounts',
    metaDescription:
      'Explore flexible link building pricing at Press Parrot. Buy individual placements or enquire about bulk order discounts, agency rates and custom deals.',
  },
};
