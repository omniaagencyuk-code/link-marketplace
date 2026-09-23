import { image, link, list, richtext, section, text, textarea } from '../fields';
import type { PageDef, PageValues } from '../types';

/**
 * The gambling and iGaming landing page.
 *
 * A niche entry point into the one marketplace, not a second marketplace. It
 * exists because somebody searching "casino link building" is asking a
 * narrower question than the service pages answer, and lands better on a page
 * that answers it - then goes to the same inventory everyone else uses, with
 * the iGaming filter already applied.
 *
 * Its own schema rather than `serviceSections()`, because the shape is
 * genuinely different: a mascot, a live count, a filter shortcut row and a
 * content upsell that the five service pages have no use for. When a second
 * niche page arrives, this schema is the one to share.
 */
export const definition: PageDef = {
  slug: 'gambling-link-building',
  label: 'Gambling link building',
  path: '/gambling-link-building',
  description: 'Niche landing page targeting gambling, casino, betting and iGaming searches.',
  tokens: [
    {
      name: 'gambling_site_count',
      description: 'Live count of active iGaming listings in the marketplace.',
    },
  ],
  sections: [
    section(
      'hero',
      'Hero',
      [
        text('eyebrow', 'Eyebrow', { maxLength: 60 }),
        text('title', 'Headline', { maxLength: 120 }),
        textarea('intro', 'Intro paragraph', { rows: 4, maxLength: 500 }),
        list(
          'trust',
          'Trust indicators',
          [text('label', 'Label', { maxLength: 40 })],
          { itemLabelKey: 'label', minItems: 2, maxItems: 4 },
        ),
        link('primaryCta', 'Primary button', {
          help: 'Send this to /marketplace?niche=igaming so the filter is already applied.',
        }),
        link('secondaryCta', 'Secondary button'),
        text('microcopy', 'Reassurance line', { maxLength: 120 }),
        image('mascot', 'Mascot artwork', {
          help:
            'Drop the file at /public/images/parrots/gambling-parrot.webp and it appears here. ' +
            'Until then the drawn parrot is used, so the page is never broken.',
        }),
      ],
      'The first screen: headline, buttons and the mascot beside them.',
    ),

    section(
      'preview',
      'Marketplace preview',
      [
        text('heading', 'Heading', { maxLength: 120 }),
        textarea('body', 'Supporting copy', { rows: 3, maxLength: 400 }),
        text('lockNote', 'Line above the table', { maxLength: 200 }),
        link('cta', 'Button'),
        text('countSuffix', 'Wording after the live count', {
          maxLength: 60,
          help: 'The number itself is counted from the marketplace and cannot be edited here.',
        }),
      ],
      'Wraps the redacted table. The rows are generated from real listings with everything identifying removed - no domain, price or id ever reaches this page.',
    ),

    section(
      'categories',
      'What publishers cover',
      [
        text('heading', 'Heading', { maxLength: 120 }),
        textarea('body', 'Supporting copy', { rows: 2, maxLength: 300 }),
        list(
          'items',
          'Shortcuts',
          [
            text('label', 'Label', { maxLength: 40 }),
            text('href', 'Marketplace link', {
              maxLength: 160,
              help: 'A real marketplace query, e.g. /marketplace?niche=igaming&q=casino',
            }),
          ],
          { itemLabelKey: 'label', maxItems: 12 },
        ),
      ],
      'Each one is a real marketplace search. Keep them that way: a shortcut that returns nothing teaches a visitor the marketplace is empty.',
    ),

    section(
      'highlights',
      'Why Press Parrot',
      [
        text('heading', 'Heading', { maxLength: 120 }),
        list(
          'items',
          'Points',
          [
            text('title', 'Title', { maxLength: 60 }),
            textarea('body', 'Description', { rows: 3, maxLength: 300 }),
          ],
          { itemLabelKey: 'title', minItems: 2, maxItems: 4 },
        ),
      ],
      'The four cards. Claims here should be things the platform actually does.',
    ),

    section(
      'body',
      'Main content',
      [
        list(
          'sections',
          'Content sections',
          [
            text('heading', 'Heading', { maxLength: 120 }),
            richtext('content', 'Content', {
              rows: 10,
              help: 'Headings, lists, links, images and tables. The page decides how each one looks.',
            }),
          ],
          { itemLabelKey: 'heading', minItems: 1, maxItems: 12 },
        ),
      ],
      'The editorial body. This is the part search engines read most closely.',
    ),

    section(
      'content',
      'Content upsell',
      [
        text('heading', 'Heading', { maxLength: 120 }),
        textarea('body', 'Supporting copy', { rows: 3, maxLength: 300 }),
        link('cta', 'Button'),
      ],
      'The small band pointing at content ordering.',
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
      'Shown on the page and published as FAQ structured data. Only add questions you genuinely answer here.',
    ),

    section(
      'related',
      'Related links',
      [
        list(
          'items',
          'Links',
          [
            text('label', 'Label', { maxLength: 60 }),
            text('href', 'Path', { maxLength: 120 }),
            text('description', 'Description', { maxLength: 120 }),
          ],
          { itemLabelKey: 'label', maxItems: 8 },
        ),
      ],
      'The sidebar links beside the body copy.',
    ),

    section(
      'cta',
      'Closing call to action',
      [
        text('heading', 'Heading', { maxLength: 120 }),
        textarea('body', 'Supporting copy', { rows: 3, maxLength: 300 }),
        link('primaryCta', 'Primary button'),
        link('secondaryCta', 'Secondary button'),
      ],
      'The dark band at the bottom of the page.',
    ),

    section(
      'seo',
      'Search engine listing',
      [
        text('metaTitle', 'Meta title', { maxLength: 70 }),
        textarea('metaDescription', 'Meta description', { rows: 3, maxLength: 170 }),
        image('ogImage', 'Social share image', { help: '1200x630 works everywhere.' }),
      ],
      'How the page appears in search results and when shared.',
    ),
  ],
};

