/**
 * The homepage's content, checked against what it carried before the redesign.
 *
 * A redesign cannot rewrite the homepage's copy: almost none of it is in this
 * repository. The words live in `page_content` and the components only name the
 * fields they read, so what ships here is the default each field falls back to.
 *
 * What a redesign *can* do is stop reading a field. That deletes a paragraph as
 * surely as rewriting it would and it has no symptoms: the page still renders,
 * the build still passes, and the only way to notice is for somebody to
 * remember the sentence used to be there. This suite is that memory.
 *
 * So the check is a snapshot, deliberately. The list below is the 68 fields the
 * homepage read on 2026-10-14, the morning of the redesign, extracted from the
 * component tree rather than typed out. Adding a section to the homepage means
 * adding its fields here; removing one means deleting a line, in a diff where
 * somebody has to look at it and agree.
 *
 * It needs no key, no database and no network - it reads the source.
 *
 * `docs/homepage-content-inventory.md` is the same inventory with the reasoning
 * the assertions cannot hold.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

let checks = 0;
let failures = 0;

function ok(condition: boolean, description: string) {
  checks += 1;
  if (condition) return;
  failures += 1;
  console.error(`  FAIL  ${description}`);
}

function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

/**
 * Every file that can hold a homepage content read.
 *
 * The route plus `components/home`, which is where the fallback's sections
 * live. `FinalCta` reads the homepage's own `finalCta.*` while being shared
 * with two other pages, and it is in that directory, so it is covered.
 */
const SOURCES = [
  'src/app/(marketing)/page.tsx',
  ...fs
    .readdirSync(path.join(ROOT, 'src/components/home'))
    .filter((entry) => entry.endsWith('.tsx'))
    .map((entry) => `src/components/home/${entry}`),
];

const sources = SOURCES.map((relative) => ({ relative, text: read(relative) }));
const everything = sources.map((entry) => entry.text).join('\n');

/**
 * The fields the page reads, as `pageContentService` sees them.
 *
 * Both call shapes, because `content.list<{...}>(...)` over three lines is how
 * half of them are written and a single-line regex finds none of those.
 */
function fieldsRead(text: string): Set<string> {
  const found = new Set<string>();
  const patterns = [
    /content\.(?:text|list|link|richText)\s*(?:<[^(]*?>)?\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,?\s*\)/g,
    /content\s*\n?\s*\.(?:text|list|link|richText)\s*(?:<[\s\S]{0,300}?>)?\(\s*'([^']+)'\s*,\s*\n?\s*'([^']+)'\s*,?\s*\n?\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) found.add(`${match[1]}.${match[2]}`);
  }
  return found;
}

const read_fields = fieldsRead(everything);

/* ------------------------------------------------------------------------ */
/* 1. The 68 fields the page carried before the redesign                     */
/* ------------------------------------------------------------------------ */

const BEFORE = [
  'agencies.body',
  'agencies.eyebrow',
  'agencies.heading',
  'agencies.items',
  'agencies.primaryCta',
  'agencies.secondaryCta',
  'checklist.body',
  'checklist.heading',
  'checklist.items',
  'comparison.bad',
  'comparison.badTitle',
  'comparison.body',
  'comparison.good',
  'comparison.goodTitle',
  'comparison.heading',
  'editorial.articles',
  'editorial.eyebrow',
  'editorial.heading',
  'features.heading',
  'features.intro',
  'features.items',
  'finalCta.annotation',
  'finalCta.body',
  'finalCta.heading',
  'finalCta.primaryCta',
  'finalCta.secondaryCta',
  'hero.eyebrow',
  'hero.intro',
  'hero.primaryCta',
  'hero.reassurance',
  'hero.secondaryCta',
  'hero.titleAccent',
  'hero.titleLine1',
  'hero.titleLine2',
  'marketplace.body',
  'marketplace.cta',
  'marketplace.ctaCaption',
  'marketplace.eyebrow',
  'marketplace.heading',
  'metricCards.body',
  'metricCards.cta',
  'metricCards.heading',
  'metricCards.items',
  'metrics.countriesLabel',
  'metrics.items',
  'metrics.nichesLabel',
  'metrics.websitesLabel',
  'parrotSays.body',
  'parrotSays.label',
  'search.body',
  'search.cta',
  'search.heading',
  'search.note',
  'search.placeholder',
  'services.heading',
  'services.intro',
  'services.items',
  'steps.eyebrow',
  'steps.heading',
  'steps.items',
  'why.annotation',
  'why.body',
  'why.cta',
  'why.heading',
  'why.newHeading',
  'why.newWay',
  'why.oldHeading',
  'why.oldWay',
];

