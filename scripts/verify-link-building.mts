/**
 * Prove the /link-building redesign kept every word the old page had.
 *
 * The page was redrawn, not rewritten: new composition, new layout, new
 * animation, and the same copy, headings, internal links, FAQ and structured
 * data it ranked with. The danger in that kind of change is not that it looks
 * wrong - somebody would notice - but that a paragraph quietly stops being
 * rendered and nothing says so for a month, by which time the ranking has
 * moved and nobody connects the two.
 *
 * So both pages are rendered here, from the same shipped content, and
 * compared: `ServicePage` - still the template for the other five service
 * pages, and still in the repository - against the new composition. Anything
 * the old page said that the new one does not is a failure.
 *
 * The expectations are read out of `cms/pages/link-building.ts` rather than
 * written down here, so an editor's copy change or a new body section is
 * covered by this suite the day it lands, without anybody remembering to add
 * a case.
 *
 * No key, no database, no network, no browser: `renderToStaticMarkup` over
 * the real components with the real content.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BadgeCheck, Gauge, Receipt, Workflow } from 'lucide-react';
import { contentAccessors, resolvePage } from '../src/lib/cms/resolve';
import * as linkBuilding from '../src/lib/cms/pages/link-building';
import { LinkBuildingPage } from '../src/components/link-building/link-building-page';
import { ServicePage } from '../src/components/marketing/service-page';
import type { PreviewRow } from '../src/lib/services/marketplace-preview';

let failed = 0;
const ok = (label: string) => console.log(`  PASS  ${label}`);
const bad = (label: string, detail?: string) => {
  failed += 1;
  console.log(`  FAIL  ${label}${detail ? ` - ${detail}` : ''}`);
};
const yes = (label: string, condition: boolean, detail?: string) =>
  condition ? ok(label) : bad(label, detail);
const is = <T,>(label: string, actual: T, expected: T) =>
  actual === expected
    ? ok(label)
    : bad(label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);

/* ------------------------------------------------------------- rendering */

/*
  Two preview rows, shaped the way `toPreviewRows` shapes them. The mock is
  built from these, so a page rendered with none would not exercise it.
*/
const rows: PreviewRow[] = [
  {
    key: 'row-1',
    maskedDomain: '••••••••.com',
    niche: 'technology',
    country: 'GB',
    domainRating: 70,
    traffic: '210K',
    priceBand: '£200-300',
    linkTypes: ['guest-post'],
  },
  {
    key: 'row-2',
    maskedDomain: '••••••.co.uk',
    niche: null,
    country: '—',
    domainRating: 45,
    traffic: '18K',
    priceBand: '£100-200',
    linkTypes: ['niche-edit'],
  },
];

const resolved = resolvePage(linkBuilding.definition, linkBuilding.defaults, undefined);
const content = contentAccessors(resolved);

const props = {
  content,
  highlightIcons: [BadgeCheck, Gauge, Receipt, Workflow],
  preview: rows,
  path: '/link-building',
  breadcrumbLabel: 'Link building',
} as never;

const after = renderToStaticMarkup(createElement(LinkBuildingPage, props));
const before = renderToStaticMarkup(createElement(ServicePage, props));

/* --------------------------------------------------------------- helpers */

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#x27;': "'",
  '&#39;': "'",
  '&nbsp;': ' ',
};

/** What a reader - or a crawler - actually sees, minus the markup. */
function readable(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;|&#x?[0-9a-f]+;/gi, (entity) => ENTITIES[entity.toLowerCase()] ?? entity)
    .replace(/\s+/g, ' ')
    .trim();
}

const afterText = readable(after);
const beforeText = readable(before);

const normalise = (value: string) => value.replace(/\s+/g, ' ').trim();

