/**
 * Prove the /content-writing redesign kept every word the old page had, and
 * that it still cannot quote a price the checkout does not charge.
 *
 * ## Why this one does not use `service-redraw.mts`
 *
 * The other three redraws compare the new composition against
 * `ServicePage`, which is still in the repository because four other pages
 * render from it. This page never used that template: it had its own layout,
 * written inline in the route, because pricing is the centre of it. There is
 * no old component left to diff against, and keeping a dead copy of one so
 * that a suite could diff it would be shipping a second page nobody renders.
 *
 * So the expectations are read from the sources the page itself reads -
 * `cms/pages/content-writing.ts` for every word, `config/content.ts` for the
 * catalogue and the lengths, `content-pricing.ts` for the figures - which is
 * the same discipline, and in one respect a stronger one: a diff proves the
 * new page says what the old page said, while this proves it says what the
 * product actually offers.
 *
 * ## What this page can get wrong that the others cannot
 *
 * A number. The old file's first comment is the rule: an editor owns every
 * word here and none of the figures, because the page and the order form
 * must charge the same thing. A redesign that typed "£49" into a card would
 * look right, pass a type check, and quote a price the checkout does not
 * honour. So the price assertions run the real pricing functions against
 * three configurations - unset, tiered, per-word - and check the rendered
 * page against what `priceForWords` returns, including that an unset length
 * reads "On request" rather than free.
 *
 * No key, no database, no network, no browser.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FileText, Languages, Search, Users } from 'lucide-react';
import * as contentWriting from '../src/lib/cms/pages/content-writing';
import { ContentWritingPage } from '../src/components/content-writing/content-writing-page';
import { contentTypes, wordCountOptions } from '../src/lib/config/content';
import { isPricingConfigured, pricingTable, priceForWords } from '../src/lib/services/content-pricing';
import { contentAccessors, resolvePage } from '../src/lib/cms/resolve';
import { formatPrice } from '../src/lib/utils/format';
import { brand } from '../src/lib/config/brand';
import { checker, markdownLinks, normalise, phrases, readable, report } from './service-redraw.mts';
import type { ContentPricing } from '../src/lib/types/content';

const check = checker();
const { yes, is, bad, ok } = check;

/* ------------------------------------------------------------- fixtures */

/** Nothing configured. Every length must read "On request". */
const UNSET: ContentPricing = {
  mode: 'tiered',
  perWordMinor: 0,
  tiers: [],
  typeSurchargePct: {} as ContentPricing['typeSurchargePct'],
};

/** Tiers set for the short lengths only, so the long ones fall through. */
const TIERED: ContentPricing = {
  mode: 'tiered',
  perWordMinor: 0,
  tiers: [
    { words: 500, priceMinor: 4900 },
    { words: 1000, priceMinor: 8900 },
    { words: 1500, priceMinor: 12900 },
  ],
  typeSurchargePct: {} as ContentPricing['typeSurchargePct'],
};

/** Per word, which prices every length including the ones no tier covers. */
const PER_WORD: ContentPricing = {
  mode: 'per-word',
  perWordMinor: 9,
  tiers: [],
  typeSurchargePct: {} as ContentPricing['typeSurchargePct'],
};

const LENGTHS = [500, 1000, 1500, 2000, 3000] as const;

const resolved = resolvePage(contentWriting.definition, contentWriting.defaults, undefined);
const content = contentAccessors(resolved);

function render(pricing: ContentPricing, currency = 'GBP') {
  return renderToStaticMarkup(
    createElement(ContentWritingPage, {
      content,
      highlightIcons: [Search, Users, FileText, Languages],
      rows: pricingTable(pricing, LENGTHS),
      currency,
      configured: isPricingConfigured(pricing),
    } as never),
  );
}

const after = render(TIERED);
const afterText = readable(after);

type Shipped = typeof contentWriting.defaults & {
  hero: { eyebrow: string; title: string; intro: string; microcopy: string };
  highlights: { items: { title: string; body: string }[] };
  types: { heading: string; intro: string };
  pricing: {
    heading: string;
    introConfigured: string;
    introUnset: string;
    customHeading: string;
    customBody: string;
  };
  steps: {
    heading: string;
    items: { step: string; title: string; body: string }[];
    annotation: string;
    includesHeading: string;
    includes: { text: string }[];
  };
  body: { sections: { heading: string; content: string }[] };
  faqs: { items: { question: string; answer: string }[] };
  cta: { heading: string; body: string };
};

const shipped = contentWriting.defaults as unknown as Shipped;

/* ------------------------------------------- every word the page ships */

