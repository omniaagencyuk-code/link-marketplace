import type { NicheSlug } from '@/lib/types';

/**
 * The copy for the public niche pages, and the only place to edit it.
 *
 * These pages are the public, indexable half of the marketplace: the inventory
 * itself is account-only, so this is what a search engine and a stranger get to
 * read. That makes the writing the product here, not decoration around it.
 *
 * Three rules it is written to, because breaking any of them costs something
 * specific:
 *
 * - Each entry is about its own subject. A page that is the same paragraph with
 *   one word swapped is a page Google has seen fifteen times already, and the
 *   fifteen of them compete with each other rather than with anybody else.
 *   Every `intro` and every answer below says something that is only true of
 *   that niche.
 *
 * - Nothing here claims a number. Counts, DR ranges, countries and prices are
 *   read from the database at request time, so a page cannot drift into
 *   advertising inventory that has since sold or changed. If a sentence wants a
 *   figure, it gets one from the page's own stats block instead.
 *
 * - "Link building" is the homepage's term and is left to it. These pages
 *   target "[niche] guest posts", which is what somebody buying for a specific
 *   subject actually searches for, and two pages of ours fighting over one term
 *   is a self-inflicted problem.
 */

export interface NicheFaq {
  question: string;
  answer: string;
}

export interface NicheCopy {
  /** The H1. Kept close to the search term without being only the term. */
  heading: string;
  /** The <title>. Under about 60 characters so it is not truncated. */
  metaTitle: string;
  /** The meta description. Around 155 characters. */
  metaDescription: string;
  /** Two or three sentences under the H1. Specific to the subject. */
  intro: string;
  /** What a buyer in this niche is usually trying to do. One sentence. */
  audience: string;
  /** Three questions somebody buying in this niche actually asks. */
  faqs: NicheFaq[];
}

