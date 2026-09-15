import { image, link, list, richtext, section, text, textarea } from '../fields';
import type { PageDef, PageValues } from '../types';

/**
 * The homepage.
 *
 * The largest editable page by some distance, so the sections are named after
 * what a reader sees rather than after the component that renders them - an
 * editor looking for "the four steps" should not have to know it is called
 * HowItWorks.
 *
 * Icons, the mascot artwork and the niche grid stay in code. The niche grid in
 * particular is generated from live marketplace counts, so it is data rather
 * than copy.
 */

export const definition: PageDef = {
  slug: 'home',
  label: 'Homepage',
  path: '/',
  description: 'The main SEO and conversion page for the whole business.',
  sections: [
    section(
      'hero',
      'Hero',
      [
        text('eyebrow', 'Eyebrow', { maxLength: 80 }),
        text('titleLine1', 'Headline, first line', { maxLength: 60 }),
        text('titleLine2', 'Headline, second line', { maxLength: 60 }),
        text('titleAccent', 'Headline, highlighted line', {
          maxLength: 60,
          help: 'Rendered in Press Parrot green.',
        }),
        textarea('intro', 'Intro paragraph', { rows: 4, maxLength: 400 }),
        link('primaryCta', 'Primary button'),
        link('secondaryCta', 'Secondary button'),
        list('reassurance', 'Ticks under the buttons', [text('label', 'Text', { maxLength: 60 })], {
          itemLabelKey: 'label',
          maxItems: 4,
        }),
        text('annotation', 'Handwritten note', {
          maxLength: 60,
          help: 'The scribble beside the parrot. Use a line break by typing two lines.',
        }),
      ],
      'The first screen, with the mascot and the redacted marketplace preview.',
    ),

    section(
      'metrics',
      'Trust numbers',
      [
        list(
          'items',
          'Numbers',
          [text('value', 'Value', { maxLength: 24 }), text('label', 'Label', { maxLength: 40 })],
          { itemLabelKey: 'label', minItems: 2, maxItems: 4 },
        ),
      ],
      'The row of four figures under the hero. Only claim numbers you can stand behind.',
    ),

    section(
      'marketplace',
      'Marketplace preview',
      [
        text('eyebrow', 'Eyebrow', { maxLength: 60 }),
        text('heading', 'Heading', { maxLength: 120 }),
        textarea('body', 'Supporting copy', { rows: 4, maxLength: 500 }),
        link('cta', 'Button'),
        text('ctaCaption', 'Caption under the button', { maxLength: 120 }),
      ],
      'Wraps the redacted table. The rows and the counts are generated from live data - they never show real domains.',
    ),

    section(
      'services',
      'Services',
      [
        text('heading', 'Heading', { maxLength: 120 }),
        textarea('intro', 'Intro', { rows: 3, maxLength: 300 }),
        list(
          'items',
          'Service cards',
          [
            text('title', 'Title', { maxLength: 40 }),
            textarea('body', 'Description', { rows: 3, maxLength: 240 }),
            link('cta', 'Link'),
          ],
          { itemLabelKey: 'title', minItems: 2, maxItems: 4 },
        ),
      ],
      'The four service cards. Designed for four; icons are fixed in code.',
    ),

    section(
      'why',
      'Why Press Parrot',
      [
        text('heading', 'Heading', { maxLength: 120 }),
        textarea('body', 'Supporting copy', { rows: 5, maxLength: 600 }),
        text('annotation', 'Handwritten note', { maxLength: 40 }),
        link('cta', 'Button'),
        text('oldHeading', 'Left column heading', { maxLength: 40 }),
        list('oldWay', 'Doing it yourself', [text('label', 'Item', { maxLength: 80 })], {
          itemLabelKey: 'label',
          maxItems: 12,
        }),
        text('newHeading', 'Right column heading', { maxLength: 40 }),
        list('newWay', 'With Press Parrot', [text('label', 'Item', { maxLength: 80 })], {
          itemLabelKey: 'label',
          maxItems: 12,
        }),
      ],
      'The comparison between doing it yourself and using the platform.',
    ),

    section(
      'features',
      'Platform features',
      [
        text('heading', 'Heading', { maxLength: 120 }),
        textarea('intro', 'Intro', { rows: 3, maxLength: 300 }),
        list(
          'items',
          'Features',
          [
            text('title', 'Title', { maxLength: 40 }),
            textarea('body', 'Description', { rows: 3, maxLength: 240 }),
            text('comingSoon', 'Coming soon?', {
              maxLength: 3,
              help: 'Type "yes" to show a Coming soon badge. Never list something as built when it is not.',
            }),
          ],
          { itemLabelKey: 'title', maxItems: 12 },
        ),
      ],
      'What the platform does. Anything not built yet must carry the Coming soon badge.',
    ),

    section(
      'steps',
      'How it works',
      [
        text('eyebrow', 'Eyebrow', { maxLength: 60 }),
        text('heading', 'Heading', { maxLength: 120 }),
        list(
          'items',
          'Steps',
          [
            text('number', 'Number', { maxLength: 4 }),
            text('title', 'Title', { maxLength: 60 }),
            textarea('description', 'Description', { rows: 3, maxLength: 240 }),
          ],
          { itemLabelKey: 'title', minItems: 2, maxItems: 6 },
        ),
      ],
      'The four steps with the flight path between them.',
    ),

    section(
      'agencies',
      'For agencies',
      [
        text('eyebrow', 'Eyebrow', { maxLength: 60 }),
        text('heading', 'Heading', { maxLength: 120 }),
        textarea('body', 'Supporting copy', { rows: 4, maxLength: 500 }),
        link('primaryCta', 'Primary button'),
        link('secondaryCta', 'Secondary button'),
        list('items', 'Points', [text('label', 'Point', { maxLength: 60 })], {
          itemLabelKey: 'label',
          maxItems: 8,
        }),
      ],
      'The agency band. The six points are designed for a two-column grid.',
    ),

    section(
      'editorial',
      'Link building, explained',
      [
        text('eyebrow', 'Eyebrow', { maxLength: 60 }),
        text('heading', 'Heading', { maxLength: 140 }),
        list(
          'articles',
          'Articles',
          [
            text('id', 'Anchor id', {
              maxLength: 60,
              help: 'Used for the contents links, e.g. what-is-link-building. Lowercase, hyphens only.',
            }),
            text('heading', 'Heading', { maxLength: 120 }),
            richtext('content', 'Content', {
              rows: 8,
              help: 'Markdown. [text](/page) for an internal link - these are worth getting right.',
            }),
          ],
          { itemLabelKey: 'heading', maxItems: 12 },
        ),
      ],
      'The editorial section. This is the substantial public content search engines read most closely.',
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
          { itemLabelKey: 'question', maxItems: 20 },
        ),
      ],
      'Shown on the page and published as FAQ structured data. Only add questions genuinely answered here.',
    ),

    section(
      'finalCta',
      'Closing call to action',
      [
        text('heading', 'Heading', { maxLength: 120 }),
        textarea('body', 'Supporting copy', { rows: 3, maxLength: 300 }),
        link('primaryCta', 'Primary button'),
        link('secondaryCta', 'Secondary button'),
        text('annotation', 'Handwritten note', { maxLength: 40 }),
      ],
      'The dark green band at the bottom of the page.',
    ),

    section(
      'seo',
      'Search engine listing',
      [
        text('metaTitle', 'Meta title', { maxLength: 70 }),
        textarea('metaDescription', 'Meta description', { rows: 3, maxLength: 170 }),
        image('ogImage', 'Social share image'),
      ],
      'How the homepage appears in search results and when shared.',
    ),
  ],
};

