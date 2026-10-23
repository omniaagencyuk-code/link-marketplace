/**
 * Prove the /link-building-agencies redesign kept every word the old page
 * had, and that none of its drawings offers a feature the page's own
 * paragraphs say we do not have.
 *
 * `service-redraw.mts` is the first half, the same comparison the other
 * three redraws make: the old `ServicePage` and the new composition rendered
 * from the same shipped content, with anything the old one said that the new
 * one does not counting as a failure.
 *
 * The second half is this page's own, and it is a different danger from
 * /digital-pr's. That page could oversell an outcome. This one can oversell
 * the *software*, and it is the easiest place on the site to do it, because
 * every stock agency landing page is built out of exactly the things this
 * page's FAQs deny:
 *
 *   - "Can I add my team to one account?"    -> "Not yet."
 *   - "Can you white label reporting?"       -> "Not currently."
 *   - and a fourth section headed "What we are building next for agencies".
 *
 * A white-label badge in a drawing, a row of invented client logos, or a
 * figure like "245 links placed, +42%" would each be a claim the page itself
 * refuses four screens later. Nothing in a type check or a build catches
 * that - the markup would be perfectly valid - so it is checked here:
 *
 *   - every mention of a denied feature is a denial of it, measured sentence
 *     by sentence, with the one labelled roadmap list taken out first;
 *   - no logo, no testimonial, no customer count, no percentage;
 *   - every capability the page does claim names a dashboard route that
 *     exists on disk;
 *   - the hero board shows only niches and order statuses the product has
 *     words for, and its totals are the sum of its own rows;
 *   - and the board is server-rendered CSS, because the words in it are the
 *     drawing and a Motion entrance would hide the hero behind a bundle.
 *
 * No key, no database, no network, no browser.
 */
import { readFileSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Building2, FileSpreadsheet, Layers, Wallet } from 'lucide-react';
import * as agencies from '../src/lib/cms/pages/link-building-agencies';
import {
  AGENCY_PRICING_HREF,
  AgenciesPage,
} from '../src/components/agencies/agencies-page';
import {
  BOARD_TOTALS,
  CAMPAIGNS,
  progress,
} from '../src/components/agencies/agency-dashboard';
import { CAPABILITIES, LIVE, NOT_YET } from '../src/components/agencies/visuals';
import { ORDER_STEPS } from '../src/components/marketing/order-steps';
import { PR_STAGES } from '../src/components/digital-pr/pr-stages';
import { MARKETPLACE_FILTERS } from '../src/components/marketing/marketplace-filters';
import { ServicePage } from '../src/components/marketing/service-page';
import { acceptedNiches, acceptedNicheLabel } from '../src/lib/config/accepted-niches';
import { orderStatusLabels } from '../src/lib/utils/labels';
import { compareRedraw, readable, report } from './service-redraw.mts';

const { check, after, afterText } = compareRedraw({
  page: agencies,
  redrawn: AgenciesPage,
  template: ServicePage,
  highlightIcons: [Layers, Wallet, FileSpreadsheet, Building2],
  path: '/link-building-agencies',
  breadcrumbLabel: 'For agencies',
  counts: { highlights: 4, bodySections: 4, faqs: 4, related: 4 },
  furniture: [
    ...MARKETPLACE_FILTERS,
    'Unlock the Marketplace',
    'Create a free account to browse publishers and pricing.',
    'Website names are not shown to signed-out visitors.',
  ],
});

const { yes, is } = check;
const lower = afterText.toLowerCase();

/* ---------------------------------------------------------------- sources */

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

/**
 * Every route on the site that has a page, as a URL.
 *
 * Walked off disk rather than written down, because the claim being made is
 * that a capability the page advertises is reachable - and a list of routes
 * typed into a suite stops being that the first time somebody moves one.
 * Route groups are directories in parentheses and contribute no segment,
 * which is why `/marketplace` lives at `app/(app)/marketplace`.
 */
function routes(dir = 'src/app', prefix = ''): string[] {
  const base = new URL(`../${dir}/`, import.meta.url);
  const found: string[] = [];
  for (const entry of readdirSync(base, { withFileTypes: true })) {
    if (entry.isFile() && /^page\.(tsx|ts|jsx|js)$/.test(entry.name)) {
      found.push(prefix || '/');
      continue;
    }
    if (!entry.isDirectory() || entry.name.startsWith('_')) continue;
    const grouped = entry.name.startsWith('(') && entry.name.endsWith(')');
    found.push(...routes(join(dir, entry.name), grouped ? prefix : `${prefix}/${entry.name}`));
  }
  return found;
}

