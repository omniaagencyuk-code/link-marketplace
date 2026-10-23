/**
 * The harness both service-page redraws are checked with.
 *
 * /link-building and /niche-edits were each redrawn off the shared
 * `ServicePage` into their own composition: new layout, new animation, and
 * the same copy, headings, internal links, FAQ and structured data they
 * ranked with. The danger in that kind of change is not that it looks wrong
 * - somebody would notice - but that a paragraph quietly stops being
 * rendered and nothing says so for a month, by which time the ranking has
 * moved and nobody connects the two.
 *
 * So both pages are rendered from the same shipped content and compared:
 * `ServicePage` - still the template for the other four service pages, and
 * still in the repository - against the new composition. Anything the old
 * page said that the new one does not is a failure.
 *
 * This file is the comparison, with one copy of it. The first redraw's suite
 * held all of it inline; the second would have been a copy, and the copy
 * that drifts is the one nobody is reading. What each page's own suite keeps
 * is what is particular to that page: its illustrations, and the claims they
 * must not make.
 *
 * The expectations are read out of the page's `defaults` rather than written
 * down in a suite, so an editor's copy change or a new body section is
 * covered the day it lands without anybody remembering to add a case.
 *
 * No key, no database, no network, no browser: `renderToStaticMarkup` over
 * the real components with the real content.
 */
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { LucideIcon } from 'lucide-react';
import { contentAccessors, resolvePage } from '../src/lib/cms/resolve';
import type { PageDef, PageValues } from '../src/lib/cms/types';
import type { PreviewRow } from '../src/lib/services/marketplace-preview';

/* ------------------------------------------------------------ assertions */

/**
 * A counter and four ways to add to it.
 *
 * Every assertion is phrased so that passing prints what it claims, the way
 * `verify:rls` insists on - a checker cannot tell a wrong answer from a
 * right one worded backwards.
 */
