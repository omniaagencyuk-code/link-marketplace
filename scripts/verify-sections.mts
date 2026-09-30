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
import { isAnimatable, renderableComponents } from '../src/lib/cms/components/render';
import { neededBy, needsOf } from '../src/lib/cms/components/needs';
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

console.log('\n--- what may animate, and what may not ---');
{
  /*
    The list lives twice: `animatable` in the schema, which the admin reads to
    decide whether to offer the setting, and ANIMATABLE in the renderer, which
    decides whether to wrap. It has to live twice because the two halves of
    the registry must not import each other - so the thing to check is that
    they agree.

    Disagreeing one way offers a setting that does nothing. Disagreeing the
    other animates a section whose editor never mentioned it.
  */
  for (const component of listComponents()) {
    is(
      `"${component.key}" animates in both halves or neither`,
      isAnimatable(component.key),
      component.animatable,
    );
  }

  // Long-form copy is what the reader came for. Animating paragraphs as
  // somebody scrolls into them is the thing that makes a site feel generic.
  is('rich text does not animate', isAnimatable('rich-text'), false);
  is('a component with no renderer does not animate', isAnimatable('nope'), false);
  yes('every renderable key is a real component', renderableComponents().every((key) => getComponent(key) !== null));
}

console.log('\n--- nothing is hidden unless JavaScript hid it ---');
{
  const reveal = read('src/components/cms/reveal.tsx');
  const css = read('src/app/globals.css');

  /*
    The failure being prevented: a marketing page whose copy is invisible
    because a bundle failed, or because the reader is a crawler. Every hiding
    rule is behind [data-armed], and only the client component ever sets that
    attribute - so no script means no attribute means nothing hidden.
  */
  const hidingRules = css
    .split('\n')
    .filter((line) => /^\[data-reveal/.test(line) && /opacity: 0|transform: (translate|scale)/.test(line + css));

  yes('the armed attribute is set only from the client component', reveal.includes("dataset.armed"));
  yes(
    'every rule that hides something requires it',
    css
      .split('}')
      .filter((block) => /opacity:\s*0(?!\.)/.test(block) && block.includes('[data-reveal'))
      .every((block) => block.includes('[data-armed]')),
  );
  is('and there is at least one such rule to check', hidingRules.length > 0, true);

  // Largest Contentful Paint measures when content is painted, and an element
  // at opacity zero has not been. Anything already on screen is revealed
  // rather than armed, so the top of the page is never hidden for a frame.
  yes('an element already on screen is never armed', reveal.includes('getBoundingClientRect'));
  yes('reduced motion returns before arming anything', /prefers-reduced-motion[\s\S]{0,200}return/.test(reveal));

  // Killing transition durations does not undo an opacity of zero. Reduced
  // motion has to put the content back, not hurry the animation.
  const reducedBlock = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  yes('reduced motion restores the hidden state', reducedBlock.includes('[data-reveal]') && reducedBlock.includes('opacity: 1 !important'));
}

console.log('\n--- only the compositor is asked to do anything ---');
{
  const css = read('src/app/globals.css');
  const revealCss = css.slice(css.indexOf('[data-reveal][data-armed]'), css.indexOf('@media (prefers-reduced-motion: reduce)'));

  // Animating height, top, margin or width makes the browser re-lay-out the
  // page on every frame, which is what turns a scroll into a stutter on the
  // phones this most needs to be smooth on.
  for (const property of ['height', 'width', 'margin', 'padding', 'top:', 'left:']) {
    yes(`nothing animates ${property.replace(':', '')}`, !revealCss.includes(`transition-property: ${property}`) && !new RegExp(`transition:[^;]*${property}`).test(revealCss));
  }
  yes('transitions name opacity and transform only', /transition-property: opacity, transform/.test(revealCss));
  yes('the will-change hint is dropped once the movement is over', /\[data-revealed\][\s\S]{0,200}will-change: auto/.test(revealCss));

  // A grid of thirty cards with an open-ended step would still be arriving
  // two seconds later, by which time the reader has scrolled past.
  yes('the stagger stops stepping after ten', revealCss.includes('nth-child(n + 10)'));

  /*
    The stagger targets a group the component marks, not a shape the
    stylesheet guesses at.

    The first version guessed twice and was wrong twice: `> * > :nth-child(n)`
    put every delay at zero, because the cards sit four levels down, and a
    list of tag names hid six wrapper divs as well as the three cards. Both
    were invisible failures - the animation ran, it just all arrived at once.
  */
  yes('the stagger targets a marked group', revealCss.includes('[data-reveal-items] > *'));
  yes('and never a list of tag names', !/\[data-reveal='stagger'\][^{]*:is\(li, article/.test(revealCss));

  // A component that can stagger but marks no group animates nothing at all,
  // silently. Anything with a repeatable list is a candidate.
  const rendered = read('src/components/cms/sections/index.tsx') + read('src/components/shared/faq.tsx');
  for (const component of listComponents()) {
    if (!component.animatable) continue;
    if (!component.fields.some((field) => field.type === 'list')) continue;
    yes(
      `"${component.key}" marks the group that staggers`,
      rendered.includes('data-reveal-items'),
    );
  }
}

console.log('\n--- every way of changing a page checks who is asking ---');
{
  /*
    A server action has its own endpoint and is reachable without rendering
    the page that offers it. So a hidden button is a courtesy to whoever is
    looking at the screen, never a control - the check has to be in the
    action, and the ones that matter are in the database as well.
  */
  const actions = read('src/app/admin/(protected)/pages/section-actions.ts');

  const bodies = actions
    .split(/export async function /)
    .slice(1)
    .map((chunk) => ({ name: chunk.slice(0, chunk.indexOf('(')), body: chunk }));

  is('there are actions to check', bodies.length > 0, true);
  for (const action of bodies) {
    yes(`${action.name} requires an admin session`, action.body.includes('requireAdminSession'));
  }

  /*
    Content is rebuilt from the component's schema, so a key nobody declared
    cannot survive however it was posted.

    Matched on the call, not the name. The first version looked for
    'cleanSectionValues' anywhere in the file and passed with the call
    deleted, because the import line still mentions it - the same mistake the
    registry-split check made, in a different file.
  */
  const save = bodies.find((action) => action.name === 'saveSectionAction')?.body ?? '';
  const add = bodies.find((action) => action.name === 'addSectionAction')?.body ?? '';

  /*
    Scoped to the action that matters, not to the file.

    The first version searched the whole file and passed with the call deleted
    from saveSectionAction, because addSectionAction has one too - and
    addSectionAction only ever cleans the component's own defaults. The action
    handling values somebody posted is the one that has to rebuild them.
  */
  yes('saving rebuilds the values from the schema', save.includes('cleanSectionValues(component'));
  yes('adding starts from cleaned defaults too', add.includes('cleanSectionValues(component'));
  yes('and the variant has to be one the component named', save.includes('resolveVariant(component'));

  // A locked section is refused three times: the button is not rendered, the
  // action returns early, and the delete carries locked = false in its filter.
  yes('deleting checks the lock', /section\.locked/.test(actions));
  const repo = read('src/lib/services/supabase/page-section-repository.ts');
  yes('and the delete query carries it too', repo.includes(".eq('locked', false)"));

  /*
    Reordering sends the finished order rather than a pair to swap, because
    renumbering is one statement and a statement needs the whole order - a row
    at a time collides on the unique constraint halfway through.
  */
  yes('reordering sends the whole order', actions.includes("formData.get('order')"));
  yes('and goes through the function that does it in one statement', repo.includes('reorder_page_sections'));
}

console.log('\n--- the library holds together ---');
{
  const sectionFiles = [
    'src/components/cms/sections/index.tsx',
    'src/components/cms/sections/content.tsx',
    'src/components/cms/sections/visual.tsx',
    'src/components/cms/sections/marketplace.tsx',
    'src/components/cms/sections/parrot.tsx',
    'src/components/cms/sections/hero.tsx',
  ];
  const all = sectionFiles.map(read).join('\n');

  is('the library is a library', listComponents().length >= 20, true);
  yes('no renderer is a client component', !all.includes("'use client'"));

  /*
    One H1 per page, and it belongs to the hero.

    A second H1 is a real SEO fault rather than a matter of taste, and a page
    builder is exactly how a page grows one: every section is written
    separately, and each one is tempting to start with the biggest heading.
    The rich text whitelist already refuses an H1 inside content; this is the
    same rule for the components themselves.
  */
  const withH1 = sectionFiles.filter((file) => /<h1[\s>]/.test(read(file)));
  is('exactly one section file renders an h1', withH1.length, 1);
  is('and it is the hero', withH1[0]?.endsWith('hero.tsx'), true);

  /*
    One priority image per page, and it is the hero's.

    Everything else is lazy. Two images marked priority compete for the same
    early bandwidth, which makes both of them later - so the setting is worth
    having only while exactly one thing has it.
  */
  /*
    Matched as a prop on its own line, not as a word.

    The first version searched for 'priority' anywhere and found it twice -
    once as the hero's prop and once in a comment in content.tsx explaining
    that nothing there is priority. Prose about a rule is not the rule.
  */
  const priority = sectionFiles.filter((file) => /^\s*priority\s*$/m.test(read(file)));
  is('exactly one section file marks an image priority', priority.length, 1);
  is('and it is the hero again', priority[0]?.endsWith('hero.tsx'), true);
}

console.log('\n--- the long content is in the page, not behind a request ---');
{
  /*
    The whole reason the expandable section is worth building rather than
    cutting the copy: every word is in the server's response, inside a
    <details> that starts closed. Fetching the rest on click would hide it
    from a crawler, which is the opposite of why the copy exists.

    <details> also means it works without JavaScript, it is keyboard
    operable, screen readers announce it as a disclosure, and find-in-page
    opens it.
  */
  const content = read('src/components/cms/sections/content.tsx');
  const expandable = content.slice(content.indexOf('export function ExpandableSection'));

  yes('the hidden copy is rendered, not fetched', expandable.includes('<details'));
  yes('and it is rendered on the server', !expandable.includes('useState') && !expandable.includes('onClick'));
  yes('the label is editable rather than always "Read more"', expandable.includes("str(values, 'label')"));

  const schema = getComponent('expandable');
  yes('and the editor asks for a label that says what is behind it', /Read more/.test(schema?.fields.find((f) => f.key === 'label')?.help ?? ''));
}

console.log('\n--- what a section may ask the application for ---');
{
  // A closed vocabulary. A component can ask for the marketplace preview; it
  // cannot ask for the result of a query, which is the seam that keeps
  // editorial content away from the inventory.
  is('a component with no needs asks for nothing', needsOf('rich-text').length, 0);
  is('an unknown component asks for nothing', needsOf('nope').length, 0);
  yes('the preview is something a section can ask for', needsOf('marketplace-preview').includes('preview'));

  // Two marketplace blocks on one page are one fetch between them.
  const twice = neededBy(['marketplace-preview', 'marketplace-preview', 'marketplace-stats']);
  is('the same need twice is one fetch', [...twice].filter((need) => need === 'preview').length, 1);
  is('and two needs are two', twice.size, 2);
  is('a page needing nothing fetches nothing', neededBy(['rich-text', 'cta']).size, 0);

  // Anything that declares a need has to actually read it, or the declaration
  // is a query made for nobody.
  const renderers = read('src/components/cms/sections/marketplace.tsx') + read('src/components/cms/sections/parrot.tsx') + read('src/components/cms/sections/hero.tsx');
  for (const component of listComponents()) {
    if (needsOf(component.key).length === 0) continue;
    yes(`"${component.key}" reads the data it asks for`, renderers.includes('data.'));
  }
}

console.log('\n--- the homepage counts rather than claims ---');
{
  /*
    The homepage claimed "5,000+ vetted websites" against a real number nearer
    nine hundred. Nobody lied: somebody typed a figure that was aspirational
    once, and nothing in the system ever disagreed with it again.

    So the three headline figures are counted on every render and only their
    labels are editable. This checks the shape rather than the number - a
    number in a test would go stale the same way.
  */
  const hero = read('src/components/home/hero.tsx');
  const metrics = read('src/components/home/trust-metrics.tsx');
  const defaults = read('src/lib/cms/pages/home.ts');

  yes('the hero cards read the live count', hero.includes('stats.totalWebsites'));
  yes('the trust row does too', metrics.includes('stats.totalWebsites'));
  yes('and the niche count', metrics.includes('stats.totalNiches'));
  yes('and the country count', metrics.includes('stats.totalCountries'));

  // A figure of zero is a marketplace that has not loaded, not a claim worth
  // printing.
  yes('a figure of nothing is left out', /value > 0/.test(hero) && /value > 0/.test(metrics));

  /*
    And nothing that looks like a website count is typed into the defaults.
    Matched on the shape a marketing figure takes - "5,000+", "12,450+" -
    beside a word about websites, which is what was actually there.
  */
  const claims = defaults.match(/'[\d,]+\+?'\s*,\s*label:\s*'[^']*(website|site)/gi) ?? [];
  is('no website count is typed into the homepage defaults', claims.length, 0);

  // The extension point exists, so the page can grow without a deploy.
  const page = read('src/app/(marketing)/page.tsx');
  yes('the homepage renders any sections built in the admin', page.includes('<PageSections'));
  yes('and still fetches its data once', (page.match(/await Promise\.all/g) ?? []).length === 1);
}

console.log('\n--- the homepage links into the metrics page, and lands ---');
{
  /*
    A cross-page contract that breaks in silence.

    The homepage's metric cards link to /link-building-metrics#organic-traffic
    and four others. Those fragments are anchor ids on the metrics page, and
    renaming one there does nothing visible here - the link still works, it
    just lands at the top of a three-thousand-word page instead of at the
    paragraph that answers the question. Nobody would notice for months.
  */
  const home = await import('../src/lib/cms/pages/home');
  const metrics = await import('../src/lib/cms/pages/link-building-metrics');

  const anchors = new Set(
    (metrics.defaults.metrics as { items: { id: string }[] }).items.map((metric) => metric.id),
  );
  const cards = (home.defaults.metricCards as { items: { title: string; href: string }[] }).items;

  is('the metrics page has anchors to link to', anchors.size >= 8, true);
  is('and the homepage has cards pointing at them', cards.length >= 4, true);

  for (const card of cards) {
    const fragment = card.href.split('#')[1];
    yes(`"${card.title}" points at an anchor that exists`, Boolean(fragment) && anchors.has(fragment));
  }

  // Every anchor id has to be usable as one.
  yes(
    'every anchor is a valid fragment',
    [...anchors].every((id) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)),
  );

  /*
    And every metric says what it cannot tell you.
    
    That is the editorial rule the page exists for: a reference presenting
    Domain Rating as a verdict teaches people to buy bad links confidently,
    which is worse than teaching them nothing. It is a field rather than a
    convention so that it cannot be quietly dropped from one entry.
  */
  const items = (metrics.defaults.metrics as { items: { heading: string; limit: string }[] }).items;
  for (const metric of items) {
    yes(`"${metric.heading}" says what it cannot tell you`, (metric.limit ?? '').length > 30);
  }
}

console.log('\n--- a niche page is something somebody makes, not something somebody deploys ---');
{
  /*
    The gambling page's design was locked to one hardcoded route: a sports or
    finance version of it meant a schema, a route, a registry entry and a
    deploy. Its shape is shared now, so a page created in the admin can choose
    it - which is the thing the brief is actually asking for when it says
    future niche pages should be easy to create without coding.
  */
  const gambling = read('src/lib/cms/pages/gambling-link-building.ts');
  const custom = read('src/lib/cms/custom-page.ts');
  const route = read('src/app/(marketing)/[slug]/page.tsx');
  const template = read('src/components/marketing/niche-landing-page.tsx');

  yes('the gambling page uses the shared shape', gambling.includes('nicheSections()'));
  yes('and no longer declares its own', !gambling.includes("section(\n      'hero'"));
  yes('a custom page can choose that shape', custom.includes('nicheSections()'));
  yes('and the route draws it', route.includes('<NicheLandingPage'));

  // An unknown template is the one every page had before templates existed,
  // not a crash on a live page.
  const { readTemplate } = await import('../src/lib/cms/custom-page');
  is('an unknown template falls back', readTemplate('elementor'), 'service');
  is('so does nothing at all', readTemplate(undefined), 'service');
  is('and the niche template is real', readTemplate('niche'), 'niche');

  /*
    The niche template is the fallback now, not the page.

    It used to take a slot - sections rendered at one fixed point inside it -
    which meant a page had two shapes at once and the template's won. A page
    with sections renders from them and never reaches this file; a page
    without renders from it exactly as before, which is what keeps a
    conversion reversible.

    The slot going away is the check. Its presence was the bug.
  */
  const gamblingRoute = read('src/app/(marketing)/gambling-link-building/page.tsx');
  yes('the niche template no longer takes a slot', !template.includes('extra?: ReactNode'));
  yes('and still does not import the builder', !template.includes('page-sections'));
  yes('the gambling route renders sections first', gamblingRoute.includes('<PageSections'));
  yes('with the template as its fallback', gamblingRoute.includes('fallback={'));
  yes('and never as a slot', !gamblingRoute.includes('extra={'));
  yes('the custom niche route does the same', route.includes('fallback={'));

  /*
    The category is page-level configuration, passed once, rather than a field
    on every component that draws the marketplace. A section with a niche
    field is a page that has to be told "igaming" nine times, and told it
    wrong once.
  */
  yes('the gambling route configures the page', gamblingRoute.includes('config={config}'));
  yes('and names its category once', count(gamblingRoute, "NICHE: NicheSlug = 'igaming'") === 1);
  for (const component of listComponents()) {
    if (component.group !== 'niche') continue;
    yes(
      `${component.label} has no category field of its own`,
      !component.fields.some((field) => /niche|category/i.test(field.key)),
    );
  }

  /*
    A niche page scoped to a category nobody recognises shows the whole
    marketplace rather than the wrong part of it. A finance page quietly
    listing gambling publishers is worse than one listing everything, because
    only the second is obvious.
  */
  yes('an unknown category scopes to nothing', route.includes('readNiche'));
}

console.log('\n--- a page in code cannot be shadowed by a page in the admin ---');
{
  /*
    Next resolves a static route ahead of a dynamic one, so a custom page
    created at a slug that already has a route is not a conflict - it is a
    page that saves, appears in the admin, says it is published, and is
    unreachable. Nothing anywhere reports it.

    RESERVED_SLUGS exists to refuse that, and it is a hand-maintained list
    beside a registry that grows. Both pages added in these phases were
    missing from it until this check was written.
  */
  const { RESERVED_SLUGS } = await import('../src/lib/cms/custom-page');
  const { pageRegistry } = await import('../src/lib/cms/registry');

  for (const page of pageRegistry) {
    yes(
      `"/${page.definition.slug}" cannot be taken by a custom page`,
      RESERVED_SLUGS.has(page.definition.slug),
    );
  }
}

console.log('\n--- every page can grow without a deploy ---');
{
  /*
    Two states, and which one a page is in is not a guess.

    The niche template has been converted: its bands are registered sections,
    its routes render from those and fall back to the template. The service
    template has not, so it still takes a slot and sections are an addition to
    what it draws rather than a replacement for it. Mixing those two up is how
    a page gets blanked, so each is asserted as itself.
  */
  const service = read('src/components/marketing/service-page.tsx');
  yes('the service template still takes a slot', service.includes('extra?: ReactNode'));
  yes('and does not import the builder', !service.includes('page-sections'));

  const slotted = [
    'src/app/(marketing)/buy-backlinks/page.tsx',
    'src/app/(marketing)/guest-posts/page.tsx',
    'src/app/(marketing)/niche-edits/page.tsx',
    'src/app/(marketing)/link-building/page.tsx',
    'src/app/(marketing)/digital-pr/page.tsx',
    'src/app/(marketing)/link-building-agencies/page.tsx',
  ];
  for (const route of slotted) {
    yes(`${route.split('/').at(-2)} can still grow`, read(route).includes('extra={<PageSections'));
  }

  const unified = [
    'src/app/(marketing)/gambling-link-building/page.tsx',
    'src/app/(marketing)/[slug]/page.tsx',
  ];
  for (const route of unified) {
    yes(
      `${route.split('/').at(-2)} renders its sections as the page`,
      read(route).includes('fallback={'),
    );
  }

  /*
    A page that renders from a template cannot be given one section at a
    time: sections are the page, so the first one would be the whole of it,
    and an editor who meant to add a band to the bottom would have blanked
    it. The action refuses it and says to convert instead.
  */
  const actions = read('src/app/admin/(protected)/pages/section-actions.ts');
  const addBody = actions.slice(
    actions.indexOf('export async function addSectionAction'),
    actions.indexOf('export async function convertPageToSectionsAction'),
  );
  yes('adding the first section to an unconverted page is refused', addBody.includes('canConvert('));
  yes('and it is refused where the page is convertible', addBody.includes('existing.length === 0'));
}

console.log('\n--- a page converts into its sections without losing anything ---');
{
  /*
    The conversion is the whole point of this phase, and the way it fails is
    quiet: a band that has no section, a field that is silently truncated, or
    a live figure baked into a heading at the moment somebody pressed the
    button. All three look fine on the day and are wrong later.

    So it is checked against the real gambling page, resolved the way the
    route resolves it.
  */
  const { blueprintFor, canConvert, nichePageBlueprint } = await import(
    '../src/lib/cms/migrate/page-to-sections'
  );
  const { resolvePage } = await import('../src/lib/cms/resolve');
  const gambling = await import('../src/lib/cms/pages/gambling-link-building');

  const resolved = resolvePage(gambling.definition, gambling.defaults, undefined);
  const blueprint = blueprintFor('niche', resolved.values);

  yes('the niche template can be converted', canConvert('niche'));
  yes('an unknown template cannot', !canConvert('elementor'));
  is('the gambling page becomes nine sections', blueprint.length, 9);

  is('the first is the hero', blueprint[0]?.component, 'niche-hero');
  is('the last is the closing call to action', blueprint.at(-1)?.component, 'cta');
  is('and it is the dark one', blueprint.at(-1)?.variant, 'dark');

  /*
    Every band of the template has somewhere to go. Checked from the schema
    rather than from a list written here, so a field added to the niche
    template later fails this until somebody decides where it belongs -
    which is the point at which the decision is cheap.

    The two settings groups are not sections and never become sections.
  */
  const SETTINGS = ['seo', 'marketplace'];
  /*
    The niche blueprint's own body, not the whole file.

    Scoped deliberately: the file holds a blueprint per template now, and the
    homepage's reads a CMS group called `marketplace` of its own. Searching
    the file would have said the niche page's marketplace category had become
    a section the moment an unrelated page mentioned the word.
  */
  const whole = readFileSync(
    new URL('../src/lib/cms/migrate/page-to-sections.ts', import.meta.url),
    'utf8',
  );
  const start = whole.indexOf('export function nichePageBlueprint');
  const source = whole.slice(start, whole.indexOf('\nexport function ', start + 1));
  yes('the niche blueprint was found to check', source.length > 500);
  for (const section of gambling.definition.sections) {
    if (SETTINGS.includes(section.key)) {
      yes(`"${section.key}" stays a page setting`, !source.includes(`'${section.key}'`));
      continue;
    }
    yes(`"${section.key}" has somewhere to go`, source.includes(`'${section.key}'`));
  }

  /*
    Nothing is truncated on the way across. A heading that arrives one
    character short of the original is a heading nobody notices is wrong, and
    the schemas each declare their own maxLength.
  */
  const strings = (value: unknown): string[] => {
    if (typeof value === 'string') return [value];
    if (Array.isArray(value)) return value.flatMap(strings);
    if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
    return [];
  };
  const before = new Set(
    Object.entries(resolved.values)
      .filter(([key]) => !SETTINGS.includes(key))
      .flatMap(([, group]) => strings(group))
      .map((text) => text.replace(/\s+/g, ' ').trim())
      .filter((text) => text.length > 0),
  );
  const after = new Set(strings(blueprint.map((entry) => entry.values)).map((t) => t.replace(/\s+/g, ' ').trim()));
  const lost = [...before].filter((text) => !after.has(text));
  yes(`every string survives the conversion${lost.length ? `: lost ${JSON.stringify(lost.slice(0, 3))}` : ''}`, lost.length === 0);

  /*
    A live figure is copied as its token, never as the number it happened to
    be. This is the failure that takes a year to show up: a page claiming 247
    publishers long after there are 900.

    The gambling page offers the token and does not currently use it, so this
    is asserted against a page that does - which is also what proves the
    check rather than the page: it fails if the conversion ever resolves a
    token on the way across.
  */
  const quoted = resolvePage(gambling.definition, gambling.defaults, {
    preview: { countSuffix: 'of {{gambling_site_count}} gambling websites' },
  });
  const withToken = blueprintFor('niche', quoted.values);
  yes(
    'a live figure is copied as its token, not as a number',
    strings(withToken.map((entry) => entry.values)).some((text) =>
      text.includes('{{gambling_site_count}}'),
    ),
  );
  yes(
    'and nothing else picked up a resolved figure',
    !strings(blueprint.map((entry) => entry.values)).some((text) => /\b\d{3,}\+? (websites|publishers|listings)/.test(text)),
  );

  /*
    Locking. The hero cannot be moved or deleted because it holds the page's
    only H1 and its breadcrumb. Nothing else is locked - a migrated page an
    editor cannot rearrange would have missed the point of migrating it.
  */
  is('the hero arrives locked', blueprint[0]?.locked, true);
  is(
    'and nothing else does',
    blueprint.slice(1).filter((entry) => entry.locked).length,
    0,
  );

  /*
    Proved by breaking it: a blueprint built from an empty page must not
    invent nine sections out of defaults. Two survive - the hero and the
    preview, which every niche page has - and the rest are absent rather
    than present and blank.
  */
  const empty = nichePageBlueprint({});
  is('an empty page becomes only the bands every niche page has', empty.length, 3);
  yes(
    'and none of them is a band with nothing in it',
    empty.every((entry) => ['niche-hero', 'niche-preview', 'journey-steps'].includes(entry.component)),
  );

  /*
    Every component the blueprint names is one the registry can draw. A
    blueprint naming a component that does not exist writes rows that render
    as gaps, which nothing reports.
  */
  for (const entry of blueprint) {
    const component = getComponent(entry.component);
    yes(`"${entry.component}" is a real component`, component !== null);
    if (component) {
      is(
        `and "${entry.variant}" is one of its layouts`,
        resolveVariant(component, entry.variant),
        entry.variant,
      );
    }
  }
}

console.log('\n--- the homepage is assembled, and every part of it is true ---');
{
  /*
    The homepage is the page paid traffic lands on, so the ways it can be
    wrong are expensive: a number somebody typed, a quote nobody said, a card
    linking to a page that does not exist. All three look fine on the day.
  */
  const { blueprintFor, canConvert } = await import('../src/lib/cms/migrate/page-to-sections');
  const { resolvePage } = await import('../src/lib/cms/resolve');
  const home = await import('../src/lib/cms/pages/home');
  const { pageRegistry } = await import('../src/lib/cms/registry');

  const resolved = resolvePage(home.definition, home.defaults, undefined);
  const blueprint = blueprintFor('home', resolved.values);

  yes('the homepage can be converted', canConvert('home'));
  is('and becomes twenty-one sections', blueprint.length, 21);

  is('the hero comes first', blueprint[0]?.component, 'home-hero');
  is('and it is locked', blueprint[0]?.locked, true);
  is(
    'and nothing else is',
    blueprint.slice(1).filter((entry) => entry.locked).length,
    0,
  );
  is('the closing call to action comes last', blueprint.at(-1)?.component, 'cta');
  is('as the green panel', blueprint.at(-1)?.variant, 'panel');

  /*
    One H1. `home-hero` is the only component on the page that renders one,
    and the registry marks exactly the components that do as structural.
  */
  const structural = blueprint.filter(
    (entry) => getComponent(entry.component)?.structural === true,
  );
  is('exactly one section holds the page heading', structural.length, 1);

  // Every component is real, and every variant is one it declares.
  for (const entry of blueprint) {
    const component = getComponent(entry.component);
    yes(`"${entry.component}" is a real component`, component !== null);
    if (component) {
      is(
        `and "${entry.variant}" is one of its layouts`,
        resolveVariant(component, entry.variant),
        entry.variant,
      );
    }
  }

  const strings = (value: unknown): string[] => {
    if (typeof value === 'string') return [value];
    if (Array.isArray(value)) return value.flatMap(strings);
    if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
    return [];
  };
  const copy = strings(blueprint.map((entry) => entry.values));

  /*
    No figure anybody typed.

    The design this was built from shows "12,500+ websites in the
    marketplace", "2,800+ SEO professionals" and "4.9/5". They are
    illustrative numbers in a picture, and the real marketplace is nearer
    nine hundred sites. Every count on the page is counted on the render that
    draws it, so a claim of that shape in the copy is a claim somebody typed.
  */
  const claims = copy.filter((line) =>
    /\b\d[\d,]*\+?\s*(websites|publishers|sites|niches|countries|customers|users|agencies|SEOs)\b/i.test(
      line,
    ),
  );
  yes(
    `no figure is typed into the copy${claims.length ? `: ${JSON.stringify(claims.slice(0, 2))}` : ''}`,
    claims.length === 0,
  );
  const ratings = copy.filter((line) => /\b[0-5]\.\d\s*\/\s*5\b/.test(line));
  yes('and no review score', ratings.length === 0);

  /*
    No customer is quoted. The band exists and is editable; it arrives empty
    and switched off, because an invented testimonial is a lie on the page a
    stranger judges the business by.
  */
  const quotes = blueprint.find((entry) => entry.component === 'testimonials');
  yes('the quotes band exists', Boolean(quotes));
  is('and arrives hidden', quotes?.hidden, true);
  is(
    'holding no quotes',
    Array.isArray(quotes?.values.items) ? (quotes.values.items as unknown[]).length : -1,
    0,
  );

  /*
    Every link goes somewhere.

    A homepage card pointing at /sports-link-building because somebody
    intends to build it one day is a 404 on the page paid traffic lands on.
    Checked against the pages that actually exist, plus the application
    routes that are not CMS pages.
  */
  const APP_ROUTES = new Set([
    '/',
    '/marketplace',
    '/signup',
    '/login',
    '/resources',
    '/websites',
    '/dashboard',
  ]);
  const known = new Set([...APP_ROUTES, ...pageRegistry.map((page) => page.definition.path)]);

  const hrefs = new Set<string>();
  const walk = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(walk);
    if (value && typeof value === 'object') {
      const entry = value as Record<string, unknown>;
      for (const key of ['href']) {
        if (typeof entry[key] === 'string' && entry[key]) hrefs.add(entry[key] as string);
      }
      Object.values(entry).forEach(walk);
    }
  };
  walk(blueprint.map((entry) => entry.values));

  for (const href of hrefs) {
    // The path, without its query or its anchor.
    const path = href.split('?')[0]!.split('#')[0]!;
    yes(`"${href}" goes somewhere real`, known.has(path));
  }

  /*
    The editorial column was eight articles in one place; the design
    distributes them. Distributed, not copied - the same words appearing in
    two bands is two places to edit and one of them will be missed.
  */
  const articles =
    (home.defaults.editorial as { articles?: { id: string; content: unknown }[] } | undefined)
      ?.articles ?? [];
  yes('the homepage has editorial articles to place', articles.length > 0);

  for (const entry of articles) {
    /*
      Matched on the article's own opening words rather than on its heading,
      and that distinction is the check.

      Written against the heading first, it passed with two bands carrying
      the same article - because what the blueprint copies is the article's
      *content*, and the content does not contain its own heading. The test
      was asking a question nothing could answer no to. Proved by putting one
      article in two bands, which it now fails.
    */
    const opening =
      typeof entry.content === 'string' ? entry.content.trim().replace(/\s+/g, ' ').slice(0, 60) : '';
    if (opening.length < 40) continue;

    const appearances = blueprint.filter((section) =>
      strings(section.values).some((line) => line.replace(/\s+/g, ' ').includes(opening)),
    ).length;
    yes(`"${entry.id}" is on the page at most once`, appearances <= 1);
  }
}

