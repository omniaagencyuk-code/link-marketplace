# The homepage's content, written down before it was redesigned

This is the inventory the homepage redesign was checked against: every heading,
paragraph, link, question, image and metadata field the page carried before,
and where each one comes from. It exists so that "nothing was lost" is a thing
that can be checked rather than asserted.

`npm run verify:home` checks the mechanical half of it on every run and in CI.
What follows is the reasoning the suite cannot hold.

## Where the words actually live

Almost none of the homepage's copy is in the repository. The page reads it from
`page_content` through `pageContentService.content('home')`, and what ships in
`src/lib/cms/pages/home.ts` is only the default each field falls back to when
nobody has edited it. The live headline is not in this codebase at all, which
is the clearest proof of the arrangement.

That is what makes the preservation requirement checkable at all. A redesign
cannot alter copy it does not hold. What it *can* do - and what the check below
is for - is stop reading a field, which deletes a paragraph as surely as
rewriting it would, and does it silently.

So the inventory is a list of **fields the page must still read**, not a list of
sentences. 68 of them, below.

## What renders

`src/app/(marketing)/page.tsx` asks `PageSections` for this page's rows. There
are none in the repository's own data, so the page renders its `fallback`, which
is `LegacyHomePage` in the same file - the composition redesigned here.

If the live site's `page_sections` table has ever been given rows for `home`
(the admin's page builder, or `src/lib/cms/migrate/page-to-sections.ts`), the
built page wins and this redesign does not appear. Nothing readable from here
settles that, so it is written down rather than assumed: **check
/admin/pages/home before judging the result**. The builder's own copies of
these bands live in `src/components/cms/sections/home.tsx` and were deliberately
left alone - editing them would restyle every page built from them.

## Metadata, unchanged

| What | Where it comes from | Touched? |
| --- | --- | --- |
| `<title>` | `seo.metaTitle`, via `metadataForPage('home')`, wrapped as `absolute` so the root template does not append the brand twice | no |
| `<meta name="description">` | `seo.metaDescription` | no |
| Canonical | `metadataForPage` | no |
| Open Graph image | `seo.ogImage`, falling back to the route's own `opengraph-image.png` | no |

`generateMetadata` was not edited. The three `seo.*` fields are not read by any
component, which is why they are absent from the field list below.

## Structured data

- **Organization** - emitted by the route itself, outside the fallback, from
  `brand`. Unchanged.
- **FAQPage** - emitted inside `LegacyHomePage`, built from `faqs.items`, and
  only when there is at least one complete question. Unchanged, and still the
  only FAQ block on the page.

## Images and their alt text

| Image | Alt | Where |
| --- | --- | --- |
| `/images/parrots/home-hero.webp` | `""`, `aria-hidden` | `hero-backdrop.tsx`, desktop |
| `/images/parrots/home-hero-portrait.webp` | `""`, `aria-hidden` | `hero-backdrop.tsx`, tablet and phone |
| Customer logos | the brand's own name | `trusted-by.tsx`, and `social-proof.ts` ships empty |

Both parrot photographs are decorative by design - the headline over them says
everything they do - and both are left exactly as they were. `hero-backdrop.tsx`
is shared with the page builder's hero, so it could not have been edited here
even if the brief had asked for it.

## The 68 fields the page must keep reading

Section and key as `pageContentService` sees them. The file column is where it
was read before the redesign; after it, several moved, and the suite checks the
*set* rather than the location.

| Field | Reader | Was read in |
| --- | --- | --- |
| `agencies.body` | text | `src/components/home/agencies-section.tsx` |
| `agencies.eyebrow` | text | `src/components/home/agencies-section.tsx` |
| `agencies.heading` | text | `src/components/home/agencies-section.tsx` |
| `agencies.items` | list | `src/components/home/agencies-section.tsx` |
| `agencies.primaryCta` | link | `src/components/home/agencies-section.tsx` |
| `agencies.secondaryCta` | link | `src/components/home/agencies-section.tsx` |
| `checklist.body` | text) | `src/app/(marketing/page.tsx` |
| `checklist.heading` | text) | `src/app/(marketing/page.tsx` |
| `checklist.items` | list) | `src/app/(marketing/page.tsx` |
| `comparison.bad` | list) | `src/app/(marketing/page.tsx` |
| `comparison.badTitle` | text) | `src/app/(marketing/page.tsx` |
| `comparison.body` | text) | `src/app/(marketing/page.tsx` |
| `comparison.good` | list) | `src/app/(marketing/page.tsx` |
| `comparison.goodTitle` | text) | `src/app/(marketing/page.tsx` |
| `comparison.heading` | text) | `src/app/(marketing/page.tsx` |
| `editorial.articles` | list | `src/components/home/seo-editorial.tsx` |
| `editorial.eyebrow` | text | `src/components/home/seo-editorial.tsx` |
| `editorial.heading` | text | `src/components/home/seo-editorial.tsx` |
| `features.heading` | text | `src/components/home/platform-features.tsx` |
| `features.intro` | text | `src/components/home/platform-features.tsx` |
| `features.items` | list | `src/components/home/platform-features.tsx` |
| `finalCta.annotation` | text | `src/components/home/final-cta.tsx` |
| `finalCta.body` | text | `src/components/home/final-cta.tsx` |
| `finalCta.heading` | text | `src/components/home/final-cta.tsx` |
| `finalCta.primaryCta` | link | `src/components/home/final-cta.tsx` |
| `finalCta.secondaryCta` | link | `src/components/home/final-cta.tsx` |
| `hero.eyebrow` | text | `src/components/home/hero.tsx` |
| `hero.intro` | text | `src/components/home/hero.tsx` |
| `hero.primaryCta` | link | `src/components/home/hero.tsx` |
| `hero.reassurance` | list | `src/components/home/hero.tsx` |
| `hero.secondaryCta` | link | `src/components/home/hero.tsx` |
| `hero.titleAccent` | text | `src/components/home/hero.tsx` |
| `hero.titleLine1` | text | `src/components/home/hero.tsx` |
| `hero.titleLine2` | text | `src/components/home/hero.tsx` |
| `marketplace.body` | text | `src/components/home/marketplace-section.tsx` |
| `marketplace.cta` | link | `src/components/home/marketplace-section.tsx` |
| `marketplace.ctaCaption` | text | `src/components/home/marketplace-section.tsx` |
| `marketplace.eyebrow` | text | `src/components/home/marketplace-section.tsx` |
| `marketplace.heading` | text | `src/components/home/marketplace-section.tsx` |
| `metricCards.body` | text | `src/components/home/metric-cards.tsx` |
| `metricCards.cta` | link | `src/components/home/metric-cards.tsx` |
| `metricCards.heading` | text | `src/components/home/metric-cards.tsx` |
| `metricCards.items` | list | `src/components/home/metric-cards.tsx` |
| `metrics.countriesLabel` | text | `src/components/home/trust-metrics.tsx` |
| `metrics.items` | list | `src/components/home/trust-metrics.tsx` |
| `metrics.nichesLabel` | text | `src/components/home/trust-metrics.tsx` |
| `metrics.websitesLabel` | text | `src/components/home/trust-metrics.tsx` |
| `parrotSays.body` | text) | `src/app/(marketing/page.tsx` |
| `parrotSays.label` | text) | `src/app/(marketing/page.tsx` |
| `search.body` | text) | `src/app/(marketing/page.tsx` |
| `search.cta` | link) | `src/app/(marketing/page.tsx` |
| `search.heading` | text) | `src/app/(marketing/page.tsx` |
| `search.note` | text) | `src/app/(marketing/page.tsx` |
| `search.placeholder` | text) | `src/app/(marketing/page.tsx` |
| `services.heading` | text | `src/components/home/services-grid.tsx` |
| `services.intro` | text | `src/components/home/services-grid.tsx` |
| `services.items` | list | `src/components/home/services-grid.tsx` |
| `steps.eyebrow` | text | `src/components/home/how-it-works.tsx` |
| `steps.heading` | text | `src/components/home/how-it-works.tsx` |
| `steps.items` | list | `src/components/home/how-it-works.tsx` |
| `why.annotation` | text | `src/components/home/why-press-parrot.tsx` |
| `why.body` | richText | `src/components/home/why-press-parrot.tsx` |
| `why.cta` | link | `src/components/home/why-press-parrot.tsx` |
| `why.heading` | text | `src/components/home/why-press-parrot.tsx` |
| `why.newHeading` | text | `src/components/home/why-press-parrot.tsx` |
| `why.newWay` | list | `src/components/home/why-press-parrot.tsx` |
| `why.oldHeading` | text | `src/components/home/why-press-parrot.tsx` |
| `why.oldWay` | list | `src/components/home/why-press-parrot.tsx` |

