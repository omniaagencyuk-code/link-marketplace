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

console.log(failed ? `\n  ${failed} FAILED\n` : '\n  all passed\n');
process.exit(failed ? 1 : 0);