console.log('\n== every string the page ships is still rendered ==');
for (const [where, value] of [
  ['hero.eyebrow', shipped.hero.eyebrow],
  ['hero.title', shipped.hero.title],
  ['hero.intro', shipped.hero.intro],
  ['hero.microcopy', shipped.hero.microcopy],
  ['types.heading', shipped.types.heading],
  ['types.intro', shipped.types.intro],
  ['pricing.heading', shipped.pricing.heading],
  ['pricing.customHeading', shipped.pricing.customHeading],
  ['pricing.customBody', shipped.pricing.customBody],
  ['steps.heading', shipped.steps.heading],
  ['steps.annotation', shipped.steps.annotation],
  ['steps.includesHeading', shipped.steps.includesHeading],
  ['cta.heading', shipped.cta.heading],
  ['cta.body', shipped.cta.body],
] as [string, string][]) {
  yes(`${where} is on the page`, afterText.includes(normalise(value)));
}

console.log('\n== the four value points ==');
{
  const highlights = shipped.highlights.items;
  is('all four ship', highlights.length, 4);
  for (const highlight of highlights) {
    yes(`"${highlight.title}" is on the page`, afterText.includes(normalise(highlight.title)));
    yes('  with its explanation', afterText.includes(normalise(highlight.body)));
  }
}

console.log('\n== the four ordering steps, and the sidebar beside them ==');
{
  const steps = shipped.steps.items;
  is('four steps ship', steps.length, 4);
  for (const step of steps) {
    yes(`step ${step.step} "${step.title}" is on the page`, afterText.includes(normalise(step.title)));
    yes('  with its explanation', afterText.includes(normalise(step.body)));
    yes('  and its own number, not a count', after.includes(`Step ${step.step}`));
  }

  const includes = shipped.steps.includes;
  is('five things every article includes', includes.length, 5);
  for (const item of includes) {
    yes(`"${item.text}" is still listed`, afterText.includes(normalise(item.text)));
  }
}

console.log('\n== the long read: every heading, paragraph and bullet ==');
{
  const sections = shipped.body.sections;
  is('two editorial sections ship', sections.length, 2);

  for (const section of sections) {
    yes(`"${section.heading}" is a heading on the page`, after.includes(`>${section.heading}</h2>`));

    const lines = phrases(section.content);
    const missing = lines.filter((line) => !afterText.includes(line));
    for (const line of missing) bad(`  a line of "${section.heading}" is missing`, line.slice(0, 80));
    if (missing.length === 0) ok(`  and all ${lines.length} of its lines survive`);

    for (const link of markdownLinks(section.content)) {
      yes(
        `  "${link.label}" still links to ${link.href}`,
        after.includes(`href="${link.href}"`) && afterText.includes(link.label),
      );
    }
  }
}

console.log('\n== the questions, and the answers in the HTML ==');
{
  const faqs = shipped.faqs.items;
  is('six questions ship', faqs.length, 6);
  for (const faq of faqs) {
    yes(`"${faq.question}" is asked`, afterText.includes(normalise(faq.question)));
    /* In the markup, not fetched on open: `Faq` uses <details>, and this is
       the assertion that stops that becoming a click-to-load component. */
    yes('  and answered in the markup', afterText.includes(normalise(faq.answer)));
  }
}