export const NICHE_COPY: Partial<Record<NicheSlug, NicheCopy>> = {
  technology: {
    heading: 'Technology guest posts',
    metaTitle: 'Technology Guest Posts on Vetted Tech Sites',
    metaDescription:
      'Place guest posts on technology publications with real organic traffic. Compare DR, traffic and price before you order, with no subscription.',
    intro:
      'Tech publishers are among the pickiest about what they will run, and the good ones will send a draft back rather than publish something that reads like a product page. The sites here have been checked for real editorial output, not just a domain rating.',
    audience:
      'Usually SaaS and developer-tool marketing teams building topical authority before a funding round or a competitive launch.',
    faqs: [
      {
        question: 'Will a technology site publish a post that mentions our product?',
        answer:
          'Most will, as long as the mention earns its place in the article. A post comparing approaches to a problem, where your tool is one of the options, gets published. A post that is a feature list with a headline on it usually does not, and the publisher will say so rather than quietly drop the link.',
      },
      {
        question: 'Do these sites want technical depth or general coverage?',
        answer:
          'Both exist in the list, and the difference shows up in the traffic numbers more than the DR. Developer-focused publications tend to have lower traffic and a far more valuable readership for a technical product; consumer tech sites carry the bigger numbers. Filter on traffic and read the niche, not just the metrics.',
      },
      {
        question: 'How current does technology content need to be?',
        answer:
          'Dated technical content ages badly and publishers know it, so expect questions about version numbers, dates and benchmarks. It is worth writing the piece so it does not need a date in the title, which is also what keeps the link earning for more than a quarter.',
      },
    ],
  },

  business: {
    heading: 'Business guest posts',
    metaTitle: 'Business Guest Posts on Vetted B2B Sites',
    metaDescription:
      'Guest posts on business and B2B publications with verified traffic. See domain rating, audience country and price up front before ordering.',
    intro:
      'Business is the broadest category here and the one where the gap between a site that looks authoritative and one that is read by anybody is widest. The listings show organic traffic alongside domain rating for exactly that reason.',
    audience:
      'Agencies and in-house teams building credibility for professional services, B2B software and consultancies.',
    faqs: [
      {
        question: 'Why do two business sites with the same DR cost such different amounts?',
        answer:
          'Because DR says how many links a site has, not how many people read it. A business publication with an actual newsletter and an audience charges more than a site that has accumulated backlinks and publishes nothing anybody reads. The traffic column is where that difference shows.',
      },
      {
        question: 'Can we target a specific country?',
        answer:
          'Yes. Business publishers skew heavily towards their home market even when they write in English, so the country filter matters more here than in most categories. If you are selling into one market, filter to it rather than taking the highest DR available.',
      },
      {
        question: 'Do you write the article or do we?',
        answer:
          'Either. You can supply the draft, or order the writing with the placement. Some publishers write it themselves and charge for it - where that is the case the listing shows a separate price for it, because it is a different thing you are buying.',
      },
    ],
  },

  finance: {
    heading: 'Finance guest posts',
    metaTitle: 'Finance Guest Posts on Vetted Finance Sites',
    metaDescription:
      'Guest posts on finance, investing and lending publications. Real traffic figures, upfront pricing and clear rules on what each site will accept.',
    intro:
      'Finance is a regulated subject and publishers behave accordingly: expect scrutiny of claims, a dislike of anything resembling advice, and firm limits on which sub-topics are allowed. The listings record what each site will and will not take, so you are not finding out after you have paid.',
    audience:
      'Fintech, lending, accounting and investment brands that need placements their compliance team will also sign off.',
    faqs: [
      {
        question: 'Will finance sites accept lending or credit content?',
        answer:
          'Some will and many will not, and it is recorded per publisher rather than assumed. Lending is priced and treated separately from general finance by most sites that take it at all, so it appears as its own rate where it applies.',
      },
      {
        question: 'Are these sites comfortable with crypto or trading topics?',
        answer:
          'A mainstream personal finance title usually is not, even though both are nominally finance. Those sit under their own categories here for that reason - a publisher who writes about ISAs and pensions has said nothing at all about whether they will cover an exchange.',
      },
      {
        question: 'How careful do we need to be with claims?',
        answer:
          'Very. Expect editors to cut anything that reads as a guarantee of returns, and expect to be asked for a source on any figure. Writing it that way from the start is faster than having it sent back, and it is the part most drafts get wrong.',
      },
    ],
  },

  health: {
    heading: 'Health guest posts',
    metaTitle: 'Health Guest Posts on Vetted Health Sites',
    metaDescription:
      'Place guest posts on health and wellness publications. Compare domain rating, organic traffic, audience country and price before you order.',
    intro:
      'Health publishers are the most likely of any category to ask who wrote the piece and what qualifies them. Several of the sites here want an author with credentials, or will attach their own reviewer, and that is noted on the listing rather than discovered at the draft stage.',
    audience:
      'Supplement, clinic, medical device and wellness brands that need placements which survive editorial review.',
    faqs: [
      {
        question: 'Do we need a medically qualified author?',
        answer:
          'For some publishers, yes, and they will not budge on it. Others are comfortable with a well-sourced article from a staff writer. It is worth filtering on that before you commission the writing rather than after.',
      },
      {
        question: 'What about supplements and treatment claims?',
        answer:
          'Treated cautiously almost everywhere. A piece about a category generally runs; a piece making a specific health claim about a specific product generally does not. Publishers who are stricter than average tend to be the ones worth having.',
      },
      {
        question: 'Is health content held to a different standard by search engines?',
        answer:
          'It is in practice, which cuts both ways. A link from a genuine health publication with real readership is worth more here than in most categories, and a link from a thin one is worth less than it looks.',
      },
    ],
  },

  travel: {
    heading: 'Travel guest posts',
    metaTitle: 'Travel Guest Posts on Vetted Travel Sites',
    metaDescription:
      'Guest posts on travel and hospitality publications with real readership. See traffic, domain rating and audience country before ordering.',
    intro:
      'Travel has more low-quality inventory floating around than almost any other category, largely because the sites are cheap to produce. The filter that matters most here is organic traffic: a travel blog with a strong DR and no readers is a very common thing to be offered.',
    audience:
      'Hotels, tour operators, booking platforms and destination marketing teams.',
    faqs: [
      {
        question: 'Does the publisher need to have visited the destination?',
        answer:
          'The better ones care, and some will only run first-hand pieces. Where that is the case the publisher usually offers to write it themselves, which costs more and reads considerably better than a desk-written destination guide.',
      },
      {
        question: 'Is seasonality worth thinking about?',
        answer:
          'Yes, more than in any other category here. A piece about a summer destination published in November gets its first real traffic months later. Order against the season you are selling into, not the one you are in.',
      },
      {
        question: 'Can we get a do-follow link to a booking page?',
        answer:
          'Often, but commercial pages get more pushback in travel than editorial ones. Many publishers will link to a guide or a destination page happily and refuse a direct booking URL. The link rules for each site are on its listing.',
      },
    ],
  },

  lifestyle: {
    heading: 'Lifestyle guest posts',
    metaTitle: 'Lifestyle Guest Posts on Vetted Lifestyle Sites',
    metaDescription:
      'Guest posts on lifestyle, fashion and culture publications. Real organic traffic, clear pricing and no subscription required.',
    intro:
      'Lifestyle covers a lot of ground - fashion, parenting, culture, home life - and the publishers tend to care more about tone than about subject. A piece that reads like the rest of the site gets published; one that reads like marketing does not, however on-topic it is.',
    audience:
      'Consumer brands and e-commerce teams who need placements that look native to the publication.',
    faqs: [
      {
        question: 'How much editorial control does the publisher keep?',
        answer:
          'More than average. Lifestyle editors routinely rewrite headlines and trim copy to fit house style. The link survives; your preferred phrasing often does not, and pushing back on it tends to cost more than it gains.',
      },
      {
        question: 'Do product mentions work in lifestyle placements?',
        answer:
          'They work when the product is one of several things mentioned and the piece would still make sense without it. A round-up is the natural format here, and most publishers will say yes to one quickly.',
      },
      {
        question: 'Is a lifestyle link worth having for a niche B2B brand?',
        answer:
          'Usually not on its own. The relevance is thin, and a smaller business or trade publication will do more for the same money. These pages are most useful to consumer brands.',
      },
    ],
  },

  sports: {
    heading: 'Sports guest posts',
    metaTitle: 'Sports Guest Posts on Vetted Sports Sites',
    metaDescription:
      'Guest posts on sports publications and fan media with verified traffic. Compare DR, country and price before you order a placement.',
    intro:
      'Sports publishers range from national outlets to fan media with a devoted following, and the second group often outperforms the first for engagement. Several of these sites will also take betting-adjacent content and several firmly will not, which is recorded per publisher.',
    audience:
      'Sports brands, fantasy and data products, and betting operators looking for mainstream sports placements.',
    faqs: [
      {
        question: 'Will a sports site accept content that mentions betting?',
        answer:
          'Some will, at a different rate, and some refuse outright. It is never assumed from the fact that a site covers sport - a publisher who has not said they take gambling content has not agreed to carry it, and the listing reflects that.',
      },
      {
        question: 'Does the timing matter around fixtures and seasons?',
        answer:
          'For news-led pieces it matters enormously and for evergreen ones not at all. A tactical explainer or a history piece keeps earning; a match preview is worth very little the following week.',
      },
      {
        question: 'Are fan sites worth it compared to major outlets?',
        answer:
          'Often yes. A club or sport-specific site with a committed readership sends traffic that converts, and costs a fraction of a national title. The traffic figures on each listing are the honest comparison.',
      },
    ],
  },

  crypto: {
    heading: 'Crypto guest posts',
    metaTitle: 'Crypto Guest Posts on Vetted Web3 Sites',
    metaDescription:
      'Guest posts on crypto, web3 and digital asset publications. Transparent pricing, real traffic figures and clear acceptance rules per site.',
    intro:
      'Crypto is priced separately almost everywhere, including by publishers who will happily run it - it carries more editorial risk and they charge for that. The sites listed here have each stated their position on it, rather than being assumed to accept it because they cover finance.',
    audience:
      'Exchanges, wallets, protocols and web3 products that need coverage outside crypto-native media.',
    faqs: [
      {
        question: 'Why is crypto more expensive than general finance?',
        answer:
          'Because publishers treat it as a sensitive topic and price it as one. It is a separate rate on most sites that take it, and a flat refusal on some mainstream finance titles. Neither is inferred here: it comes from what the publisher actually said.',
      },
      {
        question: 'Can we link to a token or exchange page?',
        answer:
          'Depends on the publisher and it is worth checking before commissioning. Educational and explainer content with a link to a resource page is the format most readily accepted; a direct link to a token sale is the one most often refused.',
      },
      {
        question: 'Do mainstream sites take crypto content at all?',
        answer:
          'A growing number do, and those placements are the valuable ones precisely because they are harder to get. Filtering this category by traffic surfaces them - they tend to be general publications that have added crypto coverage rather than crypto-only outlets.',
      },
    ],
  },

  entertainment: {
    heading: 'Entertainment guest posts',
    metaTitle: 'Entertainment Guest Posts on Vetted Media Sites',
    metaDescription:
      'Guest posts on film, TV, music and streaming publications. Real traffic numbers, upfront prices and no subscription.',
    intro:
      'Entertainment sites move fast and publish a lot, which makes them more accessible than most categories but also means a piece can be buried quickly. Evergreen formats - retrospectives, explainers, rankings - keep earning long after a news piece has gone quiet.',
    audience:
      'Streaming services, gaming brands, ticketing platforms and consumer products looking for a broad audience.',
    faqs: [
      {
        question: 'Is entertainment traffic worth much for a non-entertainment brand?',
        answer:
          'The audiences are large and general, which suits consumer products and suits very little else. If you sell to businesses, almost any other category here will serve you better.',
      },
      {
        question: 'How long does a placement stay live?',
        answer:
          'Most publishers here treat posts as permanent, but entertainment sites churn their front pages faster than any other category, so the piece stops getting internal links quickly. Where a site only guarantees a period, it says so on the listing.',
      },
      {
        question: 'Do these sites accept gaming content?',
        answer:
          'Video gaming, usually yes - it sits naturally alongside film and TV coverage. Gambling is a different subject and a different answer, and is never assumed from the fact that a site covers games.',
      },
    ],
  },

  'home-garden': {
    heading: 'Home and garden guest posts',
    metaTitle: 'Home & Garden Guest Posts on Vetted Sites',
    metaDescription:
      'Guest posts on home improvement, interiors and gardening publications. See domain rating, traffic and price before you order.',
    intro:
      'Home and garden publishers have unusually practical readerships - people who are mid-project and looking something up - which makes the traffic convert better than the raw numbers suggest. Seasonal content performs predictably here, and publishers plan around it.',
    audience:
      'Trades, home services, furniture and DIY retail brands selling to homeowners.',
    faqs: [
      {
        question: 'Does local relevance matter for a home services business?',
        answer:
          'It matters a great deal, and it is the category where the country filter earns its keep. Building regulations, climate and even plant hardiness differ by market, and a publisher writing for the wrong one sends you readers who cannot buy.',
      },
      {
        question: 'Will publishers link to a product or a service page?',
        answer:
          'More readily than in most categories, because the content is naturally practical and a reader looking up how to do something often wants to buy something. A link inside a how-to is the format that gets agreed fastest.',
      },
      {
        question: 'Is there a best time of year to place?',
        answer:
          'Garden content ahead of spring and home improvement ahead of autumn, if you are planning. The pieces that avoid a season entirely - storage, insulation, maintenance - earn steadily all year and are easier to get placed.',
      },
    ],
  },

  automotive: {
    heading: 'Automotive guest posts',
    metaTitle: 'Automotive Guest Posts on Vetted Motoring Sites',
    metaDescription:
      'Guest posts on car, EV and motoring publications with real readership. Compare traffic, DR and price up front.',
    intro:
      'Motoring publishers tend to have knowledgeable readers and editors who notice when a writer does not know the subject. The sites here cover everything from EV and ownership-cost coverage to enthusiast media, and the two audiences behave very differently.',
    audience:
      'Dealers, parts and aftermarket retailers, EV and charging brands, and motor finance.',
    faqs: [
      {
        question: 'Do automotive editors check technical accuracy?',
        answer:
          'More than most. Specifications, running costs and model years get verified, and a piece with a wrong figure in it comes back. Writing from the manufacturer data rather than from memory saves a round trip.',
      },
      {
        question: 'Is EV content treated differently?',
        answer:
          'It is in demand, and sites that have built an EV section want more of it. If what you sell touches charging, running costs or grants, that is the angle most likely to be accepted quickly.',
      },
      {
        question: 'Does motor finance count as a finance topic?',
        answer:
          'For several publishers, yes - and that means it falls under their finance rules rather than their motoring ones. Where a site has said so, the listing records it rather than treating the content as ordinary automotive.',
      },
    ],
  },

  food: {
    heading: 'Food and drink guest posts',
    metaTitle: 'Food & Drink Guest Posts on Vetted Sites',
    metaDescription:
      'Guest posts on food, recipe and drinks publications. Real organic traffic, clear pricing and no subscription required.',
    intro:
      'Food publishers live on recurring readers rather than search spikes, and the better ones are protective of their tone. A piece that fits the way the site already writes about food gets accepted quickly; one that reads like a brand talking about itself does not get accepted at all.',
    audience:
      'Food and drink brands, delivery and meal-kit services, kitchen retail and hospitality.',
    faqs: [
      {
        question: 'Do publishers want original recipes?',
        answer:
          'Many do, and will value a genuinely original one far above a general article. It is more work, and it is also the format most likely to be shared and linked to by other people afterwards, which is where the real value sits.',
      },
      {
        question: 'Are images expected?',
        answer:
          'In this category more than any other. A food piece without decent photography reads as filler to an editor who publishes photographs daily, and several publishers will ask for them before agreeing.',
      },
      {
        question: 'Will a food site take alcohol content?',
        answer:
          'Many will and some will not, for the same reasons any publisher sets a policy. It is recorded per site rather than assumed from the fact that a publication covers drinks.',
      },
    ],
  },

  'news-media': {
    heading: 'News and media guest posts',
    metaTitle: 'News Site Guest Posts and Placements',
    metaDescription:
      'Placements on news publications, magazines and broadcasters. Verified traffic, upfront pricing and clear rules per title.',
    intro:
      'News titles carry the most authority of anything here and the least patience for marketing. Most want a genuine news angle, a quotable source or original data, and will turn down a piece that has none of those however well written it is.',
    audience:
      'Brands with something genuinely newsworthy: research, launches, funding or a point of view worth quoting.',
    faqs: [
      {
        question: 'What actually gets accepted by a news site?',
        answer:
          'Original data, expert commentary on something already in the news, or a story nobody else has. A general article about your industry is the thing most often declined, and the decline usually comes quickly.',
      },
      {
        question: 'Will the link be do-follow?',
        answer:
          'Less reliably than elsewhere, and many news publishers mark commercial links regardless of what was agreed. Where a site does that, it is on the listing - a nofollow from a national title is still worth having, but you should know before you buy.',
      },
      {
        question: 'Are these placements worth the higher price?',
        answer:
          'For credibility and referral traffic, often yes. As a pure link play they are expensive, and a well-read trade publication in your own category frequently does more for your rankings per pound spent.',
      },
    ],
  },

  'science-environment': {
    heading: 'Science and environment guest posts',
    metaTitle: 'Science & Environment Guest Post Placements',
    metaDescription:
      'Guest posts on science, climate, energy and environmental publications. Real traffic figures and transparent pricing.',
    intro:
      'This is the category where sourcing matters most. Editors here expect claims to be attributable and will ask where a figure came from, which makes placements harder to get and considerably more durable once you have them.',
    audience:
      'Energy, sustainability, agritech and research-led organisations that have something substantiated to say.',
    faqs: [
      {
        question: 'Do we need to cite research?',
        answer:
          'Yes, and properly. A piece with linked primary sources gets through review; one with unattributed statistics comes back or gets declined. It is the single biggest difference between this category and the consumer ones.',
      },
      {
        question: 'Is sustainability content welcome from commercial brands?',
        answer:
          'Welcome, and scrutinised. Editors in this category are alert to claims that cannot be supported, so the pieces that work are the ones that describe a method or a result rather than making a general claim about being green.',
      },
      {
        question: 'How long do these placements keep earning?',
        answer:
          'Longer than most. Science and environment content gets cited by other writers and picked up by university and research pages, which is where the compounding value in this category comes from.',
      },
    ],
  },

  education: {
    heading: 'Education guest posts',
    metaTitle: 'Education Guest Posts on Vetted Education Sites',
    metaDescription:
      'Guest posts on education, course and reference publications. Compare domain rating, traffic and price before ordering.',
    intro:
      'Education publishers serve people making a decision - what to study, where, and whether a course is worth it - so the content that works is genuinely useful rather than promotional. Several of these sites have institutional readerships that are hard to reach any other way.',
    audience:
      'Course providers, edtech, student services and professional training organisations.',
    faqs: [
      {
        question: 'Will education sites link to a commercial course?',
        answer:
          'Many will, when the piece is about the subject rather than about the course. A guide to getting into a field that mentions a route to qualifying is accepted; a page about your programme is not.',
      },
      {
        question: 'Does the academic year affect placements?',
        answer:
          'It affects traffic more than acceptance. Decision-making peaks before application deadlines and again at results time, so a piece placed a couple of months ahead of those catches the wave rather than following it.',
      },
      {
        question: 'Are .edu or university links available here?',
        answer:
          'Not as paid placements, and anybody selling you one should be treated with suspicion. What is here is independent education media - publications about studying rather than institutions themselves.',
      },
    ],
  },

  igaming: {
    heading: 'iGaming guest posts',
    metaTitle: 'iGaming Guest Posts on Vetted Casino Sites',
    metaDescription:
      'Guest posts on iGaming, casino and sportsbook publications. Clear per-site rules, real traffic figures and upfront pricing.',
    intro:
      'iGaming is the most restricted category here and the one where assumptions cost the most. Every site in this list has explicitly said it accepts gambling content and at what rate - nothing is inferred from a publisher covering sport or finance, because silence is not agreement.',
    audience:
      'Operators, affiliates and comparison sites working in regulated gambling markets.',
    faqs: [
      {
        question: 'How do you know a site accepts gambling content?',
        answer:
          'Because it said so. A publisher who has not mentioned gambling has not agreed to carry it, and is not listed here on the basis of covering an adjacent subject. That rule exists because the alternative is paying for a placement that gets pulled.',
      },
      {
        question: 'Does the price differ from a standard placement?',
        answer:
          'Almost always, and the difference is substantial. Publishers who take gambling price it as a sensitive topic, and the rate shown for this category is the rate they quoted for it rather than their general one.',
      },
      {
        question: 'Can we target a specific regulated market?',
        answer:
          'Yes, and you should. Audience country is on every listing, and a placement on a site read in a market where you are not licensed is spend with nothing on the end of it.',
      },
    ],
  },
};

/** Niches with copy written for them. The rest are not published as pages. */
export function hasNicheCopy(slug: string): slug is NicheSlug {
  return slug in NICHE_COPY;
}
