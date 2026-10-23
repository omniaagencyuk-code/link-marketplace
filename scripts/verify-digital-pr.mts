/**
 * Prove the /digital-pr redesign kept every word the old page had, and that
 * its drawings do not promise what its own copy refuses to.
 *
 * `service-redraw.mts` is the first half: the old `ServicePage` and the new
 * composition rendered from the same shipped content, with anything the old
 * one said that the new one does not counting as a failure. That half is the
 * same claim the other two redraws make.
 *
 * The second half is this page's own and is the reason this file is longer
 * than the other two. /link-building and /niche-edits sell something a
 * customer buys and receives. This one sells an approach to an editor who
 * does not have to publish anything, and the page's fourth section exists to
 * say so. The failure mode of a redesign here is therefore not a lost
 * paragraph - it is a drawing that promises coverage while the paragraph
 * beside it explains that coverage cannot be promised, and nothing in a type
 * system or a build catches that.
 *
 * So: no named real publication, no outcome presented as a result, no
 * guarantee anywhere in the markup, a comparison table where guest posts win
 * most of the rows, and a stage band whose third stage is an editor
 * deciding.
 *
 * No key, no database, no network, no browser.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Megaphone, Newspaper, Quote, Users } from 'lucide-react';
import * as digitalPr from '../src/lib/cms/pages/digital-pr';
import { DigitalPrPage } from '../src/components/digital-pr/digital-pr-page';
import { PR_STAGES } from '../src/components/digital-pr/pr-stages';
import { ORDER_STEPS } from '../src/components/marketing/order-steps';
import { MARKETPLACE_FILTERS } from '../src/components/marketing/marketplace-filters';
import { MarketplaceMock } from '../src/components/marketing/marketplace-mock';
import { ServicePage } from '../src/components/marketing/service-page';
import { PREVIEW_ROWS, compareRedraw, readable, report } from './service-redraw.mts';

const { check, after, afterText } = compareRedraw({
  page: digitalPr,
  redrawn: DigitalPrPage,
  template: ServicePage,
  highlightIcons: [Newspaper, Quote, Users, Megaphone],
  path: '/digital-pr',
  breadcrumbLabel: 'Digital PR',
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

console.log('\n== the internal links this page is read for ==');
{
  /*
    Written down rather than read out of `defaults`, which is the one place
    this suite does that. Everything else is read from the content so an
    editor's change is covered without adding a case - but that cuts both
    ways: delete `[guest post](/guest-posts)` from the copy and the loop that
    checks in-copy links has one fewer link to check and prints all passes.
    These destinations were on the page before the redraw.
  */
  const PINNED = ['/guest-posts', '/niche-edits', '/link-building', '/content-writing', '/link-building-agencies'];
  for (const href of PINNED) {
    yes(`the page links to ${href}`, after.includes(`href="${href}"`));
  }

  // The two contextual ones are inside the long read, not only in the
  // related cards at the foot - those are the links the sections were
  // written around.
  yes(
    'the "guest post" link is inside the long read',
    /<a [^>]*href="\/guest-posts"[^>]*>guest post<\/a>/.test(after),
  );
  yes(
    'the "niche edits" link is inside the long read',
    /<a [^>]*href="\/niche-edits"[^>]*>niche edits<\/a>/.test(after),
  );
}

console.log('\n== the hero newsroom ==');
{
  yes('the front page is in the markup', after.includes('data-pp-dpr="paper"'));
  is('with three pieces of coverage around it', (after.match(/data-pp-dpr="card"/g) ?? []).length, 3);
  for (const stage of ['one', 'two', 'three']) {
    yes(`  arriving at stage "${stage}"`, after.includes(`data-pp-dpr-stage="${stage}"`));
  }

  /*
    All of it server-rendered, because the stages are CSS with `both` fill
    and nothing waits for a bundle. If the masthead is not in the HTML there
    is nothing for the stylesheet to animate.
  */
  yes('the masthead is rendered', afterText.includes('The Daily Squawk'));
  yes('and so is the front-page headline', afterText.includes('New research highlights key industry trends'));

  yes('the drawing is hidden from assistive technology', after.includes('aria-hidden="true"'));
  yes(
    'and its caption says the publications are invented',
    afterText.includes('The publications and headlines are invented for the drawing'),
  );
  yes(
    'and that no placement is guaranteed',
    afterText.includes('this page does not show real coverage, and no placement is guaranteed'),
  );
}