console.log('\n== where the page sends people ==');
{
  /*
    Written down rather than read from the content, which is the one place
    this suite does that. The order form is the conversion path: if the
    button stops pointing at it the page still renders and still reads
    correctly, and nothing else here would notice.
  */
  const PINNED: [string, string][] = [
    ['/dashboard/content/new', 'Order Content'],
    ['#how-it-works', 'How It Works'],
    ['/signup?next=/marketplace', 'Explore the marketplace'],
    ['/link-building', 'link building'],
    ['/guest-posts', 'guest post'],
  ];

  /*
    Href and label together, inside one anchor. Checking them separately
    passed when the hero's button was repointed at /signup, because three
    buttons on this page share a destination and one of the others still
    carried it - the assertion was satisfied by a different link than the one
    it was about.
  */
  const anchors = [...after.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map(
    (match) => ({ href: match[1]!, text: readable(match[2] ?? '') }),
  );
  for (const [href, label] of PINNED) {
    yes(
      `"${label}" is the text of a link to ${href}`,
      anchors.some((anchor) => anchor.href === href && anchor.text.includes(label)),
    );
  }

  // And the anchor the hero's second button jumps to actually exists.
  yes('the #how-it-works section is on the page', after.includes('id="how-it-works"'));

  /*
    Every one of them, not just one. The page carries the same button twice -
    in the hero and under the steps - so "an Order Content link points at the
    order form" was still true with the hero's repointed at /signup, which is
    the conversion path this page exists for. Stated as the invariant
    instead: a button saying Order Content goes to the order form, wherever
    it is and however many there are.
  */
  const ordering = anchors.filter((anchor) => anchor.text.includes('Order Content'));
  yes(`the page carries ${ordering.length} "Order Content" buttons`, ordering.length >= 2);
  const astray = ordering.filter((anchor) => anchor.href !== '/dashboard/content/new');
  yes(
    `and every one goes to the order form${astray.length ? `: ${JSON.stringify(astray.map((a) => a.href))}` : ''}`,
    astray.length === 0,
  );
}

/* ------------------------------------------------------- the catalogue */

console.log('\n== the cards are the order form\'s catalogue, not a list typed here ==');
{
  const offered = contentTypes.filter((type) => type.slug !== 'other');
  is('five types are offered', offered.length, 5);

  for (const type of offered) {
    yes(`"${type.label}" has a card`, after.includes(`>${type.label}</h3>`));
    yes('  with its description', afterText.includes(normalise(type.description)));
    yes('  and its typical length', afterText.includes(type.typicalWords));
  }

  /*
    "Other" is the order form's escape hatch rather than a service, and the
    page has always left it out. Asserted as an absence so that a card for it
    appearing is a failure rather than a surprise.
  */
  const other = contentTypes.find((type) => type.slug === 'other')!;
  yes('"Other" is not drawn as a service', !after.includes(`>${other.label}</h3>`));
}

console.log('\n== the lengths are the ones the order form takes ==');
{
  for (const words of LENGTHS) {
    yes(
      `${words.toLocaleString(brand.locale)} is a length the form offers`,
      (wordCountOptions as readonly number[]).includes(words),
    );
  }

  // And the line below the cards names every one of them, not just the five.
  const listed = wordCountOptions.map((words) => words.toLocaleString(brand.locale)).join(', ');
  yes(`all ${wordCountOptions.length} available lengths are listed`, afterText.includes(listed));
}

/* ----------------------------------------------------------- the prices */

console.log('\n== an unconfigured price is on request, never free ==');
{
  const unset = readable(render(UNSET));
  for (const words of LENGTHS) {
    yes(
      `${words} words reads "On request"`,
      priceForWords(UNSET, words) === null,
    );
  }
  const requests = (unset.match(/On request/g) ?? []).length;
  is(`all ${LENGTHS.length} lengths say so`, requests, LENGTHS.length);

  // The giveaway failure: a zero rendered as a price.
  yes('and nothing is priced at zero', !/£0(?:\.00)?\b/.test(unset));

  // The intro swaps to the one that promises no number.
  yes(
    'the intro is the one that quotes nothing',
    unset.includes(normalise(shipped.pricing.introUnset)),
  );
  yes(
    '  and not the one that says prices are fixed',
    !unset.includes(normalise(shipped.pricing.introConfigured)),
  );
}

console.log('\n== a configured price is the one the order form charges ==');
{
  for (const pricing of [TIERED, PER_WORD]) {
    const label = pricing.mode === 'per-word' ? 'per word' : 'tiered';
    const markup = readable(render(pricing));

    for (const words of LENGTHS) {
      const minor = priceForWords(pricing, words);
      if (minor === null) {
        yes(
          `${label}: ${words} words is unpriced, so "On request"`,
          markup.includes('On request'),
        );
        continue;
      }
      const expected = formatPrice(minor, { currency: 'GBP' });
      yes(`${label}: ${words} words renders ${expected}`, markup.includes(expected));
    }

    yes(
      `${label}: the intro is the configured one`,
      markup.includes(normalise(shipped.pricing.introConfigured)),
    );
  }

  /*
    The number is never written in the page. Checked as the inverse: render
    with a currency the component was not built around and the figures must
    follow it, which they cannot do if any of them is a literal.
  */
  const inDollars = readable(render(TIERED, 'USD'));
  const dollarPrice = formatPrice(priceForWords(TIERED, 500)!, { currency: 'USD' });
  yes(`the currency comes from settings too (${dollarPrice})`, inDollars.includes(dollarPrice));
  yes(
    '  so the pound figure is gone',
    !inDollars.includes(formatPrice(priceForWords(TIERED, 500)!, { currency: 'GBP' })),
  );
}

/* ------------------------------------------------------ the drawings */

console.log('\n== the editor in the hero ==');
{
  /*
    What the server renders. The sequence is Motion, which runs in a browser
    - so the assertion worth making here is the one about what arrives
    without it: the article, its heading and the keyword are plain markup, at
    full opacity, before any script.
  */
  yes('the article heading is rendered', afterText.includes('The Complete Guide to Home Workouts'));
  yes('the paragraph is rendered', afterText.includes('are a flexible and effective way to stay fit'));
  yes('the keyword phrase is rendered', afterText.includes('Home workouts'));
  yes('the brief is rendered', afterText.includes('Article Brief'));
  yes('  with the word count it was briefed at', afterText.includes('1,500 words'));
  yes('the checks are rendered', afterText.includes('SEO checks'));
  yes('the review notice is rendered', afterText.includes('Ready for your review'));

  yes('the drawing is hidden from assistive technology', after.includes('aria-hidden="true"'));
  yes(
    'and captioned as an example',
    afterText.includes('The article and the brief are an example, and the checks are checks rather than a score.'),
  );
}

console.log('\n== no page on this site invents a score ==');
{
  /*
    The mockup this was drawn from has an "SEO Score 92/100" badge. A
    checklist is a list of checks; a number out of a hundred is a
    measurement, and a measurement of an invented article measures nothing.
    So there is no score, and these are the shapes one would arrive as.
  */
  yes('no score out of a hundred', !/\b\d{1,3}\s*\/\s*100\b/.test(afterText));
  yes('nothing is called an "SEO score"', !/seo score/i.test(afterText));
  for (const claim of ['guaranteed', 'guarantee to rank', 'will rank', 'first page']) {
    yes(`the page does not say "${claim}"`, !afterText.toLowerCase().includes(claim));
  }
}

console.log('\n== the drawings beside the long read ==');
{
  yes('the link drawing names both halves', afterText.includes('The page it lands on'));
  yes('the coverage drawing lists what a brief asks for', afterText.includes('Briefed to cover'));
  yes(
    '  and is captioned as an example',
    afterText.includes('The article is an example, and nothing here is a ranking or a score.'),
  );
  yes('the keyword is marked for its highlight', after.includes('data-pp-highlight'));
  yes('the step connector declares its length', after.includes('--pp-draw-length'));
  yes('  and is marked for the reveal to arm', after.includes('data-pp-draw'));
}

console.log('\n== nothing is hidden from a crawler ==');
{
  yes('no element arrives already armed', !after.includes('data-armed'));
  yes('nor already inked', !after.includes('data-pp-on'));
  yes('no inline display:none', !/display:\s*none/.test(after));

  /*
    The only inline `opacity: 0` on the page is Motion's, on the editor's
    decorative overlays: the brief card, the checks card and its five ticks,
    and the review notice. Eight elements, none of which carries a word the
    page needs - which is what makes a visit with no JavaScript a finished
    article in a finished editor rather than an empty box.

    Counted rather than forbidden, because the number is the point: a ninth
    means something new is hiding behind a script, and the loop below then
    says whether it was copy.
  */
  const hidden = (after.match(/opacity:\s*0[^.\d]/g) ?? []).length;
  is('exactly the editor overlays start hidden', hidden, 8);

  // And none of the page's own copy is inside one.
  for (const value of [shipped.hero.title, shipped.hero.intro, shipped.cta.heading]) {
    yes(
      `"${value.slice(0, 32)}…" is not inside a hidden element`,
      !new RegExp(`opacity:\\s*0[^.\\d][^<]*${value.slice(0, 20).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(after),
    );
  }
}

console.log('\n== headings, in the right order and of the right rank ==');
{
  const h1s = [...after.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)];
  is('exactly one h1', h1s.length, 1);
  yes('and it is the page title', readable(h1s[0]?.[1] ?? '') === normalise(shipped.hero.title));

  const levels = [...after.matchAll(/<h([1-6])[^>]*>/g)].map((match) => Number(match[1]));
  is('the first heading is the h1', levels[0], 1);
  yes('and nothing below it is deeper than an h3', levels.slice(1).every((level) => level <= 3));
}

console.log('\n== the structured data ==');
{
  const blocks = [
    ...after.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g),
  ].map((match) => JSON.parse(match[1]!.replace(/&quot;/g, '"').replace(/&#x27;/g, "'")));

  is('two documents', blocks.length, 2);

  const breadcrumb = blocks.find((block) => block['@type'] === 'BreadcrumbList');
  yes('the breadcrumb is one of them', Boolean(breadcrumb));
  is('ending at this page', breadcrumb?.itemListElement?.[1]?.name, 'Content writing');

  const faqPage = blocks.find((block) => block['@type'] === 'FAQPage');
  yes('and the FAQ is the other', Boolean(faqPage));
  is('carrying every question', faqPage?.mainEntity?.length, shipped.faqs.items.length);
  yes(
    'each with an answer',
    (faqPage?.mainEntity ?? []).every(
      (entry: { acceptedAnswer?: { text?: string } }) =>
        (entry.acceptedAnswer?.text ?? '').length > 20,
    ),
  );
}

report(check);