console.log('\n--- a starting structure only names sections that exist ---');
{
  /*
    A typo in a starter is a page created with a section that renders nothing:
    the row is written, the admin lists it, and the renderer skips it because
    no component has that key. Nothing reports it, and the person who created
    the page assumes the section is empty rather than broken.
  */
  const { STARTERS, readStarter, startersFor } = await import('../src/lib/cms/starters');

  for (const starter of STARTERS) {
    for (const key of starter.sections) {
      yes(`"${starter.label}" can draw its ${key}`, getComponent(key) !== null);
    }
  }

  yes('there is an empty option', STARTERS.some((starter) => starter.sections.length === 0));
  yes('every starter explains itself', STARTERS.every((starter) => starter.help.length > 15));

  // A starter is only offered where its sections suit the design, and a
  // starter posted for the wrong one falls back rather than being applied.
  yes('the niche starter is not offered to a service page',
    !startersFor('service').some((starter) => starter.key === 'niche-landing'));
  is('and is refused if posted anyway', readStarter('niche-landing', 'service').sections.length, 0);
  is('an unknown starter is the empty one', readStarter('nope', 'niche').sections.length, 0);
  is('a real one is kept', readStarter('niche-landing', 'niche').key, 'niche-landing');
}

console.log('\n--- duplicating a page does not duplicate its identity ---');
{
  /*
    Three things a copy must not inherit, and all three fail silently.

    A duplicated meta description is two pages telling Google they are the
    same page. A duplicated marketplace category is a sports page listing
    gambling publishers under a sports headline. And a copy that starts
    published is live for a moment carrying both.
  */
  const service = read('src/lib/services/custom-page-service.ts');
  const duplicate = service.slice(service.indexOf('async duplicate('), service.indexOf('async readForDuplication('));

  yes('the search engine listing is cleared', duplicate.includes('delete values.seo'));
  yes('the marketplace category is cleared', /marketplace[\s\S]{0,120}niche: ''/.test(duplicate));
  yes('and the copy starts as a draft', duplicate.includes('published: false'));

  // The copies are local even where the originals were shared. A duplicated
  // page pointing at the same globals looks right and is a trap: editing what
  // looks like this page's CTA would rewrite it everywhere.
  const sectionService = read('src/lib/services/page-section-service.ts');
  const copyPage = sectionService.slice(sectionService.indexOf('async copyPage('), sectionService.indexOf('/** One section by id'));
  yes('copied sections are this page\'s own', copyPage.includes('section.global ?? section'));
  yes('and never references', !copyPage.includes('globalId:'));

  // The editor says all of this before the button, not after.
  const form = read('src/components/admin/cms/duplicate-page.tsx');
  yes('the form warns about the listing', /Does not copy the search engine listing/.test(form));
  yes('and about the category', /Does not copy the marketplace category/.test(form));
}