ok(BEFORE.length === 68, 'the snapshot holds the 68 fields the page read before the redesign');

for (const field of BEFORE) {
  ok(read_fields.has(field), `the homepage still reads ${field}`);
}

/*
  And the FAQ, which is read in the route rather than through a component and
  under a name the pattern above would miss if it ever changed shape.
*/
ok(
  /content\s*\n?\s*\.list<\{ question: string; answer: string \}>\('faqs', 'items'\)/.test(
    read('src/app/(marketing)/page.tsx'),
  ),
  'the homepage still reads faqs.items',
);

/* ------------------------------------------------------------------------ */
/* 2. The wording that is in code rather than in the CMS                     */
/* ------------------------------------------------------------------------ */

const STRINGS: [string, string][] = [
  ['Explore by niche', 'the niche grid heading'],
  ['Hand picked opportunities', "the niche grid's eyebrow"],
  ['Trusted by SEOs worldwide', 'the social proof heading'],
  ['On this page', "the editorial's contents heading"],
  ['Filter by', 'the label above the marketplace filter list'],
  ['What it measures', 'the metric card link text'],
  ['Coming soon', 'the badge on an unbuilt feature'],
  ['See the whole marketplace', 'the link out of the niche grid'],
];

for (const [text, description] of STRINGS) {
  ok(everything.includes(text), `${description} is still on the page: "${text}"`);
}

/** The seven filters named beside the marketplace preview. */
const FILTERS = [
  'DR',
  'Organic Traffic',
  'Referring Domains',
  'Country',
  'Niche',
  'Price',
  'Turnaround',
];
const marketplaceSection = read('src/components/home/marketplace-section.tsx');
for (const filter of FILTERS) {
  ok(
    new RegExp(`'${filter}',`).test(marketplaceSection),
    `the marketplace preview still lists the ${filter} filter`,
  );
}

/* ------------------------------------------------------------------------ */
/* 3. Where the links go                                                     */
/* ------------------------------------------------------------------------ */

const nicheGrid = read('src/components/home/niche-grid.tsx');
/*
  Through `signupFor`, which is where these two links point now.

  The destination is unchanged - the inventory needs an account either way,
  and the gate answered the old hrefs with a 307 to the same signup. What
  changed is that the homepage no longer spends a redirect saying so, and the
  niche a visitor picked is carried in the `next` rather than reconstructed.
  The assertion is the same one it always was: this grid leads to the
  marketplace, and each tile leads to its own filter.
*/
ok(nicheGrid.includes('href={signupFor()}'), 'the niche grid still leads to the marketplace');
ok(
  nicheGrid.includes('href={signupFor(`/marketplace?niche=${slug}`)}'),
  'each niche still leads to its own marketplace filter',
);
ok(
  read('src/components/home/seo-editorial.tsx').includes('href={`#${article.id}`}'),
  "the editorial's contents list still links to its own articles",
);
ok(
  read('src/components/home/metric-cards.tsx').includes('href={item.href}'),
  'each metric card still links where the CMS says',
);

/** Ten niches, each of them a link. The grid is what ties the homepage to the
    marketplace's own filters, and a shorter list is ten fewer internal links. */
