/**
 * A page's shape, and the one rule the read path has to keep.
 *
 * No database and no browser. Two things are checked: that values coming back
 * out of jsonb are clamped to what the code expects, and - the reason this
 * file exists - that rendering a page is a fixed number of queries however
 * many sections the page holds.
 */
import { readFileSync } from 'node:fs';
import {
  cleanSectionValues,
  getComponent,
  listComponents,
  resolveVariant,
} from '../src/lib/cms/components/schema';
import { applyTokens, unknownTokens, TOKENS } from '../src/lib/cms/tokens';
import {
  DELAYS,
  ENTRANCES,
  NO_ANIMATION,
  SPEEDS,
  readAnimation,
  readValues,
  resolveSection,
  type GlobalSection,
  type PageSection,
} from '../src/lib/cms/sections';

let failed = 0;
const ok = (label: string) => console.log(`  PASS  ${label}`);
const bad = (label: string, detail?: string) => {
  failed += 1;
  console.log(`  FAIL  ${label}${detail ? ` - ${detail}` : ''}`);
};
const is = (label: string, actual: unknown, expected: unknown) =>
  actual === expected ? ok(label) : bad(label, `expected ${String(expected)}, got ${String(actual)}`);
const yes = (label: string, actual: boolean) =>
  actual ? ok(label) : bad(label, 'expected it to hold, and it did not');

const REPO = 'src/lib/services/supabase/page-section-repository.ts';
const source = readFileSync(new URL(`../${REPO}`, import.meta.url), 'utf8');

/**
 * One method's body, by brace depth.
 *
 * Counting `.from(` across the whole file would pass whatever the methods
 * did - the earlier version of an invariant test in this project split on
 * `;` and handed one query the next one's filters, and passed with the code
 * it was about deleted. A method is found and its own braces are matched.
 */
function methodBody(name: string): string {
  const start = source.indexOf(`async ${name}(`);
  if (start === -1) throw new Error(`${REPO} has no ${name}()`);

  const open = source.indexOf('{', source.indexOf(')', start));
  let depth = 0;
  for (let at = open; at < source.length; at += 1) {
    if (source[at] === '{') depth += 1;
    if (source[at] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open, at + 1);
    }
  }
  throw new Error(`${name}() in ${REPO} has unbalanced braces`);
}

const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

/**
 * The full text of every `.map(...)` call in a body, callback included.
 *
 * Parenthesis-matched rather than matched with a regular expression. The first
 * version of the check below used one, and it could not see
 * `.map(async (row) => { ... .from(...) })` because the callback's own
 * parentheses ended the match early - so the test passed with a query per
 * section in place, which is the exact thing it exists to forbid.
 */
function mapCalls(body: string): string[] {
  const spans: string[] = [];
  let at = body.indexOf('.map(');

  while (at !== -1) {
    const open = body.indexOf('(', at);
    let depth = 0;
    for (let cursor = open; cursor < body.length; cursor += 1) {
      if (body[cursor] === '(') depth += 1;
      if (body[cursor] === ')') {
        depth -= 1;
        if (depth === 0) {
          spans.push(body.slice(open, cursor + 1));
          break;
        }
      }
    }
    at = body.indexOf('.map(', at + 5);
  }

  return spans;
}

