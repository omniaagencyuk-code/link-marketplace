import type { FaqItem } from '@/components/shared/faq';

/**
 * Homepage FAQ.
 *
 * Every answer is deliberately specific and honest about what the platform
 * does and does not do - both because that converts better and because FAQ
 * structured data is only appropriate where the answer genuinely appears on
 * the page.
 */
export const homepageFaqs: FaqItem[] = [
  {
    question: 'What is link building?',
    answer:
      'Link building is the process of getting other websites to link to yours. Search engines treat a link as a signal that a page is worth surfacing, so relevant links from credible sites can improve how well your pages rank.',
  },
  {
    question: 'How does Press Parrot work?',
    answer:
      'Create a free account, open the marketplace, and filter thousands of vetted publishers by niche, country, domain rating, traffic, turnaround and price. Add the ones you want to an order, supply your target URL and anchor text, add content if you need it, and track the order through to a live URL.',
  },
  {
    question: 'Can I see the websites before ordering?',
    answer:
      'Yes, once you have an account. Browsing is free and unlimited after signing up, which takes about a minute. We keep publisher names behind an account so the inventory is not scraped and republished elsewhere, which is also how our publishers prefer it.',
  },
  {
    question: 'How much does link building cost?',
    answer:
      'It depends on the publisher, mostly according to authority, traffic and niche. Each listing shows its own price before you order. There is no subscription and no minimum spend, so you can start with one placement.',
  },
  {
    question: 'Do I need a subscription?',
    answer:
      'No. Accounts are free and you pay only for the placements and content you order.',
  },
  {
    question: 'Are the websites vetted?',
    answer:
      'Every site is reviewed by a person before it is listed. We check that organic traffic is real and reasonably distributed, that the site publishes genuine editorial content, that its pages are indexed, and that its outbound link profile is sensible. Sites that fail are not listed.',
  },
  {
    question: 'Can I order content without buying a backlink?',
    answer:
      'Yes. Content writing is a standalone service. You can order SEO articles, blog posts, guest posts, landing pages or website copy without buying any placement.',
  },
  {
    question: 'Do you offer guest posts?',
    answer:
      'Yes. Guest posts place a contextual link inside a new article published on a relevant site. You choose the publisher, and you can supply the article or order the writing from us.',
  },
  {
    question: 'Do you offer niche edits?',
    answer:
      'Yes. Niche edits add your link to an article that is already published and indexed, which is usually faster than commissioning a new piece.',
  },
  {
    question: 'Can SEO agencies use Press Parrot?',
    answer:
      'Yes. Agencies can run campaigns for multiple clients from one account, with the same marketplace and the same prices across every campaign. Per-client workspaces and multiple user seats are on the roadmap rather than live today.',
  },
  {
    question: 'How long does a placement take?',
    answer:
      'Most placements go live within a few days to a couple of weeks, depending on the publisher. Each listing shows its own typical turnaround before you order, so you can plan around it.',
  },
];