## Wording that is in code, not in the CMS

Five strings and five link destinations are written in components rather than
stored, so they are the ones a redesign could lose without the field check
noticing. All ten are asserted by name in `verify:home`.

| Wording | Element | Where |
| --- | --- | --- |
| Explore by niche | `h2` | `niche-grid.tsx` |
| Hand picked opportunities | eyebrow | `niche-grid.tsx` |
| Trusted by SEOs worldwide | `h2` | `trusted-by.tsx`, and it renders nothing while `social-proof.ts` is empty |
| On this page | `h3` | `seo-editorial.tsx`, above the contents list |
| Filter by | label | `marketplace-section.tsx`, above the seven filter names |
| What it measures | card link text | `metric-cards.tsx` |
| Coming soon | badge | `platform-features.tsx`, only where an editor typed `yes` |

The seven filter names in `marketplace-section.tsx` - DR, Organic Traffic,
Referring Domains, Country, Niche, Price, Turnaround - are also in code, and are
checked as a set.

| Destination | Anchor text | Where |
| --- | --- | --- |
| `/marketplace` | See the whole marketplace | `niche-grid.tsx` |
| `/marketplace?niche=<slug>` | the niche's own name, ten of them | `niche-grid.tsx` |
| `#<article id>` | the article's own heading | `seo-editorial.tsx`, the contents list |
| `/link-building-metrics#...` | the metric's own name | `metric-cards.tsx`, from `metricCards.items[].href` |