const ROUTES = new Set(routes());

/* ------------------------------------------------------------------------ */

console.log('\n== the internal links this page is read for ==');
{
  /*
    Written down rather than read out of `defaults`, for the reason the other
    suites give: everything else here reads the expectations from the content
    so an editor's change is covered without a new case, and that cuts both
    ways - delete `[articles](/content-writing)` from the copy and the loop
    that checks in-copy links has one fewer link to check and prints all
    passes. These destinations were on the page before the redraw.
  */
  for (const href of [
    '/link-building',
    '/content-writing',
    '/pricing',
    '/signup',
    '/signup?next=/marketplace',
    '/how-it-works',
  ]) {
    yes(`the page links to ${href}`, after.includes(`href="${href}"`));
  }

  /*
    And the contextual one is inside the long read, not only in the related
    cards at the foot. "Content production alongside placements" was written
    around that link; replacing a sentence's link with a card at the bottom
    of the page is the quiet version of removing it.
  */
  yes(
    'the "articles" link is inside the long read',
    /<a [^>]*href="\/content-writing"[^>]*>articles<\/a>/.test(after),
  );
}

console.log('\n== the hero campaign board ==');
{
  for (const stage of ['board', 'row', 'bar', 'badge', 'summary']) {
    yes(`the "${stage}" stage is in the markup`, after.includes(`data-pp-ag="${stage}"`));
  }
  is('five clients are on the board', CAMPAIGNS.length, 5);

  /*
    Placeholders, deliberately. A board with plausible agency names on it is
    a customer list we were not given permission to publish, and one with
    real names is worse. Asserted as a shape so that "Acme Dental" fails.
  */
  for (const row of CAMPAIGNS) {
    yes(`"${row.client}" is a placeholder name`, /^Client [A-E]$/.test(row.client));
    yes('  and is rendered', afterText.includes(row.client));
  }

  /*
    The niches and the statuses are the product's own words. The first draft
    of the component typed them in and typing them in got two wrong: a niche
    called "Ecommerce", which the marketplace cannot filter by, and a status
    called "Scheduled", which no order has ever been in. A drawing showing a
    state the software has no name for is the same error as one showing a
    feature it does not have.
  */
  const slugs = new Set(acceptedNiches.map((niche) => niche.slug));
  const labels = new Set(Object.values(orderStatusLabels));
  for (const row of CAMPAIGNS) {
    yes(`"${row.niche}" is a niche the marketplace filters by`, slugs.has(row.niche));
    yes('  drawn with that file\'s own label', afterText.includes(acceptedNicheLabel(row.niche)));
    yes(`"${row.status}" is a real order status`, row.status in orderStatusLabels);
    yes('  drawn with the queue\'s own label', afterText.includes(orderStatusLabels[row.status]));
  }
  yes(
    'and no status appears that is not one of the queue\'s',
    ['Scheduled', 'Pending', 'Complete', 'Approved'].every((invented) => !afterText.includes(invented)),
  );
  // Which is only worth asserting if the labels it is drawn from are real.
  yes('the labels checked against are the queue\'s own', labels.has('In Progress') && labels.has('Live'));

  /*
    The board adds up. A drawing whose corner total contradicts the rows
    above it is the one mistake in an illustration a reader can actually
    catch, so the sums are recomputed here rather than read back from the
    component's own constant.
  */
  const ordered = CAMPAIGNS.reduce((total, row) => total + row.ordered, 0);
  const live = CAMPAIGNS.filter((row) => row.status === 'live').reduce(
    (total, row) => total + row.done,
    0,
  );
  is('the total ordered is the sum of the rows', BOARD_TOTALS.ordered, ordered);
  is('and the live count is the sum of the live rows', BOARD_TOTALS.live, live);
  yes(`both are on the board (${ordered} ordered, ${live} live)`,
    afterText.includes(`${ordered}`) && afterText.includes(`${live} live so far`));

  // Each bar is the two figures beside it, and no row claims more live than
  // ordered.
  for (const row of CAMPAIGNS) {
    yes(
      `${row.client}'s ${row.done} of ${row.ordered} draws a bar at ${progress(row)}%`,
      row.done <= row.ordered &&
        progress(row) === Math.round((row.done / row.ordered) * 100) &&
        after.includes(`width:${progress(row)}%`),
    );
  }

  yes('the drawing is hidden from assistive technology', after.includes('aria-hidden="true"'));
  yes(
    'and its caption calls the clients and figures an example',
    afterText.includes('The clients, the figures and the arrangement are an example'),
  );
  yes(
    '  and points at the roadmap rather than past it',
    afterText.includes('per-client workspaces are on the roadmap rather than live'),
  );
}