/** The marketplace with the iGaming filter already applied. */
const GAMBLING_MARKETPLACE = '/marketplace?niche=igaming';

export const defaults: PageValues = {
  hero: {
    eyebrow: 'Gambling & iGaming',
    title: 'Gambling Link Building',
    intro:
      'Get featured on gambling and iGaming websites with real traffic. Press Parrot lists publishers covering casino, sports betting, poker, bingo, esports and the wider industry, with the metrics and the price on the page before you order.',
    trust: [
      { label: 'Real websites with traffic' },
      { label: 'Transparent SEO metrics' },
      { label: 'Fast ordering process' },
    ],
    primaryCta: { label: 'Browse Gambling Websites', href: GAMBLING_MARKETPLACE },
    secondaryCta: { label: 'Create Free Account', href: '/signup' },
    microcopy: 'Free account · No subscription · Pay only for what you order',
    mascot: {
      src: '/images/parrots/gambling-parrot.webp',
      alt: 'The Press Parrot macaw in sunglasses, holding a hand of playing cards',
    },
  },

  preview: {
    heading: 'Gambling Websites Available on Press Parrot',
    body:
      'Every listing carries its domain rating, organic traffic, referring domains, country and price before you commit to anything. Regulated topics are priced by the publisher, so a gambling placement shows its own rate rather than a starting price you find out is wrong later.',
    lockNote:
      'Website names, pricing and full marketplace data are available to Press Parrot members.',
    cta: { label: 'Create Free Account to View Websites', href: '/signup' },
    countSuffix: 'gambling and iGaming websites listed',
  },

  categories: {
    heading: 'What the publishers cover',
    body: 'Each of these opens the marketplace with that search already run.',
    items: [
      { label: 'Online casinos', href: `${GAMBLING_MARKETPLACE}&q=casino` },
      { label: 'Sports betting', href: `${GAMBLING_MARKETPLACE}&q=betting` },
      { label: 'Casino reviews', href: `${GAMBLING_MARKETPLACE}&q=review` },
      { label: 'iGaming news', href: `${GAMBLING_MARKETPLACE}&q=news` },
      { label: 'Poker', href: `${GAMBLING_MARKETPLACE}&q=poker` },
      { label: 'Bingo', href: `${GAMBLING_MARKETPLACE}&q=bingo` },
      { label: 'Esports', href: `${GAMBLING_MARKETPLACE}&q=esports` },
      { label: 'Slots', href: `${GAMBLING_MARKETPLACE}&q=slots` },
      { label: 'Sports media', href: '/marketplace?niche=sports' },
      { label: 'Everything iGaming', href: GAMBLING_MARKETPLACE },
    ],
  },

  highlights: {
    heading: 'Why buyers use Press Parrot for gambling placements',
    items: [
      {
        title: 'Niche relevant websites',
        body: 'Publishers covering casino, betting, poker and iGaming, filtered from the same marketplace as everything else rather than a separate list nobody maintains.',
      },
      {
        title: 'Transparent metrics',
        body: 'Domain rating, organic traffic, referring domains, country and turnaround are on every listing, refreshed from Ahrefs rather than typed in once and forgotten.',
      },
      {
        title: 'Priced per topic',
        body: 'Publishers who charge more for gambling say so on the listing, so the rate you read is the rate for the work you are buying.',
      },
      {
        title: 'Simple ordering',
        body: 'Find a website, add your target URL and anchor text, and follow the order through to the live link in your dashboard.',
      },
    ],
  },

  body: {
    sections: [
      {
        heading: 'Gambling link building',
        content: `Gambling sites are harder to build links for than almost any other commercial niche, and the reason is supply rather than difficulty. Most publishers will not take the content. Mainstream media has advertising rules that rule it out, general blogs worry about their own standing, and the sites that will take it know they are a small market and price accordingly.

That is the market Press Parrot lists. Publishers who accept casino, sportsbook, poker and wider iGaming content are in the same marketplace as every other publisher, filtered to the iGaming niche, with their metrics and their price on the listing.`,
      },
      {
        heading: 'Why relevance matters in iGaming SEO',
        content: `A link from a site that has never mentioned gambling is a link from a site with no reason to mention you. It may still carry authority, but it sits in a profile that does not look like the profile of a gambling brand, and it does nothing for the topical association you are actually trying to build.

Relevance is worth more here than raw domain rating. A DR 45 casino review site with steady organic traffic and a readership that plays is a better placement than a DR 70 lifestyle blog that ran one poker article in 2019 and has taken paid links ever since.

- Does the site cover gambling as a subject rather than as an occasional favour?
- Does it have organic traffic, and is that traffic in the market you sell to?
- Are the outbound links on it the kind you want to sit beside?
- Would a reader of that site plausibly be a customer of yours?`,
      },
      {
        heading: 'Types of gambling websites available',
        content: `The iGaming niche covers more than casino affiliates. Filtering the marketplace will turn up sportsbook and betting tips sites, poker strategy publications, bingo and slots review sites, esports betting coverage, industry news titles, and general sports media that accepts betting content.

They behave differently. A news title tends to want something timely. A review site wants depth and a reason to link. A sports publication may accept betting content only where it sits naturally against a fixture or a tournament.`,
      },
      {
        heading: 'Casino link building',
        content: `Casino placements are the most competitive part of this niche, and the most heavily transacted. The sites that accept them know their value, which is why they carry a premium over the same publisher's general rate.

What separates a placement worth buying is whether the page carrying your link has a reason to exist. A review, a guide or a comparison that someone actually reads passes value and holds up. A thin post published to host a link does neither, and both you and the publisher know which one you are buying when you read the listing.`,
      },
      {
        heading: 'Sports betting link building',
        content: `Sports betting has a wider supply of relevant publishers than casino, because sports media is large and a betting angle is a natural fit for a lot of it. Filter for sports publications as well as dedicated betting sites.

Seasonality is worth planning around. Placements timed to a season or a tournament pick up traffic that the same article published in the off-season never sees, and publishers tend to be busiest exactly when you want to be live.`,
      },
      {
        heading: 'iGaming guest posts',
        content: `A [guest post](/guest-posts) gives you a new article written around a subject you choose, with your link in the body. It is the most common format in this niche because it lets you build the context the link needs rather than borrowing someone else's.

Where a publisher already has a relevant article, a [niche edit](/niche-edits) puts your link into a page that is already indexed and receiving traffic. It is quicker, and on an established page it can be worth more than a new post that has to earn its position from scratch.`,
      },
      {
        heading: 'How Press Parrot works',
        content: `Create a free account, filter the marketplace to iGaming, and compare publishers on the metrics that matter to you. Every listing shows its domain rating, organic traffic, referring domains, country, turnaround and price, plus the topics the publisher accepts.

When you have chosen, add your target URL and anchor text and place the order. If you need the article writing as well, order the content in the same place. Track the order through to publication in your dashboard.`,
      },
      {
        heading: 'Choosing gambling websites',
        content: `Read the listing rather than the domain rating. The metrics are there so you can make a judgement, not so you can sort by one number and buy the top row.

- Check organic traffic against domain rating: a high DR with no traffic usually means the authority is historical
- Look at the country split if you sell into a specific market
- Check the publisher's accepted topics, not just their niche
- Compare the price against the traffic you would be buying, not against other publishers' prices in the abstract
- Prefer publishers whose existing gambling coverage is something you would be happy to sit next to`,
      },
    ],
  },

  content: {
    heading: 'Need gambling content too?',
    body: 'Our content team writes the article as part of the same order, so a placement does not stall waiting for a draft.',
    cta: { label: 'Order Content', href: '/content-writing' },
  },

  faqs: {
    items: [
      {
        question: 'Do you accept gambling and casino content?',
        answer:
          'Press Parrot lists publishers who accept it. Each listing states the topics that publisher takes, so you can see before ordering whether casino, betting or wider iGaming content is welcome rather than finding out after the fact.',
      },
      {
        question: 'How much does a gambling link cost?',
        answer:
          'It depends on the publisher. Regulated topics are usually priced above a site’s general rate, and where a publisher charges more for gambling the listing shows that price rather than the standard one. You see the figure before you order.',
      },
      {
        question: 'Are these links dofollow?',
        answer:
          'Each listing states its link attribute, whether the publisher applies a sponsored tag, and how many links a placement may carry. Filter on the attribute if it matters to you.',
      },
      {
        question: 'How long does a gambling placement take?',
        answer:
          'Turnaround is set by the publisher and shown on the listing, typically a few working days to a couple of weeks. You can filter by turnaround if you are working to a date.',
      },
      {
        question: 'Can you write the article as well?',
        answer:
          'Yes. Content can be ordered alongside a placement, or on its own. If you already have an article you can supply it instead.',
      },
      {
        question: 'Do I need an account to see the websites?',
        answer:
          'Yes. The publisher list is what an account gives you access to, so domains and prices are behind a free sign-up. There is no subscription and you only pay for what you order.',
      },
      {
        question: 'Which countries do the gambling publishers cover?',
        answer:
          'It varies by publisher and changes as the inventory does. Country is a filter in the marketplace, so the accurate answer is whatever the marketplace shows when you look.',
      },
    ],
  },

  related: {
    items: [
      {
        label: 'Guest posts',
        href: '/guest-posts',
        description: 'New articles carrying a contextual link.',
      },
      {
        label: 'Niche edits',
        href: '/niche-edits',
        description: 'Links added to pages that already rank.',
      },
      {
        label: 'Content writing',
        href: '/content-writing',
        description: 'Articles written for your placements.',
      },
      {
        label: 'How it works',
        href: '/how-it-works',
        description: 'From sign-up to live link.',
      },
    ],
  },

  cta: {
    heading: 'Start with the gambling publishers',
    body: 'Create a free account and the marketplace opens with the iGaming filter applied.',
    primaryCta: { label: 'Browse Gambling Websites', href: GAMBLING_MARKETPLACE },
    secondaryCta: { label: 'How It Works', href: '/how-it-works' },
  },

  seo: {
    metaTitle: 'Gambling Link Building | Casino & iGaming Placements',
    metaDescription:
      'Buy gambling and iGaming links on vetted publishers. Casino, sports betting, poker and esports sites with real traffic, transparent metrics and upfront pricing.',
    ogImage: { src: '', alt: '' },
  },
};