console.log('\n== nothing on the page names a real publication ==');
{
  /*
    The drawings need mastheads, and a masthead a reader recognises is this
    page claiming coverage it has not got. Every name used is invented, and
    they are listed here so that adding a real one fails rather than shipping.

    Checked as the inverse too: a handful of the titles a UK SEO page would
    reach for first. Not a complete list of the world's publications - no
    such check is possible - but it catches the reach that would actually
    happen.
  */
  const INVENTED = [
    'The Daily Squawk',
    'Tech Insight',
    'The Finance Post',
    'Lifestyle Daily',
    'The Business Post',
  ];
  for (const name of INVENTED) {
    yes(`"${name}" is one of the invented mastheads`, afterText.includes(name));
  }

  const REAL = [
    'forbes', 'techcrunch', 'the guardian', 'bbc', 'the times', 'telegraph',
    'wired', 'bloomberg', 'reuters', 'entrepreneur', 'business insider',
    'huffpost', 'mashable', 'the sun', 'daily mail',
  ];
  const named = REAL.filter((name) => lower.includes(name));
  yes(
    `no real publication is named${named.length ? `: ${JSON.stringify(named)}` : ''}`,
    named.length === 0,
  );

  // And no domain, for the same reason /niche-edits checks it: a drawing
  // with a domain in it reads as inventory.
  const domains = [...afterText.matchAll(/\b[a-z0-9-]+\.(?:com|co\.uk|net|org|io|de)\b/gi)].map(
    (match) => match[0],
  );
  const allowed = new Set(PREVIEW_ROWS.map((row) => row.maskedDomain));
  const invented = domains.filter((domain) => !allowed.has(domain));
  yes(
    `no domain is named anywhere on the page${invented.length ? `: ${JSON.stringify(invented)}` : ''}`,
    invented.length === 0,
  );
}

console.log('\n== the page never promises coverage ==');
{
  /*
    The sentence this whole page is arranged around is in its fourth
    section: an editor does not have to publish anything. These are the
    phrases that would contradict it. "Guaranteed" is checked as a word
    rather than a phrase because every form of it is wrong here, except the
    two places the page uses it to say the opposite.
  */
  for (const claim of [
    'guaranteed coverage',
    'guaranteed placement',
    'we guarantee',
    'guaranteed results',
    'guaranteed rankings',
    'ranking increase',
    'as featured in',
    'our clients have been featured',
  ]) {
    yes(`the page does not say "${claim}"`, !lower.includes(claim));
  }

  /*
    Every use of "guarantee" on the page is a denial. Asserted by counting
    rather than by forbidding the word, because forbidding it would delete
    the sentences that do the honest work.
  */
  const uses = [...afterText.matchAll(/[^.]*guarantee[^.]*\./gi)].map((match) => match[0].trim());
  const denials = uses.filter((sentence) =>
    /\b(never|not|no placement|cannot)\b/i.test(sentence),
  );
  is(
    `all ${uses.length} mentions of a guarantee are denials of one`,
    denials.length,
    uses.length,
  );
  yes('and there is at least one', uses.length > 0);
}

console.log('\n== the drawings are captioned as drawings ==');
{
  for (const caption of [
    'The publications and headlines are invented for the drawing',
    'The publications and the story are invented for the drawing.',
    'It is not a list of outcomes we promise.',
    'An illustration of how a campaign tends to go, not a success rate.',
  ]) {
    yes(`"${caption.slice(0, 48)}…" is on the page`, afterText.includes(caption));
  }

  /*
    The expectations drawing shows a campaign where two approaches land and
    two do not, which is the only drawing on any of the three redrawn pages
    whose subject is the thing not working. A page selling editorial coverage
    with no picture of that is one a customer reads once.
  */
  for (const outcome of ['Picked up', 'Read, not used', 'No reply']) {
    yes(`  the campaign drawing shows "${outcome}"`, afterText.includes(outcome));
  }
}

