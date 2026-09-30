import { link, list, richtext, section, text, textarea } from '../fields';
import type { PageDef, PageValues } from '../types';

/**
 * /link-building-metrics
 *
 * Its own schema rather than `serviceSections()`, because the shape is a
 * reference work: a list of metrics, each with an anchor somebody can be sent
 * to. The homepage's metric cards link straight to
 * /link-building-metrics#organic-traffic and similar, so the anchor ids are
 * part of the contract rather than decoration.
 *
 * The content has one editorial rule running through it, and it is worth
 * stating because it is the opposite of how most pages like this are written:
 * **no single metric decides whether a link is worth buying.** Every entry
 * says what its number is good for and then what it cannot tell you, because
 * a page that presents Domain Rating as a verdict is a page that teaches
 * people to buy bad links confidently.
 */

export const definition: PageDef = {
  slug: 'link-building-metrics',
  label: 'Link building metrics',
  path: '/link-building-metrics',
  description: 'Reference page explaining how to judge a website before buying a placement.',
  sections: [
    section(
      'hero',
      'Hero',
      [
        text('eyebrow', 'Eyebrow', { maxLength: 60 }),
        text('title', 'Headline', { maxLength: 120 }),
        textarea('intro', 'Intro paragraph', { rows: 4, maxLength: 600 }),
        link('primaryCta', 'Primary button'),
        link('secondaryCta', 'Secondary button'),
      ],
      'The first screen.',
    ),

    section(
      'intro',
      'Opening',
      [
        text('heading', 'Heading', { maxLength: 140 }),
        richtext('body', 'Content', { rows: 10 }),
      ],
      'The paragraphs before the metrics themselves.',
    ),

    section(
      'metrics',
      'The metrics',
      [
        list(
          'items',
          'Metrics',
          [
            text('id', 'Anchor id', {
              maxLength: 60,
              help:
                'What the URL fragment will be, e.g. domain-rating. Other pages link straight to these, so changing one breaks those links.',
            }),
            text('heading', 'Name', { maxLength: 80 }),
            text('summary', 'One line', { maxLength: 200 }),
            richtext('body', 'What it is and how to use it', { rows: 8 }),
            textarea('limit', 'What it cannot tell you', {
              rows: 3,
              maxLength: 500,
              help: 'Every metric gets one. A page that presents a number as a verdict teaches people to buy bad links confidently.',
            }),
          ],
          { itemLabelKey: 'heading', maxItems: 16 },
        ),
      ],
      'The reference itself. Each one gets an anchor other pages can link to.',
    ),

    section(
      'closing',
      'Putting it together',
      [
        text('heading', 'Heading', { maxLength: 140 }),
        richtext('body', 'Content', { rows: 10 }),
      ],
      'How to weigh the metrics against each other.',
    ),

    section(
      'cta',
      'Closing call to action',
      [
        text('heading', 'Heading', { maxLength: 140 }),
        textarea('body', 'Supporting copy', { rows: 3, maxLength: 400 }),
        link('primaryCta', 'Primary button'),
        link('secondaryCta', 'Secondary button'),
      ],
      'The ask at the foot of the page.',
    ),

    section(
      'seo',
      'Search engine listing',
      [
        text('metaTitle', 'Meta title', { maxLength: 70 }),
        textarea('metaDescription', 'Meta description', { rows: 3, maxLength: 200 }),
      ],
      'How the page appears in search results.',
    ),
  ],
};