console.log('\n== the board is CSS, so the hero does not wait for a bundle ==');
{
  /*
    The rule /content-writing's editor records from the other side: Motion is
    right when it only ever *adds* overlays to a finished drawing, because
    nothing it hides carries a word the page needs. Here the words are the
    drawing - five clients, their niches, their counts and their spend - so a
    Motion entrance renders `opacity: 0` into the server HTML, which is an
    empty hero without a bundle and an unpainted largest element for whatever
    measures LCP. (The shared harness forbids inline `opacity: 0` outright,
    which is the same assertion from the markup's end.)
  */
  for (const file of ['agency-dashboard.tsx', 'visuals.tsx', 'agencies-page.tsx']) {
    const source = read(`src/components/agencies/${file}`);
    yes(`${file} is server-rendered`, !source.includes("'use client'"));
    yes('  and draws nothing with Motion', !source.includes('motion/react'));
  }

  const css = read('src/app/globals.css');
  const stages = [...after.matchAll(/data-pp-ag="([a-z]+)"/g)].map((match) => match[1]!);
  for (const stage of new Set(stages)) {
    yes(`globals.css animates the "${stage}" stage`, css.includes(`[data-pp-ag='${stage}']`));
  }

  /*
    Every keyframe carries only a `from`. That is what makes the element's own
    style the finished board: the animation is the approach to it, `both` fill
    paints the first frame without a flash, and turning the animations off
    lands on the finished board rather than on a shorter sequence. A `to`
    block in one of these would put the finished state inside the stylesheet,
    where `animation: none` cannot reach it.
  */
  const keyframes = [...css.matchAll(/@keyframes (pp-ag-[a-z]+) \{([\s\S]*?)\n\}/g)];
  yes(`all five stages have a keyframe (${keyframes.length})`, keyframes.length === 5);
  for (const [, name, body] of keyframes) {
    yes(`${name} declares only a "from"`, /\bfrom\s*\{/.test(body!) && !/\bto\s*\{|100%\s*\{/.test(body!));
  }
  yes(
    'each stage is `both`-filled, so the first frame is painted',
    [...css.matchAll(/\[data-pp-ag='[a-z]+'\] \{([\s\S]*?)\n\}/g)].every(([, rule]) =>
      /animation:[^;]*\bboth\b/.test(rule!),
    ),
  );

  /*
    And a reader who asked for no motion gets the finished board. The stage
    rules are each one attribute selector, as is this one, so the later rule
    wins - which is the lesson the newsroom's cards taught the hard way, with
    two attribute selectors beating a media query that adds no specificity.
  */
  const reduced = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
  yes('reduced motion turns the board\'s stages off', /\[data-pp-ag\]\s*\{\s*animation: none/.test(reduced));
  yes(
    '  with no stage rule outranking it',
    !/\[data-pp-ag[^\]]*\]\[data-pp-ag/.test(css),
  );
}

console.log('\n== nothing the page\'s own answers deny is offered anywhere ==');
{
  /*
    The assertion this whole suite exists for.

    Done by measuring rather than by forbidding the words, because forbidding
    them would delete the sentences doing the honest work - the FAQ that says
    "Not yet", the section headed "What we are building next", the roadmap
    column. So: every sentence on the page that mentions one of these
    features has to be a sentence saying we do not have it.

    Two regions come out first. The questions, because a question is not a
    claim ("Can you white label reporting for clients?" is the page raising
    it, not offering it). And the one list explicitly labelled as the
    roadmap, whose items are bare noun phrases with their denial in the
    column heading above them - checked structurally just below.
  */
  const claims = after
    .replace(/<ul data-pp-roadmap="not-yet"[\s\S]*?<\/ul>/g, ' ')
    .replace(/<summary[\s\S]*?<\/summary>/g, ' ');

  const DENIED = [
    'white label',
    'white-label',
    'user seat',
    'client workspace',
    'per-client workspace',
    'client-facing reporting',
    'account manager',
    'multi-user',
    'automated reporting',
    'guaranteed turnaround',
  ];
  const DENIAL = /not yet|not currently|roadmap|rather than live|does not exist|working towards|not here yet/i;

  const sentences = readable(claims)
    .split(/(?<=[.?!])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  let mentions = 0;
  for (const term of DENIED) {
    const saying = sentences.filter((sentence) => sentence.toLowerCase().includes(term));
    mentions += saying.length;
    const offered = saying.filter((sentence) => !DENIAL.test(sentence));
    yes(
      `every mention of "${term}" denies it (${saying.length})${offered.length ? `: ${JSON.stringify(offered[0]?.slice(0, 90))}` : ''}`,
      offered.length === 0,
    );
  }
  /*
    And the page does raise them. A page that had quietly dropped the
    roadmap section would pass every assertion above by having nothing to
    check, which is the failure this one is here for.
  */
  yes(`the page does say what it does not have (${mentions} sentences)`, mentions >= 3);

  /* The roadmap list, checked as a labelled list rather than as prose. */
  const column = /<ul data-pp-roadmap="not-yet"[\s\S]*?<\/ul>/.exec(after)?.[0] ?? '';
  is('four things are listed as not yet built', NOT_YET.length, 4);
  for (const item of NOT_YET) {
    yes(`"${item}" is in the roadmap column`, readable(column).includes(item));
  }
  yes('under a heading saying so', afterText.includes('On the roadmap'));
  yes(
    'and a caption refusing to read it as a preview',
    afterText.includes('What is on the roadmap is not a preview of it. It is what does not exist yet'),
  );
  yes(
    '  with the live half beside it',
    LIVE.every((item) => readable(/<ul data-pp-roadmap="live"[\s\S]*?<\/ul>/.exec(after)?.[0] ?? '').includes(item)),
  );
  yes('and the live half is the shorter claim', NOT_YET.length < LIVE.length);
}

console.log('\n== no proof the page has not got ==');
{
  /*
    The mockup this was drawn from had "Trusted by agencies worldwide" over a
    row of six logos, and a card reading "245 links placed, +42% this
    quarter". There are no logos anybody gave us permission to show, no
    testimonials anybody wrote, and nothing on this site measures a
    percentage change - so each of those would have been invented, and an
    invented customer is worse than none.
  */
  for (const claim of [
    'trusted by',
    'testimonial',
    'our clients say',
    'case study',
    'rated',
    'award',
    'join hundreds',
    'used by',
  ]) {
    yes(`the page does not say "${claim}"`, !lower.includes(claim));
  }

  yes('no percentage anywhere in the words', !/\d\s?%/.test(afterText));
  yes('no quoted customer', !after.includes('<blockquote'));
  yes(
    'no count of agencies, clients or customers',
    !/\b\d+\+?\s+(agencies|clients|customers|users|brands)\b/i.test(afterText),
  );

  /*
    And no picture that could be a logo. One image ships on the page - the
    mascot in the shared call to action - so the count is the assertion: a
    row of six would make it seven.
  */
  const images = [...after.matchAll(/<img\b/g)].length;
  is('exactly one image on the page, the mascot', images, 1);
  yes('  which is the one the other service pages share', after.includes('parrot'));

  /*
    What stands in for the logo row instead: a list of what the software
    does, each entry naming the screen it happens on. Every one of those
    routes is on disk, which is what makes the list checkable rather than
    merely confident.
  */
  is('seven capabilities are listed', CAPABILITIES.length, 7);
  for (const item of CAPABILITIES) {
    yes(`"${item.label}" is on the page`, afterText.includes(item.label));
    yes(`  and ${item.href} is a route that exists`, ROUTES.has(item.href));
  }
  yes(
    'under a heading scoping it to today',
    afterText.includes('What an agency can do here today'),
  );
  // Only worth trusting if the walk found the site: a bug returning an empty
  // set would pass every `has` above.
  yes(`the route walk found the site (${ROUTES.size} routes)`, ROUTES.size > 20 && ROUTES.has('/link-building-agencies'));
}

console.log('\n== volume is a conversation, not a tier table ==');
{
  /*
    No Basic/Pro/Enterprise. /pricing already says what is genuinely on offer
    - preferential rates for eligible repeat buyers, custom quotes for larger
    campaigns, flexible arrangements - and the page's own FAQ says marketplace
    prices are the same for everyone. A tier table would contradict both, and
    a percentage discount would commit a number nobody has agreed.
  */
  for (const tier of [
    'enterprise',
    'pro plan',
    'basic plan',
    'starter plan',
    'per seat',
    'per month',
    '/mo',
    'minimum spend',
    'minimum order',
    'discount',
  ]) {
    yes(`the page does not offer "${tier}"`, !lower.includes(tier));
  }
  yes('and says there are no tiers', afterText.includes('No tiers and no minimum'));

  is('the volume CTA points at the enquiry form', AGENCY_PRICING_HREF, '/pricing#enquiry');
  yes('  which is in the markup', after.includes(`href="${AGENCY_PRICING_HREF}"`));
  yes('  labelled as a conversation', afterText.includes('Discuss agency pricing'));
  yes('  and nothing is charged for it', afterText.includes('No account needed, and nothing is charged.'));

  /*
    The anchor it aims at exists. A CTA to `#enquiry` on a page with no such
    id lands at the top of /pricing, which looks like it worked.
  */
  yes('/pricing carries that anchor', read('src/app/(marketing)/pricing/page.tsx').includes('id="enquiry"'));

  yes(
    'the drawing is captioned as a conversation rather than a quote',
    afterText.includes('An illustration of the conversation, not a quote.'),
  );
}

console.log('\n== buying for a client is the same four steps ==');
{
  /*
    `OrderSteps`, shared with /link-building and /niche-edits. Buying a
    placement for a client is the same thing as buying one for yourself, and
    a fourth band describing it in its own words would be a fourth
    description to keep true. /digital-pr has its own only because its copy
    says a PR campaign genuinely is not a single order - so those stages must
    not appear here.
  */
  for (const step of ORDER_STEPS) {
    yes(`"${step.label}" is one of the four steps`, afterText.includes(step.label));
  }
  const borrowed = PR_STAGES.filter((stage) => afterText.includes(stage.label));
  yes(
    `no digital PR stage appears here${borrowed.length ? `: ${JSON.stringify(borrowed.map((stage) => stage.label))}` : ''}`,
    borrowed.length === 0,
  );
}

console.log('\n== the drawings sit beside the copy, not instead of it ==');
{
  const sections = (agencies.defaults.body as { sections: { heading: string }[] }).sections;
  const headings = [...after.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map((match) =>
    readable(match[1] ?? ''),
  );

  for (const section of sections) {
    yes(`"${section.heading}" is an h2`, headings.includes(section.heading));
  }

  const positions = sections.map((section) => headings.indexOf(section.heading));
  yes(
    `the four sections are in their shipped order (${positions.join(', ')})`,
    positions.every(
      (position, index) => position >= 0 && (index === 0 || position > positions[index - 1]!),
    ),
  );

  // The problem drawing is the section's own argument - a spreadsheet and a
  // thread - rather than a picture of the product.
  yes('the spreadsheet is drawn', afterText.includes('clients-q3-final-v4.xlsx'));
  yes('and the thread beside it', afterText.includes('Re: pricing — can you confirm?'));
  yes('the content drawing names both halves', afterText.includes('Placement ordered'));
  yes('  and where they end up', afterText.includes('Tracked to a live URL'));
  /*
    And the staggered bands are marked for the reveal to arm. `Reveal`'s
    stagger needs `data-reveal-items` on the repeating group rather than on
    its wrapper, and getting that wrong is invisible: the band arrives all at
    once and looks deliberate. Three groups on this page stagger - the value
    points, the order steps and the related cards.
  */
  const groups = (after.match(/data-reveal-items=""/g) ?? []).length;
  yes(`the repeating groups are marked for the stagger (${groups})`, groups >= 3);
}

report(check);
