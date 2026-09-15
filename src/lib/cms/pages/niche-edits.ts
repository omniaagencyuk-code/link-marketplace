import { serviceSections } from './service-page-schema';
import type { PageDef, PageValues } from '../types';

export const definition: PageDef = {
  slug: 'niche-edits',
  label: 'Niche edits',
  path: '/niche-edits',
  description: 'Service page targeting "niche edits" and "link insertions".',
  sections: serviceSections(),
};

export const defaults: PageValues = {
  hero: {
    eyebrow: 'Niche edits',
    title: 'Niche Edits on Pages That Are Already Working',
    intro:
      'Add a contextual link to an article that has already been published, indexed and read. Faster than commissioning a new piece, and the page carrying your link has history behind it.',
    primaryCta: { label: 'Get Started Free', href: '/signup' },
    secondaryCta: { label: 'How It Works', href: '/how-it-works' },
    microcopy: 'Free account · No subscription · Pay only for what you order',
  },

  highlights: {
    items: [
      {
        title: 'Quicker than a guest post',
        body: 'No article to commission or approve, so most niche edits move faster than a placement that starts from a blank page.',
      },
      {
        title: 'Pages with history',
        body: 'Your link lands on an article that is already indexed rather than one waiting to be discovered.',
      },
      {
        title: 'Contextual placement',
        body: 'The link goes into the body of the article, in a sentence where it belongs.',
      },
      {
        title: 'Good for existing pages',
        body: 'Useful when a page is already ranking and needs support rather than an introduction.',
      },
    ],
  },

  preview: {
    heading: 'Established pages, filtered on real metrics',
    body: 'Search by domain rating, traffic, niche and country. Publisher names are visible once you have a free account.',
  },

  body: {
    sections: [
      {
        heading: 'What a niche edit is',
        content: `A niche edit, sometimes called a link insertion, adds your link into an article that a publisher has already published. The article exists, it is indexed, and in many cases it already receives traffic. What changes is that one sentence now carries a link to your page.

Because nothing has to be written and approved from scratch, the process is shorter. Because the page already has some standing, the link is not starting from zero.`,
      },
      {
        heading: 'When to choose a niche edit over a guest post',
        content: `Niche edits work best when the supporting context already exists somewhere. If a publisher has an article covering your subject and your page genuinely adds to it, an insertion is the natural and faster option.

A [guest post](/guest-posts) is the better choice when the argument you need does not exist yet, when you want control over the whole piece, or when the target page needs a substantial introduction rather than a mention.

- The relevant article already exists on the publisher's site
- You want a shorter turnaround
- The target page is established and needs reinforcement
- A full article would be more context than the link warrants`,
      },
      {
        heading: 'What to check before buying one',
        content: `Look at the article itself, not only the domain. An insertion into a page with no traffic, on a site whose authority is concentrated elsewhere, is worth much less than the domain rating suggests.

It is also worth checking how many outbound links the article already carries. A page that has been sold repeatedly passes less value and looks less natural than one that has been edited sparingly.

- Is the host article relevant to your page, not just the site?
- Is the article itself indexed and receiving traffic?
- How many commercial outbound links does it already carry?
- Does the sentence around the link make sense?`,
      },
      {
        heading: 'How anchors work in a niche edit',
        content: `Since the sentence already exists, the anchor has to fit the text rather than the other way round. That is usually a good constraint: it pushes anchors toward phrases that read naturally instead of exact-match terms bolted into a sentence that does not want them.

You supply a preferred anchor when you order, and where the existing wording will not carry it, we will confirm an alternative with you before anything is published.`,
      },
    ],
  },

  faqs: {
    items: [
      {
        question: 'Do you offer niche edits?',
        answer:
          'Yes. Niche edits sit alongside guest posts and digital PR in the marketplace, with the same vetting, metrics and upfront pricing.',
      },
      {
        question: 'Are niche edits cheaper than guest posts?',
        answer:
          'Often, because no article has to be written, but it depends on the publisher. Each listing shows its own price for each placement type before you order.',
      },
      {
        question: 'Can I choose which article my link goes into?',
        answer:
          'You can tell us the target page, the anchor you would like and any preferences about the host article. We confirm the specific article with you before the edit is made.',
      },
      {
        question: 'How quickly do niche edits go live?',
        answer:
          'Usually faster than guest posts, since there is no article to commission. The typical turnaround is shown on each listing.',
      },
    ],
  },

  related: {
    items: [
      { label: 'Guest posts', href: '/guest-posts', description: 'New articles built around your link.' },
      { label: 'Link building', href: '/link-building', description: 'How the whole service fits together.' },
      { label: 'Digital PR', href: '/digital-pr', description: 'Editorial coverage and commentary.' },
      { label: 'Pricing', href: '/pricing', description: 'What placements cost.' },
    ],
  },

  cta: {
    heading: 'Start building links that hold up',
    body: 'Create a free account, open the marketplace and order your first placement today.',
    primaryCta: { label: 'Create Free Account', href: '/signup' },
    secondaryCta: { label: 'See pricing', href: '/pricing' },
  },

  seo: {
    metaTitle: 'Niche edits',
    metaDescription:
      'Buy niche edits on vetted websites. Add a contextual link to an article that is already published and indexed, with transparent metrics and upfront pricing.',
    ogImage: { src: '', alt: '' },
  },
};
