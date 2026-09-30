import { serviceSections } from './service-page-schema';
import type { PageDef, PageValues } from '../types';

/**
 * /buy-backlinks
 *
 * The page for the most commercial search in this business, and the one that
 * did not exist: every internal link to it was a link to nothing.
 *
 * Its shape is the shared service schema, so it is the same object as
 * /guest-posts and /niche-edits and is edited the same way. What is its own is
 * the copy, and the copy has a job the other service pages do not: somebody
 * searching "buy backlinks" is usually deciding whether buying links is a
 * sensible thing to do at all, not only where to do it. A page that opens by
 * selling is a page they leave.
 *
 * So it answers the question first - what buying a link actually is, when it
 * works, when it does not, and what the risk is - and sells second. That is a
 * commercial decision as much as an editorial one: the alternative is ranking
 * for a term whose searchers bounce.
 */
export const definition: PageDef = {
  slug: 'buy-backlinks',
  label: 'Buy backlinks',
  path: '/buy-backlinks',
  description: 'Service page targeting "buy backlinks" and related commercial terms.',
  sections: serviceSections(),
};

export const defaults: PageValues = {
  hero: {
    eyebrow: 'Buy backlinks',
    title: 'Buy Backlinks From Websites With Real Readers',
    intro:
      'Choose the publisher yourself, see its traffic and its price before you commit, and pay for the placements you want. No packages, no subscription, and nothing listed that we would not use ourselves.',
    primaryCta: { label: 'Browse Websites', href: '/marketplace' },
    secondaryCta: { label: 'Create Free Account', href: '/signup' },
    microcopy: 'Free account · No subscription · Pay only for what you order',
  },

  highlights: {
    items: [
      {
        title: 'You pick the site',
        body: 'Every listing shows its domain rating, traffic, country and price. You decide what is worth buying rather than trusting a tier.',
      },
      {
        title: 'Priced per placement',
        body: 'One price per website, shown before you order. Regulated topics are priced by the publisher and shown at their own rate.',
      },
      {
        title: 'Checked before listing',
        body: 'Real organic traffic, genuine editorial content, and a sensible outbound link profile. Sites that fail are not listed cheaply — they are not listed.',
      },
      {
        title: 'Content optional',
        body: 'Supply your own article or add writing to the same order. Either way the link sits inside the piece rather than beside it.',
      },
    ],
  },

  preview: {
    heading: 'See the metrics before you buy, not after',
    body:
      'Filter by niche, country, domain rating, traffic and price until the shortlist fits the campaign. Publisher names appear once you have a free account — the metrics and pricing are visible either way.',
  },

  body: {
    sections: [
      {
        heading: 'What "buying a backlink" actually means',
        content: `In practice it means paying a website to publish something that links to you — either a new article you or we write, or a link added to a piece they have already published. The money buys the publisher's time and their space. It does not buy a ranking, and anybody selling you one is selling something they cannot deliver.

That distinction matters more than it sounds. A link is a signal among many, and its value depends almost entirely on where it sits: a relevant site with real readers, in a sentence that makes sense without the link, is worth a great deal more than the same money spent on ten sites nobody visits.`,
      },
      {
        heading: 'Is buying backlinks against Google\'s guidelines?',
        content: `Paying for links that pass ranking signals is against Google's spam policies. That is a straightforward statement of fact and any page telling you otherwise is not worth reading further.

What the industry does in response is a spectrum. At one end, sites disclose paid placements properly with a sponsored or nofollow attribute, which is compliant and passes no ranking signal. At the other, links are bought at scale from sites that exist to sell them, which is the pattern detection systems are built to find.

Most of what actually happens sits in between: relevant, editorially reviewed placements on sites that publish other things too, indistinguishable from a link earned by asking nicely. The risk is real but it is proportional to how obviously manufactured the pattern looks — a handful of relevant placements a month on sites with genuine audiences is a different risk profile from four hundred on sites without.

We are not going to pretend there is no risk here. What we can do is make the inputs visible: every listing states whether links are dofollow and whether a sponsored tag is applied, so the decision is yours and it is an informed one.`,
      },
      {
        heading: 'When buying links is worth it, and when it is not',
        content: `It tends to be worth it when a page is genuinely competitive and genuinely good, and the only thing missing is that nobody knows it exists. New service pages, commercial terms where the incumbents have a decade of links, and subjects your site has no authority on yet.

It tends not to be worth it when the page is not ready. A link pointing at a thin page does not make it a good page; it makes it a thin page with a link. The same budget spent on making the page worth linking to will usually do more.

- Worth it: a strong page in a competitive space with no links pointing at it
- Worth it: establishing relevance in a subject your site has not covered before
- Not worth it: a page that would not rank even if it had the links
- Not worth it: volume for its own sake, on anything you would not read`,
      },
      {
        heading: 'How to choose which sites to buy from',
        content: `Use the metrics to narrow thousands of sites to a shortlist, then spend ten minutes on the shortlist. That order round is what saves money.

Rule out anything with no organic traffic whatever its domain rating, anything whose audience is in countries you do not sell in, and anything whose traffic has fallen sharply in the last year. Of what is left, prefer sites that genuinely cover your subject — relevance is what every other metric is a proxy for.

Then open two recent articles and count the outbound commercial links. One or two in a long piece is normal editorial behaviour; seven is a page that exists to sell links, and a link on it is worth what you would expect.

[Our guide to link building metrics](/link-building-metrics) goes through each figure, what it is good for, and what it cannot tell you.`,
      },
      {
        heading: 'What a placement costs',
        content: `Price follows the publisher, not a tier. A site with strong traffic in a competitive niche costs more than a smaller one, and regulated subjects — gambling, finance, CBD, adult — cost more again because fewer publishers accept them and the ones that do charge accordingly.

Every listing shows its own price before you order, including for regulated topics. There is no package, no minimum and no monthly commitment: you pay for the placements you choose.

Guest posts and [niche edits](/niche-edits) are priced separately on each listing, because they are different amounts of work for the publisher.`,
      },
    ],
  },

  faqs: {
    items: [
      {
        question: 'Is it safe to buy backlinks?',
        answer:
          'Paying for links that pass ranking signals is against Google\'s spam policies, and we are not going to tell you otherwise. The practical risk depends on how manufactured the pattern looks: relevant placements on sites with real audiences, at a sensible pace, carry a different risk from bulk buying on sites that exist to sell links. Every listing states its link policy so you can decide.',
      },
      {
        question: 'How much does a backlink cost?',
        answer:
          'It depends on the publisher. Each listing shows its own price before you order, and regulated topics such as gambling or finance are priced by the publisher at their own rate rather than at a markup on a standard price.',
      },
      {
        question: 'Do I have to write the article?',
        answer:
          'No. Supply your own, or add content writing to the same order and our team will write it to the publisher\'s requirements.',
      },
      {
        question: 'Will the links be dofollow?',
        answer:
          'Each listing states its own link policy, including whether links are dofollow and whether a sponsored tag is applied. You know before ordering rather than after.',
      },
      {
        question: 'How many backlinks should I buy?',
        answer:
          'Fewer than most people expect, and chosen more carefully. A handful of relevant placements on sites with genuine readers will usually outperform a much larger number on sites without, and costs less to boot.',
      },
      {
        question: 'How long before a bought link affects rankings?',
        answer:
          'The link goes live in days to a couple of weeks depending on the publisher. Any effect on rankings takes longer and depends on the page, the competition and the rest of your profile. Anyone offering you a timeline is guessing.',
      },
    ],
  },

  related: {
    items: [
      { label: 'Guest posts', href: '/guest-posts', description: 'Articles written for you and published on someone else\'s site.' },
      { label: 'Niche edits', href: '/niche-edits', description: 'Links added to articles that already exist and already rank.' },
      { label: 'Link building metrics', href: '/link-building-metrics', description: 'What each figure on a listing means.' },
      { label: 'Pricing', href: '/pricing', description: 'How placements are priced.' },
    ],
  },

  cta: {
    heading: 'See what is available in your niche',
    body: 'Create a free account and filter thousands of publishers by traffic, relevance and price.',
    primaryCta: { label: 'Browse Websites', href: '/marketplace' },
    secondaryCta: { label: 'Create Free Account', href: '/signup' },
  },

  seo: {
    metaTitle: 'Buy Backlinks From Websites With Real Traffic',
    metaDescription:
      'Choose the publisher, see its traffic and price before you order, and pay per placement. What buying links actually involves, when it works, and what it costs.',
  },
};
