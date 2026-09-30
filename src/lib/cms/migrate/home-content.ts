/**
 * The copy the rebuilt homepage starts with.
 *
 * Everything here is editable the moment the page is converted - it is the
 * starting state of a set of sections, not a second content system. It lives
 * beside the blueprint rather than in the page registry because the registry
 * describes the page the *template* renders, and these are bands that
 * template never had.
 *
 * Two rules it keeps, and both are about not lying on the page a stranger
 * judges the business by:
 *
 * - **No figure is written here.** Websites listed, niches, countries and the
 *   preview rows are all counted on the render that draws them. The mockup
 *   this was built from shows "12,500+ websites", "2,800+ SEO professionals"
 *   and "4.9/5" - illustrative numbers in a picture, not facts, and the real
 *   marketplace is nearer nine hundred sites.
 * - **No customer is quoted.** The quotes band ships empty and switched off.
 */

/** What a free account gets you. Only things the platform actually does. */
export const UNLOCK_BENEFITS = [
  { text: 'Browse every website in the marketplace' },
  { text: 'See full SEO metrics and traffic data' },
  { text: 'Filter by niche, country, DR, traffic and price' },
  { text: 'Order backlinks and content placements' },
  { text: 'No subscription - pay only for what you order' },
];

/** The four-stage journey, in the words the design uses. */
export const JOURNEY = [
  {
    number: '01',
    title: 'Find',
    body: 'Search thousands of relevant websites by niche, country and the metrics that matter.',
  },
  {
    number: '02',
    title: 'Compare',
    body: 'Check real SEO metrics, traffic data and the price before you commit to anything.',
  },
  {
    number: '03',
    title: 'Order',
    body: 'Place your order securely, provide your URL and anchor text, and add content if you need it.',
  },
  {
    number: '04',
    title: 'Go Live',
    body: 'Follow the order through publication and receive the live URL when it is complete.',
  },
];

/** Why this rather than doing it yourself. Four claims the platform can keep. */
export const BENEFITS = [
  {
    title: 'Real websites',
    body: 'Every listing is a working publication with genuine organic traffic, reviewed before it goes on the marketplace.',
  },
  {
    title: 'Useful metrics',
    body: 'Domain rating, organic traffic, referring domains, country and niche - on the page, before you order.',
  },
  {
    title: 'Transparent pricing',
    body: 'The price is the price. No quotes to chase, no negotiation, and no subscription to keep paying.',
  },
  {
    title: 'Simple ordering',
    body: 'Choose a placement, add your link and your content, and track it through to publication in one place.',
  },
];

/** The niches shown on the browse grid, in this order. */
export const BROWSE_NICHES = [
  { slug: 'igaming' },
  { slug: 'sports' },
  { slug: 'finance' },
  { slug: 'crypto' },
  { slug: 'technology' },
  { slug: 'news-media' },
  { slug: 'travel' },
  { slug: 'lifestyle' },
];

/**
 * Where a reader goes next.
 *
 * Only routes that exist. Gambling has a landing page of its own; the rest
 * are marketplace views, which are real working URLs rather than a page
 * somebody has to remember to build before these cards stop being broken.
 * When a sports or finance landing page ships, an editor repoints the card.
 */
export const NICHE_LINKS = [
  {
    label: 'Gambling link building',
    href: '/gambling-link-building',
    description: 'Casino, sportsbook, poker and betting publishers.',
  },
  {
    label: 'Sports',
    href: '/marketplace?niche=sports',
    description: 'Football, racing and general sports media.',
  },
  {
    label: 'Finance',
    href: '/marketplace?niche=finance',
    description: 'Personal finance, investing and business publications.',
  },
  {
    label: 'Crypto',
    href: '/marketplace?niche=crypto',
    description: 'Crypto, web3 and blockchain sites.',
  },
  {
    label: 'Technology',
    href: '/marketplace?niche=technology',
    description: 'Software, hardware and consumer technology.',
  },
  {
    label: 'Travel',
    href: '/marketplace?niche=travel',
    description: 'Destinations, hotels and travel guides.',
  },
];

/** The band pointing at content ordering, between the two SEO halves. */
export const CONTENT_CTA = {
  heading: 'Need the article written as well?',
  body: 'Our writers produce the piece as part of the same order, so a placement never stalls waiting for a draft.',
  primaryCta: { label: 'Order Content', href: '/content-writing' },
  secondaryCta: { label: 'See guest post options', href: '/guest-posts' },
};

/** Headings for the editorial bands, whose bodies come from the page's own copy. */
export const EDITORIAL_HEADINGS = {
  simple: 'Link building made simple',
  buying: 'Buying backlinks: what to look for',
  buyingLabel: 'Learn more about buying backlinks',
  guestPosts: 'Guest posts and content placements',
  guestPostsLabel: 'Learn more about guest posts and niche edits',
  choosing: 'How to choose websites for link building',
};
