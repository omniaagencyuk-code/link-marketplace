import type { BlogPost } from '@/lib/types/blog';

/**
 * Seed blog posts.
 *
 * Real, editable starting content rather than lorem ipsum, so the blog looks
 * like a blog on day one and the team has something to edit rather than a
 * blank screen.
 *
 * Deliberately no invented statistics. Where a post would normally cite a
 * number, it explains the mechanism instead - a fabricated benchmark is worse
 * than no benchmark, and it is the sort of thing that gets quoted back at you.
 */

const author = 'The Press Parrot team';

export const seedPosts: BlogPost[] = [
  {
    id: 'post_seed_001',
    slug: 'link-plan-that-survives-a-core-update',
    title: 'How to build a link plan that survives a core update',
    excerpt:
      'A framework for spreading link acquisition across pages, anchors and placement types, so a single algorithm change cannot undo six months of work.',
    category: 'link-building',
    status: 'published',
    author,
    publishedAt: '2026-08-18T09:00:00.000Z',
    createdAt: '2026-08-18T09:00:00.000Z',
    updatedAt: '2026-08-18T09:00:00.000Z',
    seoTitle: 'How to build a link plan that survives a core update',
    seoDescription:
      'Spread link acquisition across pages, anchors and placement types so one algorithm change cannot undo months of work. A practical planning framework.',
    body: `Most link campaigns that collapse after a core update were fragile long before it. The update did not break them; it revealed that everything was resting on one narrow bet.

## The shape of a fragile campaign

A fragile campaign usually looks like this: nearly every link points at two or three commercial pages, the anchors cluster tightly around the terms those pages target, and the placements all came from the same kind of site bought in the same way over the same eight weeks.

Each of those on its own is survivable. Together they describe a pattern, and patterns are exactly what an algorithm is good at recognising.

## Spread across pages

Point links at the pages that deserve them, which is rarely just the money pages. Supporting articles, comparison pages, and genuinely useful resources all pass authority internally, and they are far easier to earn links to in the first place.

A reasonable split is a minority of your links to commercial pages and the majority to everything that supports them. That also gives you somewhere to send a link when a publisher is not comfortable linking to a sales page, which happens more often than most people expect.

## Spread across anchors

Exact-match anchors work, which is why they get overused. The problem is not any single exact-match anchor - it is a profile where most anchors are the phrase you are targeting, because almost nobody links that way naturally.

Vary between your brand name, the bare URL, the page title, a descriptive phrase, and occasionally the target term. The test is simple: read the anchors as a list and ask whether a group of unconnected writers would plausibly have produced it.

## Spread across placement types

[Guest posts](/guest-posts), [niche edits](/niche-edits) and [digital PR](/digital-pr) each leave a different footprint. A profile built entirely from one of them looks procured. A profile that mixes them looks like a business that has been doing several things over time, which is what you want, because it is also true.

## Spread across time

The single most common mistake is buying a large batch in one month because budget appeared, then nothing for two quarters. Steady acquisition is both safer and easier to learn from: when everything arrives at once, you cannot tell which placements did anything.

## Give people something worth linking to

None of the above helps if the pages receiving the links are thin. Links get a page considered; the page has to earn the position once it is there. This is why [content and link building](/content-writing) work better planned together than bought separately.

## A workable review rhythm

- Every month, check anchor distribution across the whole profile rather than the latest batch
- Every quarter, look at which target pages have moved and which have not
- Before each campaign, confirm the target pages are actually ready to receive traffic
- After a core update, wait for the rollout to finish before changing anything

That last point matters. Most of the damage done after an update is done by people reacting to partial data in week one.`,
  },

  {
    id: 'post_seed_002',
    slug: 'what-drives-the-price-of-a-link-placement',
    title: 'What actually drives the price of a link placement',
    excerpt:
      'Why two sites with the same domain rating can be priced very differently, and which of those factors are worth paying for.',
    category: 'link-building',
    status: 'published',
    author,
    publishedAt: '2026-07-30T09:00:00.000Z',
    createdAt: '2026-07-30T09:00:00.000Z',
    updatedAt: '2026-07-30T09:00:00.000Z',
    seoTitle: 'What drives the price of a link placement',
    seoDescription:
      'Why two sites with the same domain rating can be priced very differently, and which of those factors are actually worth paying for.',
    body: `Publisher pricing looks arbitrary until you know what publishers are actually pricing. It is rarely the metric you are looking at.

## Authority is the headline, not the driver

Domain rating and similar scores correlate with price because they correlate with everything else. On their own they are third-party estimates, and they can be inflated deliberately by a site that has bought its way to a number.

A site with a strong score and negligible organic traffic is the clearest warning sign in the marketplace. Someone built that score on purpose, and it was not for your benefit.

## Traffic is closer to the truth

Real organic traffic is harder to fake than authority, and it reflects something that matters: whether anyone will actually read the page your link sits on. Two sites at the same DR can differ by an order of magnitude in traffic, and that difference is usually the difference in price.

Look at how the traffic is distributed, too. A site with one freak page carrying everything is a weaker prospect than one with traffic spread across a catalogue.

## Niche moves price more than anything else

Finance, legal, health, gambling and crypto cost more everywhere, for reasons that have nothing to do with SEO. Those sites carry regulatory exposure, their advertisers pay more, and fewer publishers will touch the content at all. A site that will accept a gambling placement is pricing scarcity.

If you work in an expensive niche, the useful response is to widen the definition of relevance rather than to hunt for a discount. Adjacent sectors are often genuinely relevant and priced normally.

## Editorial standards cost money

Sites that edit properly are slower and more expensive, because a person reads the piece and sometimes rejects it. That cost is worth paying: a site that publishes anything will publish anything for your competitors too, and the value of a link from it falls accordingly.

## What is not worth paying extra for

- A high DR with traffic that does not support it
- A "homepage link" - it is the first thing dropped in a cleanup
- Guaranteed permanence, which nobody can actually guarantee
- Bundles priced by metric band rather than by named site

## How to use this

Filter by relevance first, then look at traffic, then look at price. Sort the marketplace by price and you will end up with a shortlist of whatever is cheapest, which is a different exercise entirely.

Our [marketplace](/marketplace) shows the price of every placement upfront, per site, so you can make this comparison directly rather than by requesting quotes.`,
  },

  {
    id: 'post_seed_003',
    slug: 'guest-post-vs-niche-edit',
    title: 'Guest post vs niche edit: choosing the right one per page',
    excerpt:
      'When a new article beats an insertion, how the age of the host page affects results, and the anchor differences between the two.',
    category: 'link-building',
    status: 'published',
    author,
    publishedAt: '2026-07-02T09:00:00.000Z',
    createdAt: '2026-07-02T09:00:00.000Z',
    updatedAt: '2026-07-02T09:00:00.000Z',
    seoTitle: 'Guest post vs niche edit: which to use, and when',
    seoDescription:
      'When a new article beats a link insertion, how host page age affects results, and how anchor choice differs between guest posts and niche edits.',
    body: `These get discussed as competing products. They are better understood as answers to two different questions.

## The actual difference

A [guest post](/guest-posts) creates a new article on a publisher's site, written around a subject you choose. You control the framing, the supporting argument and where the link sits.

A [niche edit](/niche-edits) adds your link to an article the publisher already published. The page exists, it is indexed, and it may already receive traffic - but you are working inside somebody else's sentence.

## Choose a guest post when the context does not exist yet

If the useful link is one that explains something - why your approach differs, what problem your product solves, how a process works - that explanation has to live somewhere. An existing article almost never contains it.

Guest posts suit:

- New pages with nothing pointing at them
- Competitive commercial terms where framing matters
- Subjects your site has not established authority on
- Anything where you want the whole piece working for you

## Choose a niche edit when it already does

If a publisher has an article covering your subject and your page genuinely adds to it, an insertion is faster and lands on a page with history behind it.

Niche edits suit:

- Target pages that are already ranking and need reinforcement
- Campaigns where turnaround matters
- Cases where a full article would be more context than the link warrants

## The anchor difference nobody mentions

In a guest post you write the sentence, so the anchor can be whatever you want - which is precisely the risk. It is very easy to write a sentence that exists only to carry an exact-match anchor, and it reads exactly like what it is.

In a niche edit the sentence already exists, so the anchor has to fit it. That constraint is usually a gift: it pushes you toward phrasing a real writer would have used.

## Does host page age matter?

An older indexed page is generally a better home than a brand new one, because it has had time to accumulate its own signals. But this is easy to overrate. A five-year-old page with no traffic is not better than a six-month-old page that people actually read.

## In practice, use both

Most campaigns that work use niche edits to keep momentum on pages that are close, and guest posts to do the heavier work on pages starting from nothing. Treating it as a binary choice is how you end up with a profile made of one thing.`,
  },

  {
    id: 'post_seed_004',
    slug: 'briefing-content-that-ranks-and-reads-well',
    title: 'Briefing content that ranks and still reads well',
    excerpt:
      'Most weak articles are weak because the brief was weak. What to put in one, and what to leave to the writer.',
    category: 'content',
    status: 'published',
    author,
    publishedAt: '2026-06-11T09:00:00.000Z',
    createdAt: '2026-06-11T09:00:00.000Z',
    updatedAt: '2026-06-11T09:00:00.000Z',
    seoTitle: 'How to brief SEO content that ranks and reads well',
    seoDescription:
      'Most weak articles are weak because the brief was weak. What belongs in a content brief, what to leave to the writer, and why keyword lists are not a brief.',
    body: `A keyword and a word count is not a brief. It is a purchase order, and you will get back roughly what you asked for.

## Start from the search results, not the keyword

Before writing a brief, look at what currently ranks for the term. Not to copy it - to find the gap. Almost every competitive result has something conspicuously missing: a step nobody explains, a comparison nobody makes, a caveat everyone avoids because it is inconvenient.

That gap is the article. The keyword is just how people find it.

## What belongs in a brief

- **The target page and why it deserves the link.** A writer who knows what the article is supporting will place the link somewhere sensible.
- **Who is reading.** "In-house marketing managers at mid-market B2B brands" produces a different piece from "SEO freelancers".
- **The angle.** One sentence on what this article argues that others do not.
- **What to avoid.** Claims you cannot support, competitors you would rather not name, phrasing your legal team dislikes.
- **Any real expertise you have.** A single specific detail from someone who does the job is worth more than a paragraph of generalities.

## What to leave alone

Structure, mostly. A brief that dictates every subheading produces an article that follows the subheadings and argues nothing. Give a writer the destination and let them find the route.

Word count is worth holding loosely too. Padding an article to hit a number is the most reliable way to make it worse, and length has never been the thing being rewarded - coverage is.

## Keyword lists are the weakest part of most briefs

Handing over twenty secondary keywords produces an article that mentions twenty things and explores none. Two or three genuinely related terms are plenty; a good writer covering a subject properly will hit the rest without being told.

## The test before you approve it

Read the draft and ask whether you would send it to a colleague who asked the question. If the honest answer is no, more keywords will not fix it.

If you would rather not run this process yourself, our [content writing service](/content-writing) briefs from the search results as standard, and you can order articles without buying a placement.`,
  },

  {
    id: 'post_seed_005',
    slug: 'running-link-building-across-many-clients',
    title: 'Running link building across a dozen clients without losing track',
    excerpt:
      'The operational problems that appear at agency scale, and the handful of decisions that prevent most of them.',
    category: 'agency-growth',
    status: 'published',
    author,
    publishedAt: '2026-05-20T09:00:00.000Z',
    createdAt: '2026-05-20T09:00:00.000Z',
    updatedAt: '2026-05-20T09:00:00.000Z',
    seoTitle: 'Running link building across many clients',
    seoDescription:
      'The operational problems that appear when you run link building for a dozen clients, and the decisions that prevent most of them.',
    body: `Link building for one site is tedious. For twelve it becomes an operations problem, and it fails in operational ways rather than strategic ones.

## The failures are always the same three

**Price drift.** Different suppliers quote differently, quotes expire, and nobody remembers what was agreed. Margins become unknowable until the invoices land.

**Lost placements.** A link goes live, nobody records the URL, and three months later you cannot prove the work happened. This is the one that loses renewals.

**Person-shaped dependencies.** One person knows which publisher accepts which niche and what they charge. That knowledge is not written down anywhere, and they are on holiday.

## Fix pricing first

Fixed, visible prices are worth more at agency scale than a discount is. A retainer built on known costs can be quoted confidently; one built on estimates has to be padded, and the padding is usually larger than any discount you would have negotiated.

## Record the live URL at the moment it goes live

Not weekly, not at reporting time. The gap between publication and recording is where placements disappear. Whatever system you use, the live URL should be captured as part of marking the order complete, not as a separate task somebody has to remember.

## Standardise the brief, not the strategy

Each client needs a different plan. None of them needs a different process. One brief format, one set of anchor rules, one approval step - applied across every account - removes most of the coordination overhead without flattening the strategy.

## Keep content in the same place as placements

Content is the bottleneck at volume, and splitting it across a separate supplier doubles the coordination. Briefing an article against the same keyword and target page as the placement it supports, in the same system, removes an entire class of mistakes.

## What we are still building

Press Parrot gives agencies one marketplace, consistent pricing and a single order queue today. Per-client workspaces, user seats for your team and client-facing reporting are on the roadmap rather than live - we would rather say so than let you discover it after signing up. There is more detail on [how agencies use the platform](/link-building-agencies).`,
  },

  {
    id: 'post_seed_006',
    slug: 'how-we-vet-publishers',
    title: 'How we vet publishers before they reach the marketplace',
    excerpt:
      'The checks a site has to pass to be listed, why we reject sites rather than discounting them, and what we cannot promise.',
    category: 'link-building',
    status: 'draft',
    author,
    publishedAt: '2026-09-20T09:00:00.000Z',
    createdAt: '2026-09-10T09:00:00.000Z',
    updatedAt: '2026-09-10T09:00:00.000Z',
    seoTitle: 'How Press Parrot vets publishers',
    seoDescription:
      'The checks a website has to pass before it is listed in the Press Parrot marketplace, and what vetting can and cannot tell you.',
    body: `This is a draft. Edit or delete it in the admin - it exists to show how drafts behave: it is visible here and invisible on the public site.

## What we check

- Whether the organic traffic is real and reasonably distributed
- Whether the site publishes genuine editorial content alongside sponsored work
- How many commercial outbound links its articles already carry
- Whether pages are indexed and the publishing history is plausible
- Whether the authority comes from somewhere credible rather than a link network

## Why rejection rather than a discount

A cheap listing on a weak site is not a bargain, it is a different product sold under the same name. Sites that fail are not listed.

## What vetting cannot tell you

Vetting says a site is legitimate today. It cannot promise a publisher will never change hands, never start selling links aggressively, or never be hit by an update. We re-check listings, but anybody claiming certainty here is overselling.`,
  },
];