export const defaults: PageValues = {
  hero: {
    eyebrow: 'Smarter link building. Better SEO. No squawk.',
    titleLine1: 'Link Building',
    titleLine2: 'Services Built for',
    titleAccent: 'Better Rankings',
    intro:
      'Build high quality backlinks through thousands of vetted publishers. Search by SEO metrics, order content, manage placements and track everything from one platform.',
    primaryCta: { label: 'Get Started Free', href: '/signup' },
    secondaryCta: { label: 'How It Works', href: '/how-it-works' },
    reassurance: [
      { label: 'Free account' },
      { label: 'No subscription' },
      { label: 'Pay only for what you order' },
    ],
    annotation: 'Good links\nget you places.',
  },

  metrics: {
    items: [
      { value: '5,000+', label: 'vetted websites' },
      { value: '20+', label: 'niches' },
      { value: '50+', label: 'countries' },
      { value: '24-72 hours', label: 'average turnaround' },
    ],
  },

  marketplace: {
    eyebrow: 'The marketplace',
    heading: 'Thousands of Link Building Opportunities in One Place',
    body: 'Registered customers search thousands of publishers on the metrics that matter, then order guest posts, niche edits and digital PR in a few clicks. No outreach, no negotiation and no waiting on a quote.',
    cta: { label: 'Unlock the Marketplace', href: '/marketplace' },
    ctaCaption: 'Create a free account to browse publishers and pricing.',
  },

  services: {
    heading: 'Everything You Need to Build Better Links',
    intro:
      'From content to placements, Press Parrot gives you the tools, services and support to rank higher.',
    items: [
      {
        title: 'Guest Posts',
        body: 'Get contextual backlinks through original articles published on relevant websites.',
        cta: { label: 'Explore Guest Posts', href: '/guest-posts' },
      },
      {
        title: 'Niche Edits',
        body: 'Add contextual links to relevant existing content on established websites.',
        cta: { label: 'Explore Niche Edits', href: '/niche-edits' },
      },
      {
        title: 'Content Writing',
        body: 'Order SEO-focused articles, guest posts and website content from our writing team.',
        cta: { label: 'Order Content', href: '/content-writing' },
      },
      {
        title: 'Digital PR',
        body: 'Build brand visibility and authority through editorial coverage and digital PR opportunities.',
        cta: { label: 'Explore Digital PR', href: '/digital-pr' },
      },
    ],
  },

  why: {
    heading: 'Link Building Without the Endless Outreach',
    body: 'Most of a link building budget is not spent on links. It is spent on coordination: finding sites, qualifying them, tracking down editors, agreeing prices and chasing people who never reply.\n\nWe handle the publisher wrangling. You build the rankings.',
    annotation: 'We do the squawking.',
    cta: { label: 'Get Started Free', href: '/signup' },
    oldHeading: 'Doing it yourself',
    oldWay: [
      { label: 'Finding websites that are actually relevant' },
      { label: 'Checking whether the metrics are real' },
      { label: 'Hunting down a contact who can publish' },
      { label: 'Negotiating a price with no benchmark' },
      { label: 'Chasing publishers who have gone quiet' },
      { label: 'Writing content to someone else’s rules' },
      { label: 'Following up, again' },
      { label: 'Tracking which links went live where' },
      { label: 'Reconciling invoices from a dozen suppliers' },
    ],
    newHeading: 'With Press Parrot',
    newWay: [
      { label: 'Every publisher vetted before it is listed' },
      { label: 'Domain rating, traffic and referring domains on every listing' },
      { label: 'No outreach - the publisher has already agreed' },
      { label: 'One fixed price, shown before you order' },
      { label: 'Order status you can actually see' },
      { label: 'Content written to the publisher’s requirements' },
      { label: 'Live URLs returned against each order' },
      { label: 'One account, one invoice' },
    ],
  },

  features: {
    heading: 'One platform for the whole job',
    intro:
      'Finding publishers is only part of it. These are the pieces that keep a campaign moving once it starts.',
    items: [
      {
        title: 'Hand vetted publishers',
        body: 'Traffic quality, outbound link patterns, indexation and editorial standards all checked before a site is listed.',
        comingSoon: '',
      },
      {
        title: 'Transparent SEO metrics',
        body: 'Domain rating, organic traffic, referring domains and audience geography shown on every listing.',
        comingSoon: '',
      },
      {
        title: 'Upfront pricing',
        body: 'One price per placement, visible before you order. No enquiry forms and no negotiation.',
        comingSoon: '',
      },
      {
        title: 'Fast turnaround',
        body: 'Each listing states its own typical turnaround, so a campaign can be planned rather than guessed at.',
        comingSoon: '',
      },
      {
        title: 'Order management',
        body: 'Every placement tracked from brief to live URL, with status against each item in one queue.',
        comingSoon: '',
      },
      {
        title: 'Content writing',
        body: 'Order articles alongside a placement or entirely on their own, briefed against your keyword and target page.',
        comingSoon: '',
      },
      {
        title: 'Single billing',
        body: 'One account and one invoice instead of a separate supplier relationship for every publisher.',
        comingSoon: 'yes',
      },
      {
        title: 'Campaign management',
        body: 'Group orders by client or project, with per-campaign reporting and user seats for your team.',
        comingSoon: 'yes',
      },
    ],
  },

  steps: {
    eyebrow: 'How Press Parrot works',
    heading: 'From Search to Live Link',
    items: [
      {
        number: '01',
        title: 'Create Your Free Account',
        description: 'Unlock the Press Parrot marketplace.',
      },
      {
        number: '02',
        title: 'Find the Right Websites',
        description:
          'Filter publishers by niche, country, DR, traffic, pricing and other SEO metrics.',
      },
      {
        number: '03',
        title: 'Place Your Order',
        description:
          'Choose your placement, provide your URL and anchor text and add content if required.',
      },
      {
        number: '04',
        title: 'Track Your Links',
        description: 'Follow your order through publication and receive the live URL when complete.',
      },
    ],
  },

  agencies: {
    eyebrow: 'For SEO agencies',
    heading: 'Built to Scale With SEO Agencies',
    body: 'Running links for a dozen clients is a different problem from running links for one. One marketplace, one set of prices and one order queue across every account you manage.',
    primaryCta: { label: 'Create Agency Account', href: '/signup' },
    secondaryCta: { label: 'Read more', href: '/link-building-agencies' },
    items: [
      { label: 'Multiple clients from one account' },
      { label: 'Consistent prices you can quote from' },
      { label: 'Centralised orders and tracking' },
      { label: 'One marketplace, not forty suppliers' },
      { label: 'Content production at campaign volume' },
      { label: 'A single invoice' },
    ],
  },

  editorial: {
    eyebrow: 'Link building, explained',
    heading: 'What we have learned about building links that last',
    articles: [
      {
        id: 'what-is-link-building',
        heading: 'What is link building?',
        content: `Link building is the work of getting other websites to link to yours. A link is a recommendation of sorts: someone thought a page was worth pointing their readers at. Search engines have used that signal since the beginning, and despite everything that has changed around it, they still do.

In practice it covers several different activities. Earning coverage because you published something worth covering. Writing for someone else's audience in exchange for a mention. Getting a relevant page updated to reference yours. They differ in effort, cost and speed, but the intent is the same: a credible page, on a relevant site, pointing at yours.`,
      },
      {
        id: 'why-link-building-matters',
        heading: 'Why link building still matters for SEO',
        content: `Every few years the industry announces that links are finished. They are not, and the reason is fairly mundane: search engines need some way to judge whether a page deserves to outrank a similar one, and links remain one of the few signals that is difficult to manufacture at scale without it being obvious.

What has changed is the tolerance for low quality. Volume alone stopped working a long time ago. A hundred links from sites nobody reads will do less than a handful from places that genuinely cover your subject, and may do harm if the pattern is blatant enough.

The practical upshot is that link building has become more like publishing and less like procurement. Fewer links, better chosen, on pages worth linking to.`,
      },
      {
        id: 'high-quality-backlink',
        heading: 'What makes a high quality backlink?',
        content: `Relevance first. A link from a mid-sized site that actually covers your industry generally does more than one from a larger site with no connection to it. Topical fit is what makes a link look earned rather than bought.

Then look past the headline authority score. Domain rating and similar metrics are third-party estimates, and they can be inflated deliberately. Real organic traffic, distributed across a reasonable number of pages, is much harder to fake.

Finally, the placement itself. A link inside the body of an article, in a sentence that would make sense without it, carries more weight than one in a footer, an author bio or a block of links at the end of a post. And the page carrying it should be indexed and plausibly read by somebody.`,
      },
      {
        id: 'guest-posts-vs-niche-edits',
        heading: 'Guest posts vs niche edits',
        content: `A [guest post](/guest-posts) is a new article written for a publisher's site, built around a subject you choose, with your link placed where it naturally belongs. You control the framing, which matters when the page you are linking to needs explaining rather than merely mentioning.

A [niche edit](/niche-edits) adds your link to an article that already exists and is already indexed. It is usually faster and the host page has some history behind it, but you are working with a sentence somebody else wrote.

Most campaigns want both. Niche edits keep momentum on pages that are already close to where you want them; guest posts do the heavier work of establishing relevance for pages starting from nothing.`,
      },
      {
        id: 'how-we-vet',
        heading: 'How Press Parrot vets websites',
        content: `A site is reviewed by a person before it is listed. We look at whether the organic traffic is real and reasonably spread rather than concentrated in one lucky page, whether the site publishes genuine editorial content alongside any sponsored work, and how many commercial outbound links its articles already carry.

We also check the basics that get missed: is the site actually indexed, does it have a publishing history, and does its authority come from somewhere plausible rather than from a network of sites all linking to each other.

Sites that fail are not listed at a lower price. They are not listed. That is the whole point of a vetted marketplace, and it is why the inventory sits behind an account rather than being scraped and resold elsewhere.`,
      },
      {
        id: 'choosing-opportunities',
        heading: 'How to choose link building opportunities',
        content: `Start from the page you are trying to move, not from the list of available sites. What would a reasonable reader expect to find linking to it? That question narrows a five-thousand-site marketplace faster than any filter.

Then use the metrics to sanity-check rather than to select. Filter to a relevance band first, and only then sort by authority, traffic or price. Choosing the highest DR site you can afford is how link profiles end up looking bought.

Spread placements across several target pages, vary the anchors so the profile reads naturally, and keep a steady pace instead of buying a large batch and then stopping.`,
      },
      {
        id: 'agencies',
        heading: 'Link building for SEO agencies',
        content: `Everything above gets harder when you multiply it by a client list. Each account needs its own shortlist, its own anchors, its own content and its own reporting, and each supplier relationship has to be maintained separately.

A single marketplace with fixed prices removes most of that overhead: the same inventory and the same costs across every campaign, so a retainer can be quoted from known numbers rather than estimated and reconciled afterwards. [More on how agencies use Press Parrot](/link-building-agencies).`,
      },
      {
        id: 'content-and-links',
        heading: 'Content and link building',
        content: `The most common reason a link campaign underdelivers has nothing to do with the links. It is that the pages receiving them were never strong enough to hold a position once they arrived there.

Links get a page considered. The page itself has to do the rest: answer the question the searcher arrived with, cover the follow-ups, and give somebody a reason to stay. [SEO content writing](/content-writing) and link building are usually treated as separate budgets, and they work considerably better when they are planned together.`,
      },
    ],
  },

  faqs: {
    items: [
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
        answer: 'No. Accounts are free and you pay only for the placements and content you order.',
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
    ],
  },

  finalCta: {
    heading: 'Ready to find your next placement?',
    body: 'Browse thousands of vetted websites and build better links without endless outreach.',
    primaryCta: { label: 'Create Free Account', href: '/signup' },
    secondaryCta: { label: 'How It Works', href: '/how-it-works' },
    annotation: 'No squawk. Just quality links.',
  },

  seo: {
    metaTitle: 'Link Building Services',
    metaDescription:
      'Link building services built around a marketplace of thousands of vetted publishers. Order guest posts, niche edits, digital PR and SEO content with real metrics and upfront pricing.',
    ogImage: { src: '', alt: '' },
  },
};