console.log('\n== digital PR beside guest posts ==');
{
  const ROWS: [string, string, string][] = [
    ['Who decides', 'An editor, who need not publish', 'The site, from a slot it offers'],
    ['Control of the piece', 'The publication frames it', 'You commission and control it'],
    ['Needs a newsworthy angle', 'Yes — data, expertise, a story', 'No'],
    ['Turnaround', 'Longer, and less certain', 'Shown on the listing'],
    ['Certainty of publication', 'Never guaranteed', 'The placement is what you buy'],
    ['Brand visibility', 'The readership matters as much as the link', 'Mostly the link'],
    ['Harder to replicate', 'Not available on demand', 'A competitor can buy the same slot'],
    ['Pricing', 'Per placement; campaigns quoted', 'Per placement, shown upfront'],
  ];

  for (const [label, pr, guest] of ROWS) {
    yes(`"${label}" compares both`, afterText.includes(pr) && afterText.includes(guest));
  }

  /*
    The assertion this table exists for. The section it sits under says a
    guest post is the better choice when the story is not there, so a table
    where digital PR wins every row would contradict the paragraph above it.
    Counted from the markup: the guest-post column carries more ticks than
    the digital PR column.
  */
  const rows = [...after.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((match) => match[1]!);
  let prWins = 0;
  let guestWins = 0;
  for (const row of rows) {
    const cells = [...row.matchAll(/<td[\s\S]*?<\/td>/g)].map((match) => match[0]);
    if (cells.length !== 2) continue;
    // lucide's Check renders a polyline; X renders two crossing lines.
    const ticked = (cell: string) => cell.includes('text-accent-600');
    if (ticked(cells[0]!)) prWins += 1;
    if (ticked(cells[1]!)) guestWins += 1;
  }
  yes(
    `guest posts win more rows than digital PR (${guestWins} to ${prWins}), as the copy says`,
    guestWins > prWins,
  );
  yes('and digital PR wins some of them', prWins > 0);

  // A real table rather than a grid of divs, so it can be read.
  yes('it is a table', after.includes('<table'));
  yes('with row headers', after.includes('scope="row"'));
  yes('and column headers', after.includes('scope="col"'));
  yes(
    'and a caption saying neither wins outright',
    afterText.includes('Neither is better in every row.'),
  );
}

console.log('\n== the four stages are a campaign, not the order flow ==');
{
  is('four stages ship', PR_STAGES.length, 4);
  for (const [index, stage] of PR_STAGES.entries()) {
    yes(`stage ${index + 1} is "${stage.label}"`, after.includes(stage.label));
    yes('  with its explanation', afterText.includes(stage.body.replace(/\s+/g, ' ')));
  }
  yes('and they are numbered as stages', after.includes('Stage 1') && after.includes('Stage 4'));

  /*
    Not the marketplace's four. /link-building and /niche-edits both draw
    `OrderSteps` - filter, choose, order, track to a live URL - which is how
    you buy a placement. This page's own copy says digital PR is "a campaign
    rather than a single order", so drawing those four here would be the
    page contradicting its own paragraph.
  */
  const borrowed = ORDER_STEPS.filter((step) => after.includes(step.label));
  yes(
    `none of the marketplace's order steps appears here${borrowed.length ? `: ${JSON.stringify(borrowed.map((step) => step.label))}` : ''}`,
    borrowed.length === 0,
  );

  /*
    And the third stage belongs to somebody else. A four-step diagram whose
    third box says "Get published" is a pipeline that ends in coverage; this
    one says an editor decides, and the caption above the band says so too.
  */
  yes('the third stage is the editor deciding', PR_STAGES[2]!.label === 'Editorial consideration');
  yes('  and says some approaches are not used', afterText.includes('some are read and not used'));
  yes(
    'the band is captioned "publication is never guaranteed"',
    afterText.includes('publication is never guaranteed'),
  );
}

console.log('\n== the marketplace preview says what each row is for sale as ==');
{
  /*
    The listings are a mixture of guest posts, niche edits and digital PR,
    and this page is about one of the three. An unlabelled table under a
    heading about publications reads as a list of digital PR opportunities,
    which most of the inventory is not - so this page, alone, prints the
    link type on each row.
  */
  yes('the guest-post row says so', afterText.includes('Guest Post'));
  yes('and the niche-edit row says so', afterText.includes('Niche Edit'));

  /*
    Where a listing sells more than one thing, the badge names the digital
    PR. Checked by rendering a row that offers both: the column is only
    drawn on this page, and naming the guest post on a listing that also
    sells the thing the reader came for would hide the answer. A listing
    without it still says what it is, which the two rows above cover.
  */
  const both = renderToStaticMarkup(
    createElement(MarketplaceMock, {
      rows: [{ ...PREVIEW_ROWS[0]!, linkTypes: ['guest-post', 'digital-pr'] }],
      showLinkTypes: true,
    }),
  );
  yes('a listing that sells both is named as digital PR', both.includes('Digital PR'));
  yes('  with the other type counted rather than named', both.includes('+1'));
  yes(
    '  and a guest-post-only listing is still named a guest post',
    renderToStaticMarkup(
      createElement(MarketplaceMock, { rows: [PREVIEW_ROWS[0]!], showLinkTypes: true }),
    ).includes('Guest Post'),
  );

  // Still redacted: this page shows no more of the inventory than the others.
  for (const row of PREVIEW_ROWS) {
    yes(`${row.maskedDomain} is still masked`, after.includes(row.maskedDomain));
  }
  yes(
    'and the note explaining why is still there',
    afterText.includes('Website names are not shown to signed-out visitors.'),
  );
}

console.log('\n== the drawing is beside the copy, not instead of it ==');
{
  const sections = (digitalPr.defaults.body as { sections: { heading: string }[] }).sections;
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

  // The connector between the stages is armed by `Reveal` rather than
  // arriving drawn, and declares its own length to count down from.
  yes('the stage connector declares its length', after.includes('--pp-draw-length'));
  yes('and is marked for the reveal to arm', after.includes('data-pp-draw'));
  yes('the brand mention is marked for its highlight', after.includes('data-pp-highlight'));
}

report(check);
