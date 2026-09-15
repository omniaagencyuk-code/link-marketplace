import { serviceSections } from './service-page-schema';
import type { PageDef, PageValues } from '../types';

export const definition: PageDef = {
  slug: 'link-building-agencies',
  label: 'For agencies',
  path: '/link-building-agencies',
  description: 'Service page targeting SEO agencies running links across many clients.',
  sections: serviceSections(),
};

export const defaults: PageValues = {
  hero: {
    eyebrow: 'For SEO agencies',
    title: 'Built to Scale With SEO Agencies',
    intro:
      'Running links for a dozen clients is a different problem from running links for one. Press Parrot gives agencies a single marketplace, consistent pricing and one place to track every order across every account.',
    primaryCta: { label: 'Create Agency Account', href: '/signup' },
    secondaryCta: { label: 'How It Works', href: '/how-it-works' },
    microcopy: 'Free account · No subscription · Pay only for what you order',
  },

  highlights: {
    items: [
      {
        title: 'Multiple clients',
        body: 'Keep campaigns separate while working from one marketplace and one login.',
      },
      {
        title: 'Consistent pricing',
        body: 'The same price for the same site every time, so you can quote a retainer without guessing.',
      },
      {
        title: 'Centralised orders',
        body: 'Every placement and article in one queue, with status and live URLs against each.',
      },
      {
        title: 'One relationship',
        body: 'One account and one invoice rather than forty publisher relationships to manage.',
      },
    ],
  },

  preview: {
    heading: 'One marketplace across every client',
    body: 'The same vetted inventory and the same prices for every campaign you run, so margins are predictable. Publisher names are visible once you have a free account.',
  },

  body: {
    sections: [
      {
        heading: 'Why link building breaks down at agency scale',
        content: `The work that is merely tedious for one site becomes genuinely unmanageable across twelve. Every client needs its own shortlist, its own anchors, its own content and its own reporting, and each publisher relationship has to be maintained separately.

Most agencies end up with a spreadsheet, a shared inbox and a quiet dependency on whoever remembers which supplier quoted what. It works until that person is on holiday.

- Separate shortlists, anchors and content per client
- Prices that move between suppliers and between quotes
- Placement tracking spread across spreadsheets and inboxes
- Invoices from a different supplier for every campaign`,
      },
      {
        heading: 'What running campaigns here looks like',
        content: `One marketplace covers every client. Filter to the sites that fit a campaign, order the placements, add content where you need it, and track everything through to live URLs from one queue.

Because prices are fixed and visible, you can build a retainer around known costs rather than reconciling quotes after the fact.`,
      },
      {
        heading: 'Content production alongside placements',
        content: `Content is usually the bottleneck at agency volume. You can order [articles](/content-writing) through the same account, either attached to a placement or entirely on their own, briefed against the keyword and target page you are working on.

That keeps one supplier relationship for both halves of the job, and the brief, the draft and the placement stay in one place.`,
      },
      {
        heading: 'What we are building next for agencies',
        content: `Client workspaces, per-client reporting and user seats for your team are on the roadmap rather than live today. The data model already separates orders, content and accounts so these can be added without disturbing campaigns you are already running.

If you are evaluating Press Parrot for a specific agency workflow, tell us what you need and we will be straight with you about what exists now and what does not.`,
      },
    ],
  },

  faqs: {
    items: [
      {
        question: 'Can SEO agencies use Press Parrot?',
        answer:
          'Yes. Agencies are a large part of who the marketplace is built for. You can run campaigns for multiple clients from one account, with consistent pricing and a single order queue.',
      },
      {
        question: 'Do you offer agency or volume pricing?',
        answer:
          'Marketplace prices are the same for everyone, which is what makes them predictable to quote from. Talk to us if you are placing at significant volume and we will discuss terms.',
      },
      {
        question: 'Can I add my team to one account?',
        answer:
          'Not yet. Multiple user seats and per-client workspaces are on the roadmap; today an agency works from a single account.',
      },
      {
        question: 'Can you white label reporting for clients?',
        answer:
          'Not currently. Order data and live URLs are available in your dashboard, and client-facing reporting is something we are working towards rather than something we offer today.',
      },
    ],
  },

  related: {
    items: [
      { label: 'Link building', href: '/link-building', description: 'How the service works.' },
      { label: 'Content writing', href: '/content-writing', description: 'Content at campaign volume.' },
      { label: 'Pricing', href: '/pricing', description: 'What placements cost.' },
      { label: 'Marketplace', href: '/marketplace', description: 'See the inventory.' },
    ],
  },

  cta: {
    heading: 'Start building links that hold up',
    body: 'Create a free account, open the marketplace and order your first placement today.',
    primaryCta: { label: 'Create Free Account', href: '/signup' },
    secondaryCta: { label: 'See pricing', href: '/pricing' },
  },

  seo: {
    metaTitle: 'Link building for SEO agencies',
    metaDescription:
      'Link building built for SEO agencies: one marketplace for every client, consistent pricing, centralised orders, content production and a single invoice.',
    ogImage: { src: '', alt: '' },
  },
};