console.log('\n--- rendering a page is a fixed number of queries ---');
{
  /*
    The failure this prevents is a page builder that reads each section
    separately: correct, invisible in development with three sections, and
    slower every single time an editor adds one. It is the reason people
    describe page builders as slow, and it is a shape rather than a bug - so
    it is pinned here rather than remembered.

    Two is the ceiling: the sections, then the globals they point at. Never
    a third, and never one inside a loop.
  */
  for (const method of ['forPage', 'allForPage']) {
    const body = methodBody(method);
    is(`${method}() makes at most two queries`, count(body, '.from('), 2);

    // A read inside a map over the sections is the specific thing being ruled
    // out, and it would still count as two `.from(` above - the regressed
    // version reads sections, then one global per row, which is two distinct
    // `.from(` and an unbounded number of queries.
    yes(
      `${method}() has no query inside a loop over the rows`,
      mapCalls(body).every((call) => !call.includes('.from(')),
    );
  }

  // Globals are fetched for every id at once. One query per referenced global
  // is the same failure wearing a different hat.
  yes('globals are read keyed, in one request', source.includes(".in('id', ids)"));
  yes('and never one at a time', !/for\s*\(.*\)\s*{[^}]*from\('global_sections'/s.test(source));

  /*
    A nested embed would also be one query. It is ruled out because it is the
    shape that failed silently on the Majestic suggestions: PostgREST returns
    an error for a join it cannot plan, and the loop reading it treated that
    as the end of the rows. Two flat reads cannot do that.
  */
  yes('no nested embed in the select list', !/select\([^)]*\([^)]*\(/s.test(source));
}

console.log('\n--- what comes back out of jsonb ---');
{
  // These columns hold whatever was last written to them, which is not
  // necessarily what this application writes.
  is('an unknown entrance is stillness', readAnimation({ entrance: 'explode' }).entrance, 'none');
  is('an unknown speed is normal', readAnimation({ speed: 'instant' }).speed, 'normal');
  is('an unknown delay is none', readAnimation({ delay: 'an hour' }).delay, 'none');
  is('a missing animation is stillness', readAnimation(undefined).entrance, NO_ANIMATION.entrance);
  is('a string is not an animation', readAnimation('fade-up').entrance, 'none');
  is('nor is an array', readAnimation(['fade-up']).speed, 'normal');

  for (const entrance of ENTRANCES) {
    is(`"${entrance}" survives`, readAnimation({ entrance }).entrance, entrance);
  }
  yes('every speed survives', SPEEDS.every((speed) => readAnimation({ speed }).speed === speed));
  yes('every delay survives', DELAYS.every((delay) => readAnimation({ delay }).delay === delay));

  is('values are an object or nothing', Object.keys(readValues('nope')).length, 0);
  is('an array is not values', Object.keys(readValues([1, 2])).length, 0);
  is('a real object comes through', readValues({ heading: 'Hello' }).heading, 'Hello');
}

console.log('\n--- a section that points at a global ---');
{
  const global: GlobalSection = {
    id: 'g1',
    name: 'Main signup CTA',
    component: 'cta',
    variant: 'dark',
    animation: { entrance: 'scale-in', speed: 'slow', delay: 'medium' },
    values: { heading: 'Join Press Parrot' },
    updatedAt: '2026-01-01T00:00:00Z',
  };

  const section: PageSection = {
    id: 's1',
    pageSlug: 'home',
    component: 'rich-text',
    variant: 'default',
    position: 3,
    hidden: false,
    locked: false,
    animation: { entrance: 'fade-up', speed: 'normal', delay: 'none' },
    values: { heading: 'Stale local copy' },
    globalId: 'g1',
    global,
    updatedAt: '2026-01-01T00:00:00Z',
  };

  const resolved = resolveSection(section);
  is('the global decides the component', resolved.component, 'cta');
  is('and the variant', resolved.variant, 'dark');
  is('and the content', resolved.values.heading, 'Join Press Parrot');

  /*
    But not the animation. The same call to action at the end of a long
    article and at the top of a short page wants a different entrance, and
    that is a property of where it sits rather than of what it says - so it
    stays with the page.
  */
  is('the page keeps its own entrance', resolved.animation.entrance, 'fade-up');
  is('at its own speed', resolved.animation.speed, 'normal');

  // Detached, the row is its own again.
  const detached = resolveSection({ ...section, globalId: undefined, global: undefined });
  is('a detached section renders its own component', detached.component, 'rich-text');
  is('and its own content', detached.values.heading, 'Stale local copy');
}

const SCHEMA = 'src/lib/cms/components/schema.ts';
const RENDER = 'src/lib/cms/components/render.tsx';
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

console.log('\n--- the two halves of the registry never meet ---');
{
  /*
    This is the whole performance story, and it is a property of the module
    graph rather than of anybody's care.

    The admin imports schema.ts for field definitions, labels and validation.
    The public renderer imports render.tsx for frontend components. If either
    reaches the other, a public page ships TipTap, the drag-and-drop and every
    field input - which is exactly the Elementor-style bloat the brief spends
    a section forbidding.
  */
  const schema = read(SCHEMA);
  const render = read(RENDER);

  yes('the schema imports no frontend component', !/from '@\/components\//.test(schema));
  // On imports, not on the word: schema.ts names render.tsx in its comments,
  // which is the point of the comment.
  yes('the schema imports no renderer', !/^import .*render/m.test(schema));
  /*
    Matched on the import statement rather than on a full path. The first
    version of this looked for 'components/schema', and missed the import
    anybody would actually write - './schema' - so it passed with the two
    halves joined together. Proved by joining them: it fails now, both ways
    round.
  */
  const importsSchema = (file: string) => /^import[^;]*from\s+['"][^'"]*schema['"]/m.test(file);
  yes('the renderer does not import the schema', !importsSchema(render));
  yes('and imports no field definitions', !/^import[^;]*from\s+['"][^'"]*fields['"]/m.test(render));

  // The public entry point is the one that actually ships to a browser.
  const entry = read('src/components/cms/page-sections.tsx');
  yes('the public renderer does not import the schema', !importsSchema(entry));
  yes('nor the admin editor', !/from '@\/components\/admin/.test(entry));

  /*
    Renderers are called rather than mounted, which is only safe while they
    are server components - a client component called as a function loses its
    boundary and its hooks throw. The day one needs 'use client', page-sections
    has to go back to JSX, and this says so.
  */
  const sectionFiles = read('src/components/cms/sections/index.tsx');
  yes('no section renderer is a client component', !sectionFiles.includes("'use client'"));
}

console.log('\n--- every component can be drawn ---');
{
  // A component an editor can add and the page cannot draw is a section that
  // silently renders nothing. The two halves are separate files on purpose,
  // which is exactly why they can drift.
  const render = read(RENDER);
  for (const component of listComponents()) {
    yes(`"${component.key}" has a renderer`, render.includes(`'${component.key}':`) || render.includes(`  ${component.key}:`));
  }

  yes('every component has at least one variant', listComponents().every((c) => c.variants.length > 0));
  yes('and a description for the library', listComponents().every((c) => c.description.length > 10));
  is('an unknown component is null, not a throw', getComponent('nope'), null);
}

console.log('\n--- a variant is only ever one the component named ---');
{
  const richText = getComponent('rich-text');
  is('a known variant is kept', resolveVariant(richText, 'narrow'), 'narrow');
  is('an unknown one falls back to the first', resolveVariant(richText, 'neon'), 'default');
  is('and a missing component is default', resolveVariant(null, 'narrow'), 'default');
}

console.log('\n--- values are rebuilt from the schema, not filtered ---');
{
  const cta = getComponent('cta');
  if (!cta) throw new Error('the cta component is missing');

  const cleaned = cleanSectionValues(cta, {
    heading: '  Ready   to start?  ',
    body: 'Some copy.',
    primaryCta: { label: 'Join', href: '/signup' },
    // Not a field this component declares. Filtering would have to know to
    // remove it; rebuilding cannot keep it.
    customCss: '.hero { display: none }',
    style: { color: 'red' },
  });

  yes('a key the component does not declare cannot survive', !('customCss' in cleaned));
  yes('nor can a second one', !('style' in cleaned));
  is('whitespace in a heading is collapsed', cleaned.heading, 'Ready to start?');

  // The link rules are the same ones the rich text whitelist applies inside a
  // document, for links that happen to be fields instead.
  const nasty = cleanSectionValues(cta, {
    heading: 'Hello',
    primaryCta: { label: 'Click', href: 'javascript:alert(1)' },
    secondaryCta: { label: 'Also', href: 'https://example.com' },
    // An internal path is what a CTA is for.
    tertiary: { label: 'Ignored', href: '/marketplace' },
  });
  is('a javascript: link is dropped', (nasty.primaryCta as { href: string }).href, '');

  /*
    And so is an external one, on a CTA field.

    `link()` defaults to internalOnly, which is deliberate and older than any
    of this: a button that points off-site is almost always a mistake, and a
    marketing page's buttons exist to move somebody further into the site.
    External links belong in rich text, where the editor offers them with
    new-tab, nofollow and sponsored - a button has no room to express any of
    that anyway.
  */
  is('an external link on a CTA is dropped too', (nasty.secondaryCta as { href: string }).href, '');
  is('and an internal path is kept', (cleanSectionValues(cta, { primaryCta: { label: 'Go', href: '/marketplace' } }).primaryCta as { href: string }).href, '/marketplace');

  // A field the section was saved without comes back as the default, so a
  // component that gains a field does not leave a hole in older pages.
  const sparse = cleanSectionValues(cta, { heading: 'Only this' });
  is('a missing field falls back to the default', (sparse.primaryCta as { label: string }).label, 'Create Free Account');

  const cards = getComponent('feature-cards');
  if (!cards) throw new Error('the feature-cards component is missing');
  const listed = cleanSectionValues(cards, {
    items: [
      { title: 'Real traffic', body: 'Checked by hand.' },
      { title: '', body: '' },
      'not an object',
      { title: 'Kept', body: 'Also kept.', injected: 'no' },
    ],
  });
  const items = listed.items as Record<string, unknown>[];
  is('empty and non-object rows are dropped', items.length, 2);
  yes('and an undeclared key inside a row is too', items.every((item) => !('injected' in item)));
}

console.log('\n--- live numbers inside copy ---');
{
  const values = { marketplace_site_count: '950', niche_count: '40' };
  is('a token resolves', applyTokens('We list {{marketplace_site_count}} websites', values), 'We list 950 websites');
  is('spacing inside the braces is fine', applyTokens('{{ niche_count }} niches', values), '40 niches');
  is('case does not matter', applyTokens('{{NICHE_COUNT}} niches', values), '40 niches');

  // A token nobody fills in is removed rather than shown to a visitor, and
  // the double space it leaves behind goes with it.
  is('an unfilled token leaves no braces', applyTokens('We list {{gambling_site_count}} sites', values), 'We list sites');
  is('copy with no tokens is untouched', applyTokens('Plain copy.', values), 'Plain copy.');

  // Which is why the editor has to warn: a typo is silent on the page.
  is('a typo is reported', unknownTokens('{{marketplace_site_cont}}').length, 1);
  is('a real token is not', unknownTokens('{{marketplace_site_count}}').length, 0);
  yes('every token is explained to whoever types it', TOKENS.every((token) => token.help.length > 10));
}

console.log(failed ? `\n  ${failed} FAILED\n` : '\n  all passed\n');
process.exit(failed ? 1 : 0);