const featured = nicheGrid.match(/const featured: NicheSlug\[\] = \[([\s\S]*?)\];/);
ok(
  (featured?.[1]?.match(/'/g)?.length ?? 0) / 2 === 10,
  'the niche grid still links to all ten featured niches',
);

/* ------------------------------------------------------------------------ */
/* 4. Metadata and structured data                                           */
/* ------------------------------------------------------------------------ */

const route = read('src/app/(marketing)/page.tsx');
ok(route.includes("metadataForPage(SLUG)"), 'the title and description still come from the CMS');
ok(
  route.includes('title: { absolute:'),
  'the title is still absolute, so the brand is not appended twice',
);
ok(route.includes("'@type': 'Organization'"), 'the organisation structured data is still emitted');
ok(route.includes("'@type': 'FAQPage'"), 'the FAQ structured data is still emitted');
ok(
  (route.match(/'@type': 'FAQPage'/g) ?? []).length === 1,
  'there is still exactly one FAQ block on the page',
);
ok(
  /faqs\.length \? \(\s*<script/.test(route),
  'the FAQ structured data is still conditional on there being questions',
);

/* ------------------------------------------------------------------------ */
/* 5. The redesign's own rules                                               */
/* ------------------------------------------------------------------------ */

/*
  The page still hands `PageSections` a fallback. A homepage converted to the
  page builder has to keep winning over this composition - that is what makes
  the conversion reversible, and verify:sections checks the same thing from the
  other side.
*/
ok(/<PageSections[\s\S]*?fallback=\{/.test(route), 'the route still renders sections first');

/*
  No two plain-white bands next to each other, which is the one thing the brief
  asked of the colour. Read out of the route in the order the sections are
  rendered rather than asserted about any one of them.
*/
const BAND_ORDER = [
  ['Hero', 'white'],
  ['TrustedBy', 'grey'],
  ['ShowcaseSection', 'green'],
  ['SeoMetricsSection', 'white'],
  ['NicheGrid', 'grey'],
  ['HowItWorks', 'white'],
  ['MarketplaceSection', 'grey'],
  ['WhyPressParrot', 'green'],
  ['ServicesGrid', 'white'],
  ['PlatformFeatures', 'grey'],
  ['AgenciesSection', 'white'],
  ['SeoEditorial', 'grey'],
  ['ParrotSaysSection', 'green'],
  ['MarketplaceSearchSection', 'white'],
  ['ComparisonSection', 'grey'],
  ['ChecklistSection', 'white'],
  ['MetricCards', 'green'],
  ['Faq', 'grey'],
  ['FinalCta', 'white'],
] as const;

for (let index = 1; index < BAND_ORDER.length; index += 1) {
  const [name, colour] = BAND_ORDER[index]!;
  const [previousName, previousColour] = BAND_ORDER[index - 1]!;
  ok(
    !(colour === 'white' && previousColour === 'white'),
    `${name} does not sit on the same white as ${previousName}`,
  );
}

/** And the order those sections are actually rendered in matches the list. */
const positions = BAND_ORDER.map(([name]) => route.indexOf(`<${name}`));
ok(
  positions.every((at) => at > -1),
  'every section in the colour plan is actually rendered by the route',
);
ok(
  positions.every((at, index) => index === 0 || at > positions[index - 1]!),
  'the sections are rendered in the order the colour plan assumes',
);

/** The colour each one gets, where the route or the component says so. */
const COLOURS: Record<string, string> = { grey: 'bg-surface', green: 'bg-accent-50' };
for (const [name, colour] of BAND_ORDER) {
  const expected = COLOURS[colour];
  if (!expected) continue;
  const file = `src/components/home/${name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()}.tsx`;
  if (!fs.existsSync(path.join(ROOT, file))) continue;
  ok(read(file).includes(expected), `${name} draws its band as ${colour}`);
}

/*
  The two new sections carry no copy of their own.

  Every word in them is a CMS field, which is the rule the brief set and the
  one a redesign breaks by accident: a heading typed into a component is a
  heading an editor can no longer change, and nobody finds out until they try.
*/
for (const file of [
  'src/components/home/showcase-section.tsx',
  'src/components/home/seo-metrics-section.tsx',
]) {
  const text = read(file);
  const headings = [...text.matchAll(/<h[1-3][^>]*>\s*([^<{\s][^<]*)</g)];
  ok(headings.length === 0, `${file} hardcodes no heading`);
  for (const field of ['eyebrow', 'heading', 'body', 'caption']) {
    ok(text.includes(`'${field}'`), `${file} reads its ${field} from the CMS`);
  }
}

ok(
  read_fields.has('showcase.heading') && read_fields.has('seoMetrics.heading'),
  'both new sections read their heading through the content accessors',
);

/*
  The animated panels are decoration over prose that says the same thing, so
  they are hidden from a screen reader rather than read out as a list of
  numbers nobody can navigate.
*/
for (const file of [
  'src/components/home/marketplace-showcase.tsx',
  'src/components/guest-posts/marketplace-demo.tsx',
]) {
  /*
    The panel's own element, not any element in the file.

    The first version of this check was `includes('aria-hidden="true"')`, which
    every icon in both files satisfies on its own - so it passed with the panel
    wide open to a screen reader. Anchored to the fixed-height frame instead.
  */
  ok(
    /className="relative h-\[[^"]*overflow-hidden[^"]*"\s*\n\s*aria-hidden="true"/.test(
      read(file),
    ),
    `${file} hides its panel from assistive software`,
  );
}

/*
  And they stop when nobody is looking, and hold still when asked to. Both are
  cheap to lose in an edit and neither is visible in a screenshot.
*/
const showcase = read('src/components/home/marketplace-showcase.tsx');
ok(showcase.includes('useInView'), 'the showcase only runs while it is on screen');
ok(showcase.includes('useReducedMotion'), 'the showcase honours a request for stillness');
ok(
  /if \(still \|\| !onScreen\) return;/.test(showcase),
  'the showcase sets no timer at all when still or off screen',
);
ok(
  /const shown: ShowcaseStep = still \? 'save'/.test(showcase),
  'stillness renders the beat the sequence exists to arrive at',
);

/** One fixed height on the panel. A min-height would let a beat move the page. */
ok(
  /className="relative h-\[\d+(?:\.\d+)?rem\] w-full overflow-hidden/.test(showcase),
  'the showcase panel is a fixed height at every breakpoint',
);
ok(!showcase.includes('min-h-['), 'the showcase panel has no min-height to grow past');

/*
  Six captions, seven beats, and the mapping between them is explicit. An
  off-by-one here highlights the wrong sentence rather than failing, so it is
  checked rather than trusted: every beat names a caption, and every caption
  from 0 to 5 is named by at least one beat.
*/
const captionMap = showcase.match(/const CAPTION: Record<ShowcaseStep, number> = \{([\s\S]*?)\};/);
const captionValues = [...(captionMap?.[1] ?? '').matchAll(/(\w+): (\d+),/g)];
const steps = showcase.match(/const STEPS = \[([^\]]*)\]/);
const stepNames = [...(steps?.[1] ?? '').matchAll(/'([^']+)'/g)].map((match) => match[1]!);
ok(stepNames.length === 7, 'the showcase has seven beats');
ok(captionValues.length === stepNames.length, 'every beat names the caption it belongs to');
ok(
  stepNames.every((name) => captionValues.some(([, beat]) => beat === name)),
  'every beat appears in the caption map by name',
);
const named = new Set(captionValues.map(([, , index]) => Number(index)));
ok([0, 1, 2, 3, 4, 5].every((index) => named.has(index)), 'all six captions are reachable');
ok(!named.has(6), 'no beat points at a seventh caption that does not exist');

/**
 * Six captions shipped, in the order the beats run.
 *
 * Counted inside the `steps` array rather than across the whole section: the
 * section's button is a `label` too, and the first version of this check
 * counted seven and called it a failure.
 */
const defaults = read('src/lib/cms/pages/home.ts');
const showcaseSteps = defaults.match(/ {4}steps: \[([\s\S]*?)\n {4}\],/);
ok(
  (showcaseSteps?.[1]?.match(/label: '/g) ?? []).length === 6,
  'six captions ship as defaults, one per beat',
);
ok(
  (showcaseSteps?.[1]?.match(/body: '/g) ?? []).length === 6,
  'each of the six carries its line of explanation',
);

/*
  Nothing in either animation can be mistaken for a real publisher. `.example`
  is reserved by RFC 2606, so no domain in here is registrable - which is a
  fact about the data rather than a promise about a screenshot.
*/
const demoData = read('src/lib/marketing/demo-data.ts');
const domains = [...demoData.matchAll(/domain: '([^']+)'/g)].map((match) => match[1]!);
ok(domains.length >= 5, 'the demonstration has publishers in it');
ok(
  domains.every((domain) => domain.endsWith('.example')),
  'every invented publisher is on a reserved .example domain',
);

/*
  And the filters narrow the list by the figures rather than by assertion: the
  niche leaves two publishers and all three filters leave both, so what a
  visitor watches is what the numbers actually do.
*/
const ratings = [...demoData.matchAll(/domainRating: (\d+)/g)].map((match) => Number(match[1]));
const traffic = [...demoData.matchAll(/traffic: (\d+)/g)].map((match) => Number(match[1]));
const niches = [...demoData.matchAll(/ {4}niche: '([^']+)'/g)].map((match) => match[1]);
const financeRows = niches.map((_, index) => index).filter((index) => niches[index] === 'finance');
ok(financeRows.length === 2, 'two of the invented publishers are in the niche the showcase picks');
ok(
  financeRows.every((index) => ratings[index]! >= 50 && traffic[index]! >= 20000),
  'both of them clear the floors the showcase filters on',
);
ok(
  niches.length > financeRows.length,
  'and there are publishers outside that niche for the filter to remove',
);

/* ------------------------------------------------------------------------ */
/* 6. Both homepages, not one                                                */
/* ------------------------------------------------------------------------ */

/*
  This is the check that would have saved a day.

  The route asks `PageSections` for rows and renders `LegacyHomePage` only
  when there are none. The live site has rows, so the composition in
  `page.tsx` is not what anybody sees - and a redesign built entirely in it
  shipped, passed every test, went green in CI and changed nothing.

  Nothing about that was detectable from here: rows are data, this is code,
  and a clone has no database. What *is* detectable is the asymmetry - a band
  that exists on one path and not the other. So every showpiece the fallback
  draws has to be reachable from the builder too, which is the thing that was
  actually missing.
*/

const builder = read('src/components/cms/sections/home.tsx');
const schema = read('src/lib/cms/components/schema.ts');
const renderers = read('src/lib/cms/components/render.tsx');

/** The components a built homepage can be given, on both halves of the registry. */
for (const key of ['marketplace-showcase', 'seo-metrics']) {
  ok(schema.includes(`key: '${key}'`), `the editor can add a ${key} section`);
  ok(renderers.includes(`'${key}':`), `and the public site knows how to draw it`);
}

/*
  The two animated panels, reachable from both paths.

  Named by their import rather than by their markup: the two compositions
  around them differ and should be allowed to, but a panel that only one of
  them can render is a band the live page cannot have.
*/
const SHOWPIECES: [string, string][] = [
  ['MarketplaceShowcase', 'src/components/home/showcase-section.tsx'],
  ['MetricsShowcase', 'src/components/home/seo-metrics-section.tsx'],
];
for (const [component, fallbackFile] of SHOWPIECES) {
  /*
    `<Component`, not the bare name.

    The first version looked for the word, and passed when the builder's
    section had stopped rendering the panel entirely - because the doc comment
    above it still mentioned the component by name. A check a comment can
    satisfy is a check of the comments.
  */
  const drawn = new RegExp(`<${component}[\\s/>]`);
  ok(drawn.test(read(fallbackFile)), `the fallback homepage draws ${component}`);
  ok(drawn.test(builder), `and a built homepage can draw ${component} too`);
}

/*
  And the copy is the same copy. The fallback reads `showcase.*` from
  `page_content`; a section carries its own values and falls back to the
  component's defaults. Two sets of defaults that drift are two homepages
  saying different things, so the headings are checked against each other
  rather than assumed.
*/
for (const sentence of [
  'Find the Right Websites. Without the Guesswork.',
  'Judge a Website on Measurements, Not on a Sales Email',
  // The body and the bullets too, not only the headings. These are the lines
  // that had to be corrected in two files by hand when the twelve-month claim
  // turned out to be wrong, which is the moment a second copy drifts.
  'Every listing in the marketplace carries all four, measured by Ahrefs rather than quoted to us.',
  'Organic search traffic, measured rather than quoted by the publisher',
]) {
  ok(defaults.includes(sentence), `the field editor ships "${sentence.slice(0, 32)}..."`);
  ok(schema.includes(sentence), 'and the section ships the same words');
}

/*
  And neither of them promises twelve months of traffic history.

  A listing has none: `traffic_trend` ships empty from the CSV importer and
  the refresh's select is point-in-time, so the listing page's own panel reads
  "Not recorded". Buying it is measured rather than assumed - 11 units a row
  for `date,org_traffic` against the free ahrefs.com target, so 143 units for
  one domain's thirteen monthly rows and 1.74 million for 12,190 listings,
  against a two million unit monthly allowance.

  Phrased as an absence because that is what it is: the claim has to stay out,
  and a check that something is missing is the only kind that says so.
*/
for (const [label, text] of [
  ['the field editor', defaults],
  ['the section', schema],
] as const) {
  const claim = /(twelve months|12 months) of organic traffic|organic traffic over (twelve|12) months/i;
  ok(!claim.test(text), `${label} does not promise traffic history a listing has not got`);
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) {
  console.error(`${failures} failed`);
  process.exit(1);
}