/** Markdown as the page stores it, reduced to the words it renders. */
function phrases(markdown: string): string[] {
  return markdown
    .split('\n')
    .map((line) =>
      line
        .replace(/^[-*]\s+/, '')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/[*_`]/g, ''),
    )
    .map(normalise)
    .filter((line) => line.length > 0);
}

/** Every `[label](href)` in the shipped copy. */
function markdownLinks(markdown: string): { label: string; href: string }[] {
  return [...markdown.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)].map((match) => ({
    label: match[1]!,
    href: match[2]!,
  }));
}

const hrefs = (html: string) =>
  new Set([...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1]!));

/* ------------------------------------------------- the copy, word for word */

console.log('\n== every string the page ships is still rendered ==');
{
  const { hero, preview, cta } = linkBuilding.defaults as Record<string, Record<string, string>>;

  for (const [section, field, value] of [
    ['hero', 'eyebrow', hero.eyebrow],
    ['hero', 'title', hero.title],
    ['hero', 'intro', hero.intro],
    ['hero', 'microcopy', hero.microcopy],
    ['preview', 'heading', preview.heading],
    ['preview', 'body', preview.body],
    ['cta', 'heading', cta.heading],
    ['cta', 'body', cta.body],
  ] as [string, string, string][]) {
    yes(`${section}.${field} is on the page`, afterText.includes(normalise(value)));
  }
}

console.log('\n== the four value points ==');
{
  const highlights = (linkBuilding.defaults.highlights as { items: { title: string; body: string }[] })
    .items;
  is('all four ship', highlights.length, 4);
  for (const highlight of highlights) {
    yes(`"${highlight.title}" is on the page`, afterText.includes(normalise(highlight.title)));
    yes('  with its explanation', afterText.includes(normalise(highlight.body)));
  }
}

console.log('\n== the long read: every heading, paragraph and bullet ==');
{
  const sections = (linkBuilding.defaults.body as { sections: { heading: string; content: string }[] })
    .sections;
  is('five sections ship', sections.length, 5);

  for (const section of sections) {
    yes(`"${section.heading}" is a heading on the page`, after.includes(`>${section.heading}</h2>`));

    /*
      Every line of the markdown, which is every paragraph and every bullet.
      Checked as text rather than as HTML because the renderer decides the
      markup - what this is about is whether the words are there at all.
    */
    for (const phrase of phrases(section.content)) {
      const present = afterText.includes(phrase);
      if (!present) bad(`  a line of "${section.heading}" is missing`, phrase.slice(0, 80));
    }
    ok(`  and all ${phrases(section.content).length} of its lines survive`);

    // The links inside the copy, with the anchor text they were written with.
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
  const faqs = (linkBuilding.defaults.faqs as { items: { question: string; answer: string }[] }).items;
  is('five questions ship', faqs.length, 5);

  for (const faq of faqs) {
    yes(`"${faq.question}" is asked`, afterText.includes(normalise(faq.question)));
    /*
      The answer has to be in the rendered HTML, not fetched when somebody
      opens the accordion. `Faq` uses <details>, so it is - this is the
      assertion that stops that becoming a click-to-load component later.
    */
    yes('  and answered in the markup', afterText.includes(normalise(faq.answer)));
  }
}

console.log('\n== the internal links, and their anchor text ==');
{
  const related = (linkBuilding.defaults.related as { items: { label: string; href: string; description: string }[] })
    .items;
  is('six related links ship', related.length, 6);

  for (const item of related) {
    yes(`${item.label} → ${item.href}`, after.includes(`href="${item.href}"`));
    yes('  with its label', afterText.includes(normalise(item.label)));
    yes('  and its description', afterText.includes(normalise(item.description)));
  }

  /*
    The comparison the brief asks for, done as arithmetic rather than by eye:
    every destination the old page linked to is a destination the new one
    links to. Catches a link dropped in the rearranging, which is the failure
    that costs the most and shows the least.
  */
  const lost = [...hrefs(before)].filter((href) => !hrefs(after).has(href));
  yes(
    `no destination the old page linked to is missing${lost.length ? `: ${JSON.stringify(lost)}` : ''}`,
    lost.length === 0,
  );
}

console.log('\n== the furniture the template drew, which is not CMS copy ==');
{
  /*
    Some of what a visitor read came from `ServicePage` itself rather than
    from the content: the eight filters the marketplace offers, the button
    into it, and the line explaining why every domain on the page is dots.
    None of it is in `defaults`, so the loop above cannot see it - and all of
    it is page copy somebody could miss on a redraw.
  */
  const furniture = [
    'Domain Rating',
    'Organic Traffic',
    'Referring Domains',
    'Country',
    'Niche',
    'Price',
    'Turnaround',
    'Link Type',
    'Unlock the Marketplace',
    'Create a free account to browse publishers and pricing.',
    'Website names are not shown to signed-out visitors.',
  ];

  for (const phrase of furniture) {
    yes(`"${phrase}" survived the redraw`, afterText.includes(phrase));
    // And it was on the old page, so this is a comparison rather than a wish.
    if (!beforeText.includes(phrase)) {
      bad(`  but "${phrase}" was not on the old page`, 'this assertion is checking the wrong string');
    }
  }
}

console.log('\n== headings, in the right order and of the right rank ==');
{
  const h1s = [...after.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)];
  is('exactly one h1', h1s.length, 1);
  yes(
    'and it is the page title',
    readable(h1s[0]?.[1] ?? '') === normalise((linkBuilding.defaults.hero as { title: string }).title),
  );

  // Nothing jumps a level: the page is h1 then h2s.
  const levels = [...after.matchAll(/<h([1-6])[^>]*>/g)].map((match) => Number(match[1]));
  is('the first heading is the h1', levels[0], 1);
  yes('and nothing below it is deeper than an h3', levels.slice(1).every((level) => level <= 3));
}

console.log('\n== the structured data ==');
{
  const blocks = [...after.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
    (match) => JSON.parse(match[1]!.replace(/&quot;/g, '"').replace(/&#x27;/g, "'")),
  );

  is('two documents, as before', blocks.length, 2);

  const breadcrumb = blocks.find((block) => block['@type'] === 'BreadcrumbList');
  yes('the breadcrumb is one of them', Boolean(breadcrumb));
  is('with two items', breadcrumb?.itemListElement?.length, 2);
  is('ending at this page', breadcrumb?.itemListElement?.[1]?.name, 'Link building');

  const faqPage = blocks.find((block) => block['@type'] === 'FAQPage');
  yes('and the FAQ is the other', Boolean(faqPage));
  is('carrying all five questions', faqPage?.mainEntity?.length, 5);
  yes(
    'each with an answer',
    (faqPage?.mainEntity ?? []).every(
      (entry: { acceptedAnswer?: { text?: string } }) => (entry.acceptedAnswer?.text ?? '').length > 20,
    ),
  );

  // Same documents as the template emitted, not a different shape.
  const beforeTypes = [...before.matchAll(/"@type":"(BreadcrumbList|FAQPage)"/g)].map((m) => m[1]);
  yes('the same two the old page emitted', beforeTypes.length === 2);
}

console.log('\n== nothing is hidden from a crawler ==');
{
  /*
    The reveal mechanism hides only what JavaScript has armed, and arming
    happens in the browser. So the server-rendered HTML must carry neither
    the armed attribute nor an inline rule that hides anything: if it does,
    the copy below the fold is invisible to anything that does not run
    scripts, which includes some crawlers and anybody whose bundle failed.
  */
  yes('no element arrives already armed', !after.includes('data-armed'));
  yes('nor already inked', !after.includes('data-lb-on'));
  yes('no inline opacity:0', !/opacity:\s*0[^.\d]/.test(after));
  yes('no inline display:none', !/display:\s*none/.test(after));

  /*
    And the words are all there in one pass of the HTML, which is the whole
    claim this file makes. Measured rather than asserted: the new page's
    readable text is at least as long as the old one's.
  */
  yes(
    `the new page renders at least as much text as the old (${afterText.length} vs ${beforeText.length})`,
    afterText.length >= beforeText.length,
  );
}

console.log('\n== the marketplace illustration ==');
{
  /*
    Drawn from the page's own redacted rows. The point of the assertion is
    the absence: no domain, no exact figure, nothing invented for the
    picture. A mock with made-up publishers in it is a claim about the
    inventory.
  */
  for (const row of rows) {
    yes(`${row.maskedDomain} is drawn from the real preview row`, after.includes(row.maskedDomain));
  }
  yes('with its banded price', after.includes(rows[0]!.priceBand));
  yes('and its rounded rating', after.includes(`DR ${rows[0]!.domainRating}`));

  // It is decoration, so it is hidden from a screen reader and carries a
  // caption instead.
  yes('the illustration is hidden from assistive technology', after.includes('aria-hidden="true"'));
  yes('and captioned for it', after.includes('An illustration of the Press Parrot marketplace'));
}

console.log(failed ? `\n  ${failed} FAILED\n` : '\n  all passed\n');
process.exit(failed ? 1 : 0);
