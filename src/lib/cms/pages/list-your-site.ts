import { list, section, text, textarea } from '../fields';
import type { PageDef, PageValues } from '../types';

/**
 * /list-your-site
 *
 * The supply side, which had no page at all. The sourcing pipeline knows
 * exactly what to do with a publisher who writes in - 0019 reads the email,
 * extracts a draft, a person approves it - and there was no way to *invite*
 * one. A publisher reached us only by finding an address and guessing.
 *
 * ## What the copy may and may not say
 *
 * Everything here is editable, and two things are deliberately absent from
 * the defaults because they are promises nothing in the code keeps:
 *
 *   * **No acceptance criteria.** "We accept sites with DR 30+" is a rule
 *     nobody applies - a person reads each submission and decides. Printing
 *     a threshold would turn their judgement into a commitment and lose us
 *     the sites just under it.
 *   * **No payment terms.** How and when a publisher is paid is not
 *     something this codebase decides or records, so the page does not say.
 *     An invented "net 30" is a promise somebody then has to keep.
 *
 * What it does say is what is true of the machinery: we measure the site
 * ourselves rather than taking the figures from the form, a person reads
 * every submission, and what a publisher quotes is what we pay - the sell
 * price is a separate decision, which is `draft-approval.ts`'s rule stated
 * out loud.
 *
 * The guarantee is described without its figures, the way /refund-policy's
 * body is: the numbers live in `monitoring/guarantee.ts` and a copy typed
 * into a CMS field is a copy that drifts.
 */

export const definition: PageDef = {
  slug: 'list-your-site',
  label: 'List your site',
  path: '/list-your-site',
  description: 'The page publishers land on, and the form that sends us their site.',
  sections: [
    section(
      'hero',
      'Hero',
      [
        text('eyebrow', 'Eyebrow', { maxLength: 60 }),
        text('title', 'Headline', { maxLength: 120 }),
        textarea('intro', 'Intro paragraph', { rows: 3, maxLength: 400 }),
        text('primaryCta', 'Button', {
          maxLength: 40,
          help: 'Scrolls down to the form. The link is fixed.',
        }),
        textarea('benefits', 'Three points under the button', {
          rows: 3,
          maxLength: 300,
          help: 'One per line. Each line gets a tick. Three fits the row.',
        }),
      ],
      'The band at the top of the page.',
    ),

    section(
      'criteria',
      'What happens to your site',
      [
        text('heading', 'Heading', { maxLength: 120 }),
        textarea('intro', 'Intro paragraph', { rows: 3, maxLength: 400 }),
        textarea('points', 'Points', {
          rows: 5,
          maxLength: 600,
          help: 'One per line. Each line gets a tick.',
        }),
      ],
      'Describe what we do with a submission. Do not name a metric threshold - a person decides each one, and a number here becomes a promise.',
    ),

    section(
      'steps',
      'How it works',
      [
        text('heading', 'Heading', { maxLength: 120 }),
        list(
          'items',
          'Steps',
          [
            text('heading', 'Step heading', { maxLength: 80 }),
            textarea('description', 'Description', { rows: 3, maxLength: 400 }),
          ],
          { itemLabelKey: 'heading', minItems: 1, maxItems: 5 },
        ),
      ],
      'Three numbered steps. Keep them to what actually happens.',
    ),

    section(
      'offer',
      'The form',
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
      'Shown on the page and published as FAQ structured data. Nothing here may name a payment term or a metric threshold.',
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
    eyebrow: 'For publishers',
    title: 'Sell placements on your site, without chasing buyers.',
    intro:
      'Press Parrot puts your site in front of agencies and in-house teams who are already buying. You set the price, you keep publishing what you publish, and we bring you the orders.',
    primaryCta: 'Send us your site',
    benefits:
      'Free to be listed\nYou set your own price\nA person reads every submission',
  },

  criteria: {
    heading: 'What happens when you send us a site',
    intro:
      'Nothing is automatic, and nothing about your site is taken on trust - in either direction.',
    points:
      'We look the site up ourselves. Domain rating, traffic and referring domains come from Ahrefs and Majestic, so there is nothing for you to prove in the form.\nA person reads every submission. No model decides whether a site is listed.\nWhat you quote is what we pay you. What we charge a buyer is a separate decision and does not change it.\nIf we already list your site, your message reaches the same place and we treat it as a price you are changing.',
  },

  steps: {
    heading: 'Three steps',
    items: [
      {
        heading: 'Send us the site and your price',
        description:
          'The form takes a minute. The price is what you want per placement - leave it out if you would rather talk about it first.',
      },
      {
        heading: 'We look it up and read it',
        description:
          'We pull the metrics ourselves and somebody here reads what you sent. If we need anything else, we reply to the address you gave us.',
      },
      {
        heading: 'Orders come to you',
        description:
          'If the site is listed, buyers choose it from the marketplace and we come to you with the article and the link. You publish it.',
      },
    ],
  },

  offer: {
    heading: 'Send us your site',
    intro:
      'One site per submission. If you run several, send the first and tell us about the others in the box at the bottom.',
    reassurance:
      'We reply to the address you give us. Your price and your details are never shown to buyers.',
  },

  faqs: {
    items: [
      {
        question: 'Does it cost anything to be listed?',
        answer:
          'No. There is no listing fee and no subscription. We make our money on the difference between what a buyer pays and what we pay you, which is why the price you quote is the price we work from.',
      },
      {
        question: 'Do I have to accept every order?',
        answer:
          'No. Anything that does not fit your site is something you can turn down, and telling us what you will not take - topics, anchor text, anything else - saves us both the round trip. Put it in the box at the bottom of the form.',
      },
      {
        question: 'What happens if a published link comes down?',
        answer:
          'We check placements for as long as our guarantee to the buyer runs, and a link that disappears raises a claim. You hear about it first and get a window to put it back before the buyer is offered a replacement or a refund - the point of the window is that a site migration is not a broken promise.',
      },
      {
        question: 'Can I change my price later?',
        answer:
          'Yes. Send the site again with the new price and say so in the box. It reaches the same queue, and we can see that we already list you.',
      },
    ],
  },

  seo: {
    metaTitle: 'List your site on Press Parrot',
    metaDescription:
      'Sell guest posts and niche edits on your website. Free to be listed, you set the price, and a person reads every submission.',
  },
};