console.log('\n--- a shared section is edited where it lives ---');
{
  /*
    Editing a shared section from inside one of the pages using it is how
    somebody changes a call to action on nine pages believing they are
    changing it on one. So opening one shows where its content lives and what
    detaching does - not its fields.
  */
  const list = read('src/components/admin/cms/section-list.tsx');
  yes('opening a shared section warns instead of editing', list.includes('GlobalNotice'));
  yes('and says how many pages it reaches', /changes every page using it/.test(list));
  yes('detaching is offered', list.includes('detachGlobalAction'));

  // Detaching brings the content down, so the page renders what it rendered.
  const service = read('src/lib/services/page-section-service.ts');
  const detach = service.slice(service.indexOf('async detach('), service.indexOf('async addGlobal('));
  yes('detaching copies the content down first', detach.includes('values: global.values'));
  yes('before it unlinks', detach.indexOf('values: global.values') < detach.indexOf('this.link(id, null)'));
}

console.log('\n--- the primary button is readable ---');
{
  /*
    White on accent-600 is 3.77:1. AA wants 4.5:1 for text below 18.66px, and
    the button's label is 15px - so the main call to action on every page of
    the site failed, and had since it was built. It is accent-700 now, at
    5.48:1.

    Computed from the stylesheet rather than asserted as a hex, because the
    failure mode is somebody adjusting the palette and not thinking about the
    button that sits on it.
  */
  const css = read('src/app/globals.css');
  const button = read('src/components/ui/button.tsx');

  const hex = (name: string) => {
    const match = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6})`, 'i'));
    if (!match) throw new Error(`globals.css has no --color-${name}`);
    return match[1];
  };

  const luminance = (colour: string) => {
    const parts = [1, 3, 5]
      .map((at) => parseInt(colour.slice(at, at + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * parts[0] + 0.7152 * parts[1] + 0.0722 * parts[2];
  };

  const contrast = (a: string, b: string) => {
    const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (light + 0.05) / (dark + 0.05);
  };

  // Whichever shade the accent button actually uses.
  const shade = button.match(/bg-(accent-\d+) text-white/)?.[1];
  yes('the accent button names a shade from the palette', Boolean(shade));

  const ratio = contrast(hex(shade ?? 'accent-700'), '#ffffff');
  yes(
    `white on ${shade} is ${ratio.toFixed(2)}:1, which clears 4.5:1`,
    ratio >= 4.5,
  );

  // The hover shade has to be readable too - it is the same label.
  const hover = button.match(/hover:bg-(accent-\d+)/)?.[1];
  if (hover) {
    const hoverRatio = contrast(hex(hover), '#ffffff');
    yes(`and ${hover} on hover is ${hoverRatio.toFixed(2)}:1`, hoverRatio >= 4.5);
  }
}

console.log('\n--- links in prose are not distinguished by colour alone ---');
{
  /*
    Against body text the accent green is 1.15:1, so a link marked only by
    colour is invisible to a reader who cannot tell the two apart. Underlined
    by default - `hover:underline` alone means the cue appears only for
    somebody already pointing at it.
  */
  for (const file of ['src/lib/cms/rich-text-render.tsx', 'src/lib/cms/markdown.tsx']) {
    const source = read(file);
    const links = source.match(/className="text-accent-700[^"]*"/g) ?? [];
    yes(`${file.split('/').at(-1)} has prose links to check`, links.length > 0);
    /*
      The class token exactly, not the word.

      The first version tested for /\\bunderline\\b/ and passed with the fix
      reverted, because `hover:underline` contains it - the cue appears only
      for somebody already pointing at the link, which is the failure. Split
      into tokens and look for a bare one.
    */
    yes(
      `and every one is underlined without hovering`,
      links.every((className) =>
        className
          .replace(/^className="|"$/g, '')
          .split(/\s+/)
          .includes('underline'),
      ),
    );
  }
}

console.log(failed ? `\n  ${failed} FAILED\n` : '\n  all passed\n');
process.exit(failed ? 1 : 0);