Every other link on the page is a CMS `link` field - `hero.primaryCta`,
`services.items[].cta`, `agencies.secondaryCta` and the rest - and is covered by
the field list. The internal links inside `editorial.articles[].content` are rich
text and travel with the content.

## The order of the page, before and after

Nothing was removed. Two sections were added and the backgrounds were
restaged so that no two plain-white bands sit next to each other.

| # | Section | Before | After |
| --- | --- | --- | --- |
| 1 | Hero, over the parrot photograph | white | white, untouched |
| 2 | Social proof and the counted figures | grey | grey |
| 3 | **Marketplace showcase** | - | **new**, soft green |
| 4 | **SEO metrics showcase** | - | **new**, white |
| 5 | Explore by niche | grey | grey |
| 6 | How it works | white | white |
| 7 | Marketplace preview | grey | grey |
| 8 | Why Press Parrot | grey | soft green |
| 9 | Services | white | white |
| 10 | Platform features | white | grey |
| 11 | For agencies | white | white |
| 12 | Link building, explained | white | grey |
| 13 | The parrot's aside | white | soft green |
| 14 | Find opportunities | grey | white |
| 15 | Good opportunity vs site to avoid | grey | grey |
| 16 | How to choose a website | white | white |
| 17 | What metrics to look at | white | soft green |
| 18 | FAQs | grey | grey |
| 19 | Closing call to action | white, dark card | unchanged |

Rows 13 to 16 are shared page-builder components. They were not edited: their
band colour is set from the route by the same `data-section-bg` wrapper the
builder uses, which is a rule in `globals.css` that outranks a component's own
`bg-white` without reaching into it.

Row 19 is shared with /pricing and /how-it-works and was left alone for that
reason.

## How the result was checked

1. `npm run verify:home` - every field above is still read, every string above
   is still in the markup, every link above still points where it did, and no
   copy that belongs to an editor was moved into a component. It is a snapshot
   test on purpose: it fails the day somebody drops a field, which is the
   failure mode that has no symptoms.
2. `npm run verify:sections` - the route still hands `PageSections` a fallback,
   so a built homepage still wins over the redesign.
3. The rendered HTML of the page before and after, diffed by heading, by
   paragraph, by link, by image and by structured data. The old page was built
   from a worktree at the commit before this one and served beside the new one,
   so the comparison is two running pages rather than two readings of the same
   source. What came back:

   | | before | after | lost | added |
   | --- | --- | --- | --- | --- |
   | `h1`, `h2`, `h3` | 45 | 51 | **0** | 6 |
   | paragraphs, list items, quotes | 163 | 203 | **0** | 40 |
   | links, by destination and anchor text | 41 | 43 | **0** | 2 |
   | images, by source and alt text | 3 | 12 | **0** | 9 |
   | JSON-LD blocks | 2 | 2 | **0** | 0 |

   Title, meta description, canonical and Open Graph image: identical, all four.
   `<details>` elements, which is to say content folded away behind a summary:
   11 before and 11 after, so nothing was hidden to make the page tidier.

   The six added headings are the two new sections and the four panel labels in
   the metrics showcase; the two added links are those sections' own buttons;
   the nine added images are country flags with empty alt text, which is what
   they should have - the percentage is beside each one in text.

4. With JavaScript switched off entirely: 0 of the 39 staggered cards are
   hidden. `Reveal` only ever hides what its own script has armed, so a crawler
   and a visitor with a failed bundle see the whole page.

The two new sections carry no content of their own: their heading, intro and
caption are new CMS fields with defaults, editable at /admin/pages/home like
everything else on the page. The invented publishers inside both animations are
`.example` domains, which RFC 2606 reserves, and the panels are `aria-hidden`
with the figures restated in the copy beside them.