export function checker() {
  let failed = 0;

  const ok = (label: string) => console.log(`  PASS  ${label}`);
  const bad = (label: string, detail?: string) => {
    failed += 1;
    console.log(`  FAIL  ${label}${detail ? ` - ${detail}` : ''}`);
  };

  return {
    ok,
    bad,
    yes: (label: string, condition: boolean, detail?: string) =>
      condition ? ok(label) : bad(label, detail),
    is: <T,>(label: string, actual: T, expected: T) =>
      actual === expected
        ? ok(label)
        : bad(label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`),
    get failed() {
      return failed;
    },
  };
}

export type Checker = ReturnType<typeof checker>;

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
export function readable(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;|&#x?[0-9a-f]+;/gi, (entity) => ENTITIES[entity.toLowerCase()] ?? entity)
    .replace(/\s+/g, ' ')
    .trim();
}

export const normalise = (value: string) => value.replace(/\s+/g, ' ').trim();

/** Markdown as the page stores it, reduced to the words it renders. */
export function phrases(markdown: string): string[] {
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
export function markdownLinks(markdown: string): { label: string; href: string }[] {
  return [...markdown.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)].map((match) => ({
    label: match[1]!,
    href: match[2]!,
  }));
}

export const hrefs = (html: string) =>
  new Set([...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1]!));

/* ---------------------------------------------------------------- fixture */

/**
 * Two preview rows, shaped the way `toPreviewRows` shapes them. The
 * marketplace illustration is built from these, so a page rendered with none
 * would not exercise it.
 */
export const PREVIEW_ROWS: PreviewRow[] = [
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

/* ------------------------------------------------------------ the compare */

interface Shipped {
  hero: { eyebrow: string; title: string; intro: string; microcopy: string };
  highlights: { items: { title: string; body: string }[] };
  preview: { heading: string; body: string };
  body: { sections: { heading: string; content: string }[] };
  faqs: { items: { question: string; answer: string }[] };
  related: { items: { label: string; href: string; description: string }[] };
  cta: { heading: string; body: string };
}

export interface Redraw {
  /** The page's CMS module: what ships, and what an editor may change. */
  page: { definition: PageDef; defaults: PageValues };
  /** The composition the route renders now. */
  redrawn: ComponentType<never>;
  /** The template it replaced, which still renders the other service pages. */
  template: ComponentType<never>;
  highlightIcons: LucideIcon[];
  path: string;
  breadcrumbLabel: string;
  /**
   * How many of each the page ships.
   *
   * Written down rather than read from the same place the loop reads, so a
   * section deleted from `defaults` fails here instead of quietly reducing
   * the number of assertions and still printing all passes.
   */
  counts: { highlights: number; bodySections: number; faqs: number; related: number };
  /**
   * Page copy that comes from the component rather than from the CMS - the
   * marketplace filters, the button into it, the line explaining the dots.
   * None of it is in `defaults`, so the loops cannot see it, and all of it is
   * copy somebody could lose on a redraw.
   */
  furniture: string[];
}

export interface Rendered {
  check: Checker;
  /** The new page's markup, and the words in it. */
  after: string;
  afterText: string;
  /** The old template's, for comparing against. */
  before: string;
  beforeText: string;
}

/**
 * Render both pages, run every claim that holds for any redraw, and hand
 * back the markup so a page's own suite can add what is particular to it.
 */
export function compareRedraw(redraw: Redraw): Rendered {
  const check = checker();
  const { yes, is, bad, ok } = check;

  const resolved = resolvePage(redraw.page.definition, redraw.page.defaults, undefined);
  const content = contentAccessors(resolved);

  const props = {
    content,
    highlightIcons: redraw.highlightIcons,
    preview: PREVIEW_ROWS,
    path: redraw.path,
    breadcrumbLabel: redraw.breadcrumbLabel,
  } as never;

  const after = renderToStaticMarkup(createElement(redraw.redrawn, props));
  const before = renderToStaticMarkup(createElement(redraw.template, props));
  const afterText = readable(after);
  const beforeText = readable(before);

  const shipped = redraw.page.defaults as unknown as Shipped;

  console.log('\n== every string the page ships is still rendered ==');
  for (const [section, field, value] of [
    ['hero', 'eyebrow', shipped.hero.eyebrow],
    ['hero', 'title', shipped.hero.title],
    ['hero', 'intro', shipped.hero.intro],
    ['hero', 'microcopy', shipped.hero.microcopy],
    ['preview', 'heading', shipped.preview.heading],
    ['preview', 'body', shipped.preview.body],
    ['cta', 'heading', shipped.cta.heading],
    ['cta', 'body', shipped.cta.body],
  ] as [string, string, string][]) {
    yes(`${section}.${field} is on the page`, afterText.includes(normalise(value)));
  }

  console.log('\n== the value points ==');
  {
    const highlights = shipped.highlights.items;
    is(`all ${redraw.counts.highlights} ship`, highlights.length, redraw.counts.highlights);
    for (const highlight of highlights) {
      yes(`"${highlight.title}" is on the page`, afterText.includes(normalise(highlight.title)));
      yes('  with its explanation', afterText.includes(normalise(highlight.body)));
    }
  }

  console.log('\n== the long read: every heading, paragraph and bullet ==');
  {
    const sections = shipped.body.sections;
    is(
      `${redraw.counts.bodySections} sections ship`,
      sections.length,
      redraw.counts.bodySections,
    );

    for (const section of sections) {
      yes(
        `"${section.heading}" is a heading on the page`,
        after.includes(`>${section.heading}</h2>`),
      );

      /*
        Every line of the markdown, which is every paragraph and every
        bullet. Checked as text rather than as HTML because the renderer
        decides the markup - what this is about is whether the words are
        there at all.
      */
      const lines = phrases(section.content);
      const missing = lines.filter((phrase) => !afterText.includes(phrase));
      for (const phrase of missing) {
        bad(`  a line of "${section.heading}" is missing`, phrase.slice(0, 80));
      }
      if (missing.length === 0) ok(`  and all ${lines.length} of its lines survive`);

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
    const faqs = shipped.faqs.items;
    is(`${redraw.counts.faqs} questions ship`, faqs.length, redraw.counts.faqs);

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
    const related = shipped.related.items;
    is(`${redraw.counts.related} related links ship`, related.length, redraw.counts.related);

    for (const item of related) {
      yes(`${item.label} → ${item.href}`, after.includes(`href="${item.href}"`));
      yes('  with its label', afterText.includes(normalise(item.label)));
      yes('  and its description', afterText.includes(normalise(item.description)));
    }

    /*
      Done as arithmetic rather than by eye: every destination the old page
      linked to is a destination the new one links to. Catches a link dropped
      in the rearranging, which is the failure that costs the most and shows
      the least.
    */
    const lost = [...hrefs(before)].filter((href) => !hrefs(after).has(href));
    yes(
      `no destination the old page linked to is missing${lost.length ? `: ${JSON.stringify(lost)}` : ''}`,
      lost.length === 0,
    );
  }

  console.log('\n== the furniture the template drew, which is not CMS copy ==');
  for (const phrase of redraw.furniture) {
    yes(`"${phrase}" survived the redraw`, afterText.includes(phrase));
    // And it was on the old page, so this is a comparison rather than a wish.
    if (!beforeText.includes(phrase)) {
      bad(
        `  but "${phrase}" was not on the old page`,
        'this assertion is checking the wrong string',
      );
    }
  }

  console.log('\n== headings, in the right order and of the right rank ==');
  {
    const h1s = [...after.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)];
    is('exactly one h1', h1s.length, 1);
    yes(
      'and it is the page title',
      readable(h1s[0]?.[1] ?? '') === normalise(shipped.hero.title),
    );

    // Nothing jumps a level: the page is h1 then h2s.
    const levels = [...after.matchAll(/<h([1-6])[^>]*>/g)].map((match) => Number(match[1]));
    is('the first heading is the h1', levels[0], 1);
    yes('and nothing below it is deeper than an h3', levels.slice(1).every((level) => level <= 3));
  }

  console.log('\n== the structured data ==');
  {
    const blocks = [
      ...after.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g),
    ].map((match) => JSON.parse(match[1]!.replace(/&quot;/g, '"').replace(/&#x27;/g, "'")));

    is('two documents, as before', blocks.length, 2);

    const breadcrumb = blocks.find((block) => block['@type'] === 'BreadcrumbList');
    yes('the breadcrumb is one of them', Boolean(breadcrumb));
    is('with two items', breadcrumb?.itemListElement?.length, 2);
    is('ending at this page', breadcrumb?.itemListElement?.[1]?.name, redraw.breadcrumbLabel);

    const faqPage = blocks.find((block) => block['@type'] === 'FAQPage');
    yes('and the FAQ is the other', Boolean(faqPage));
    is('carrying every question', faqPage?.mainEntity?.length, redraw.counts.faqs);
    yes(
      'each with an answer',
      (faqPage?.mainEntity ?? []).every(
        (entry: { acceptedAnswer?: { text?: string } }) =>
          (entry.acceptedAnswer?.text ?? '').length > 20,
      ),
    );

    // Same documents as the template emitted, not a different shape.
    const beforeTypes = [...before.matchAll(/"@type":"(BreadcrumbList|FAQPage)"/g)].map(
      (match) => match[1],
    );
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
    yes('nor already inked', !after.includes('data-pp-on'));
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
    for (const row of PREVIEW_ROWS) {
      yes(`${row.maskedDomain} is drawn from the real preview row`, after.includes(row.maskedDomain));
    }
    yes('with its banded price', after.includes(PREVIEW_ROWS[0]!.priceBand));
    yes('and its rounded rating', after.includes(`DR ${PREVIEW_ROWS[0]!.domainRating}`));

    // It is decoration, so it is hidden from a screen reader and carries a
    // caption instead.
    yes('the illustration is hidden from assistive technology', after.includes('aria-hidden="true"'));
    yes('and captioned for it', after.includes('An illustration of the Press Parrot marketplace'));
  }

  return { check, after, afterText, before, beforeText };
}

/** Print the tally and leave with the exit code CI reads. */
export function report(check: Checker): never {
  console.log(check.failed ? `\n  ${check.failed} FAILED\n` : '\n  all passed\n');
  process.exit(check.failed ? 1 : 0);
}