export const defaults: PageValues = {
  hero: {
    eyebrow: 'Reference',
    title: 'Link Building Metrics: What to Look At Before You Buy',
    intro:
      'Every listing on Press Parrot carries the same set of numbers. This page explains what each one measures, what it is useful for, and — the part most guides skip — what it cannot tell you on its own.',
    primaryCta: { label: 'Browse Websites', href: '/marketplace' },
    secondaryCta: { label: 'Create Free Account', href: '/signup' },
  },

  intro: {
    heading: 'No single number decides whether a link is worth buying',
    body: `Third-party SEO metrics are estimates built by companies crawling the web independently of Google. They are genuinely useful — they are the only way to compare thousands of sites without visiting each one — but they are proxies, and every one of them can be gamed by somebody who sets out to.

That matters commercially. A site with a high Domain Rating and no readers costs the same as a site with a modest one and a real audience, and the second is almost always the better buy. The people selling the first know this, which is why the number is the thing they lead with.

The way to use this page is as a filter rather than a scorecard. Use the metrics to narrow thousands of sites to a shortlist, then look at the shortlist yourself: open a few articles, see whether a person wrote them, see whether anyone read them. Ten minutes of that will tell you more than any combination of numbers.`,
  },

  metrics: {
    items: [
      {
        id: 'domain-rating',
        heading: 'Domain Rating',
        summary: "Ahrefs' 0-100 estimate of how strong a site's backlink profile is.",
        body: `Domain Rating measures one thing: the strength of the links pointing at a domain, on a logarithmic scale where moving from 20 to 30 is far easier than moving from 70 to 80. It says nothing about traffic, relevance or editorial standards.

It is a reasonable first filter because it is hard to fake slowly — but it is not hard to fake quickly. Buying a few hundred links at a site will move DR within weeks, which is why a domain with DR 60 and no organic traffic is a common and deliberate shape.

Use it to rule sites out at the bottom rather than to rank them at the top. A DR of 5 usually means nobody links to the site at all; a DR of 65 means somebody, somewhere, links to it a lot, and the next question is who.`,
        limit:
          'Nothing about whether anybody reads the site, whether it covers your subject, or whether the links pointing at it were earned or bought.',
      },
      {
        id: 'domain-authority',
        heading: 'Domain Authority',
        summary: "Moz's equivalent of Domain Rating, on its own 0-100 scale.",
        body: `Domain Authority is Moz's version of the same idea, computed from a different index. The two correlate but do not match, and a site can be DR 40 / DA 25 or the other way round without either being wrong.

Worth knowing mainly because sellers quote whichever of the two flatters the site. If a listing leads with DA and you cannot find its DR, that is usually the reason.`,
        limit:
          'The same things Domain Rating cannot, plus the fact that it is measured against a smaller crawl, so it is less reliable on smaller and non-English sites.',
      },
      {
        id: 'organic-traffic',
        heading: 'Organic Traffic',
        summary: 'An estimate of monthly visitors arriving from search.',
        body: `This is the single most useful number on a listing, because it is the hardest of them to manufacture cheaply. Traffic means the site ranks for things people search for, which means search engines already trust it for something.

It is an estimate: the tool sees the keywords a site ranks for, guesses the click-through rate, and multiplies. Real traffic is usually higher than the estimate for large sites and lower for small ones. Treat the figure as an order of magnitude rather than a measurement — the difference between 200 and 20,000 is what matters, not the difference between 12,000 and 14,000.`,
        limit:
          'Whether the traffic is relevant to your subject, and whether it is real: traffic to a viral listicle from three years ago is still traffic.',
      },
      {
        id: 'traffic-trend',
        heading: 'Traffic Trend',
        summary: 'Whether that traffic is growing, flat, or falling away.',
        body: `The shape of the curve says more than the number at the end of it. A site at 20,000 visits that was at 60,000 eighteen months ago has been hit by something — an algorithm update, a competitor, a redesign — and a link from it is worth less than the current figure suggests, because the figure is still falling.

A sharp vertical spike is the other pattern to be wary of. Real editorial sites grow in steps; a cliff-edge rise usually means expired-domain rebuilds, aggressive link buying, or a single piece of luck that is already over.

Flat and boring over two years is an excellent sign, and almost nobody advertises it.`,
        limit:
          'Why it moved. A fall can be an algorithm update or a site that stopped publishing; those are different problems and only one of them is recoverable.',
      },
      {
        id: 'traffic-geography',
        heading: 'Traffic Geography',
        summary: 'Which countries the visitors are in.',
        body: `A site with 50,000 monthly visitors is not useful to a UK business if 45,000 of them are in Indonesia. The link still passes signals, but the audience is not one that can become a customer, and relevance to your market is part of what search engines are measuring.

This is where a lot of cheap inventory falls down. Sites with large but geographically irrelevant audiences are common and are priced as though traffic is traffic.

If you sell in one country, weigh a site with 3,000 visitors in that country above one with 40,000 spread across places you do not operate.`,
        limit:
          'The language and intent behind the visits. Traffic from your country to pages about something else is still not your audience.',
      },
      {
        id: 'niche-relevance',
        heading: 'Topical and Niche Relevance',
        summary: 'Whether the site actually covers your subject.',
        body: `Relevance is the metric with the least precise number attached and the most weight behind it. A link from a site that genuinely writes about your industry, in a paragraph that makes sense without the link, is the thing everything else is a proxy for.

Majestic's Topical Trust Flow is the closest thing to a measurement: it categorises the sites linking in, so a domain whose inbound links are mostly from finance sites is probably a finance site. Press Parrot shows the top categories for each listing from that data.

The cruder test is better: read three recent articles. If you cannot tell what the site is about, neither can a search engine, and that is the actual problem with general-purpose "we cover everything" publishers.`,
        limit:
          'A category label cannot tell you whether the specific page your link will sit on is relevant, which is what actually matters.',
      },
      {
        id: 'referring-domains',
        heading: 'Referring Domains',
        summary: 'How many separate websites link to this one.',
        body: `More informative than a raw backlink count, because a thousand links from one site is one relationship and ten links from ten sites is ten. Referring domains is the count that resists inflation.

What to look for is the ratio between referring domains and total backlinks. A site with 400 referring domains and 900 backlinks looks like a site people cite. A site with 400 referring domains and 90,000 backlinks has something sitewide — a footer link, a widget, a template — and the profile is less organic than the domain count suggests.`,
        limit:
          'The quality of those domains. A hundred referring domains from a private blog network counts as a hundred.',
      },
      {
        id: 'outbound-links',
        heading: 'Outbound Links',
        summary: 'How many links the site sends out, and how many of those are sold.',
        body: `A page carrying twelve outbound commercial links is diluting every one of them, and the pattern is obvious to anybody looking — including the systems designed to look.

The number to check is not on the domain but on the articles. Open two or three recent posts and count the external links that point at businesses. One or two in a two-thousand-word piece is normal editorial behaviour. Seven is a page that exists to sell links.

This is the check that most reliably separates a publisher from a link farm, and it takes about a minute.`,
        limit:
          'Nothing automated captures intent. A site can link out heavily for good editorial reasons — a review site, for instance — so the count needs reading in context.',
      },
      {
        id: 'link-placement',
        heading: 'Link Placement',
        summary: 'Where on the page the link sits, and what surrounds it.',
        body: `A link inside the body of an article, in a sentence that would still make sense without it, is worth considerably more than the same link in an author bio, a footer, or a paragraph obviously bolted on at the end.

It is also the thing you have most control over. When you supply or commission the article, you decide where the link goes and what the sentence around it says. That is the main practical advantage a guest post has over a link inserted into an existing piece.

Ask what the link policy is before ordering: whether links are dofollow, whether a sponsored tag is applied, and whether the placement is in-content. Press Parrot listings state this upfront.`,
        limit:
          'This is not a number and no tool reports it. It has to be specified in the order or checked on delivery.',
      },
      {
        id: 'content-quality',
        heading: 'Content and Site Quality',
        summary: 'Whether a person wrote it and whether anyone was meant to read it.',
        body: `The judgement no metric replaces. Open the site. Does it publish anything other than sponsored posts? Is there a named author, a contact page, a history? Do the articles read like they were written for a reader or assembled for a crawler?

Sites that fail this are usually easy to spot within thirty seconds, and they are frequently the ones with the most impressive numbers, because the numbers are what they were built to have.

A useful proxy: look at what the site published in the month before it started selling links. If there is nothing there, the site is not a publisher.`,
        limit:
          'It is subjective and it does not scale. Use the numbers to get to a shortlist, then spend the ten minutes.',
      },
    ],
  },

  closing: {
    heading: 'How to weigh them against each other',
    body: `If you take one thing from this page: **relevance and real traffic first, authority scores second.** A DR 30 site that covers your industry and has three thousand readers a month will usually outperform a DR 70 general site with none, and it will cost less.

A workable order for a shortlist:

- Rule out anything with no organic traffic at all, whatever its Domain Rating
- Rule out anything whose traffic is in the wrong countries for your business
- Rule out anything whose traffic has halved in the last year
- Of what remains, prefer sites that genuinely cover your subject
- Then, among relevant sites, use Domain Rating to prioritise
- Before ordering, open two articles and count the outbound commercial links

The last step is the one people skip and the one that catches the most expensive mistakes.

Every listing on Press Parrot shows these figures before you order, and the ones we cannot measure — link policy, turnaround, whether the publisher accepts your topic at all — are stated on the listing rather than discovered afterwards.`,
  },

  cta: {
    heading: 'See the metrics on real listings',
    body: 'Create a free account and filter thousands of publishers by the numbers on this page.',
    primaryCta: { label: 'Browse Websites', href: '/marketplace' },
    secondaryCta: { label: 'Create Free Account', href: '/signup' },
  },

  seo: {
    metaTitle: 'Link Building Metrics: What to Check Before You Buy',
    metaDescription:
      'Domain Rating, organic traffic, relevance, referring domains and outbound links — what each one measures, and what it cannot tell you on its own.',
  },
};
