/**
 * Prove the /niche-edits redesign kept every word the old page had, and that
 * its illustrations do not claim anything the page cannot stand behind.
 *
 * The page was redrawn, not rewritten. `service-redraw.mts` is the
 * comparison - the old `ServicePage` and the new composition rendered from
 * the same shipped content, and anything the old one said that the new one
 * does not is a failure. What is here is what is particular to this page:
 * the article demonstration in the hero and the four drawings beside the
 * long read.
 *
 * Those drawings are the part worth being exhaustive about. The page's whole
 * subject is a link added to somebody else's article, so the natural
 * illustration is a real publisher's page with real metrics beside it - and
 * that would be showing inventory nobody gave us permission to show, with
 * figures nobody measured. Every assertion below about the article, the
 * metrics and the comparison table is there to keep the drawings obviously
 * examples.
 *
 * No key, no database, no network, no browser.
 */
import { History, Link2, Timer, TrendingUp } from 'lucide-react';
import * as nicheEdits from '../src/lib/cms/pages/niche-edits';
import { NicheEditsPage } from '../src/components/niche-edits/niche-edits-page';
import { ORDER_STEPS } from '../src/components/marketing/order-steps';
import { ServicePage } from '../src/components/marketing/service-page';
import { compareRedraw, readable, report } from './service-redraw.mts';

const { check, after, afterText } = compareRedraw({
  page: nicheEdits,
  redrawn: NicheEditsPage,
  template: ServicePage,
  highlightIcons: [Timer, History, Link2, TrendingUp],
  path: '/niche-edits',
  breadcrumbLabel: 'Niche edits',
  counts: { highlights: 4, bodySections: 4, faqs: 4, related: 4 },
  furniture: [
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
  ],
});

const { yes, is } = check;

console.log('\n== the order flow is the shared one, not a second wording ==');
{
  /*
    Read out of the shared module rather than written down, so what this
    catches is the band going missing or the page growing its own second set
    of labels - the first draft of this page had exactly that, four steps
    describing the same flow in different words. A deliberate relabel in the
    module passes, which is right: there is one copy of those words and that
    is where they live.
  */
  for (const [index, step] of ORDER_STEPS.entries()) {
    yes(`step ${index + 1} is "${step.label}"`, after.includes(step.label));
  }
  is('four of them', ORDER_STEPS.length, 4);
  yes('and they are numbered', after.includes('Step 1') && after.includes('Step 4'));
}

console.log('\n== the internal links this page is read for ==');
{
  /*
    Written down rather than read out of `defaults`, which is the one place
    this suite does that and needs the reason stated.

    Everything else is read from the content so an editor's change is covered
    without anybody adding a case. But that cuts both ways: delete the
    `[guest post](/guest-posts)` link from the copy and the loop that checks
    in-copy links simply has one fewer link to check, and prints all passes.
    These three destinations were on the page before the redraw and are why
    other pages rank, so they are pinned here as facts about the page rather
    than as a reflection of whatever the copy currently says.
  */
  const PINNED: [string, string][] = [
    ['/guest-posts', 'guest post'],
    ['/link-building', 'Link building'],
    ['/pricing', 'See pricing'],
  ];

  for (const [href, anchor] of PINNED) {
    yes(`the page links to ${href}`, after.includes(`href="${href}"`));
    yes(`  with "${anchor}" as anchor text somewhere on it`, afterText.includes(anchor));
  }

  // And the contextual one is in the body copy, not only in the related
  // links at the foot - that is the link the section was written around.
  yes(
    'the "guest post" link is inside the long read',
    /<a [^>]*href="\/guest-posts"[^>]*>guest post<\/a>/.test(after),
  );
}

console.log('\n== the article demonstration ==');
{
  /*
    The five stages, each one an element the stylesheet animates. Asserted by
    the attribute rather than by the animation, because what this suite can
    see is the markup: if the element is not here there is nothing for
    `globals.css` to animate, and the hero's whole argument is missing.
  */
  for (const stage of ['anchor', 'toast', 'metrics', 'checks']) {
    yes(`the "${stage}" stage is in the markup`, after.includes(`data-pp-ne="${stage}"`));
  }

  /*
    And it is all there from the first byte. The stages are CSS animations
    with `both` fill, so nothing waits for a bundle - which means the anchor
    phrase, the confirmation and the figures are in the server-rendered HTML
    and a reader whose JavaScript never arrives sees the finished
    illustration rather than an empty frame.
  */
  /*
    Inside the anchor, not merely somewhere on the page: the same phrase is
    in two of the drawings below, so `afterText.includes` passed with the
    hero's anchor emptied out.
  */
  yes(
    'the anchor phrase is inside the anchor',
    /data-pp-ne="anchor"[^>]*>resistance bands</.test(after),
  );
  yes('the confirmation is rendered', afterText.includes('Link inserted'));
  yes('the sentence around it is rendered', afterText.includes('Many people now choose'));

  /*
    It is a drawing, so it is hidden from assistive technology and captioned
    instead - a screen reader reading an invented article is being given work
    rather than information.
  */
  yes(
    'the illustration is hidden from assistive technology',
    after.includes('aria-hidden="true"'),
  );
  yes(
    'and the caption says the article is an example',
    afterText.includes('The article and its figures are an example, not a listing.'),
  );

  /*
    The one thing the drawing must not do: look like a listing. No domain, no
    publisher name, no price. The article is obviously invented - a home
    workouts piece - and that is the point.
  */
  const INVENTED_AS_REAL = /\b[a-z0-9-]+\.(?:com|co\.uk|net|org|io)\b/gi;
  const domains = [...afterText.matchAll(INVENTED_AS_REAL)].map((match) => match[0]);
  const allowed = new Set(['••••••••.com', '••••••.co.uk']);
  const invented = domains.filter((domain) => !allowed.has(domain));
  yes(
    `no domain is named anywhere on the page${invented.length ? `: ${JSON.stringify(invented)}` : ''}`,
    invented.length === 0,
  );
}

console.log('\n== the figures beside it are labelled as examples ==');
{
  /*
    Three numbers appear twice on the page - in the hero's metrics card and
    in the drawing beside "What to check before buying one". Both are
    captioned, and the assertion is the caption rather than the numbers: a
    figure presented as a measurement is a claim about a publisher's site.
  */
  yes(
    'the host-page drawing says its values are an example',
    afterText.includes('The values are an example, not a publisher'),
  );

  // Nothing on the page says a link has been checked, confirmed or
  // guaranteed. The marketplace does monitor placements, but this page does
  // not say so and a drawing implying it would be the claim /link-building's
  // guarantee panel exists to make properly.
  for (const claim of ['guaranteed', 'verified', 'we confirmed', 'ranking increase']) {
    yes(`the page does not say "${claim}"`, !afterText.toLowerCase().includes(claim));
  }
}

console.log('\n== niche edits beside guest posts ==');
{
  /*
    The comparison table restates the section it sits under rather than
    introducing a claim. Each row's wording is checked here so that adding a
    row saying something the copy does not say fails - which is the only way
    a table like this goes wrong.
  */
  const ROWS = [
    ['The article', 'Already published', 'Written for the placement'],
    ['The page carrying it', 'Already indexed', 'Starts from new'],
    ['Turnaround', 'Usually shorter', 'Includes writing and approval'],
    ['Control of the piece', 'The sentence already exists', 'You shape the whole article'],
    ['Anchor', 'Has to fit the sentence', 'Written alongside the copy'],
    ['Price', 'Often lower, per listing', 'Includes the article'],
  ];

  for (const [label, edit, post] of ROWS) {
    yes(`"${label}" compares both`, afterText.includes(edit!) && afterText.includes(post!));
  }

  /*
    The price row carries the FAQ's qualifier. The FAQ says niche edits are
    *often* cheaper and that it depends on the publisher; a table row reading
    "Cheaper" would be the same sentence with the hedge removed, which is how
    a page ends up making a promise its own FAQ contradicts.
  */
  yes('the price row is hedged the way the FAQ is', afterText.includes('Often lower, per listing'));
  yes('and never says simply "cheaper"', !/>\s*Cheaper\s*</.test(after));

  // A real table, with a caption, so it is readable rather than a grid of
  // divs a screen reader walks without knowing which column is which.
  yes('it is a table', after.includes('<table'));
  yes('with row headers', after.includes('scope="row"'));
  yes('and column headers', after.includes('scope="col"'));
  yes(
    'and a caption naming where it came from',
    afterText.includes('How niche edits and guest posts differ, drawn from the section above.'),
  );
}

console.log('\n== the drawing is beside the copy, not instead of it ==');
{
  /*
    Four body sections, four drawings, in the same order. The risk in giving
    each section its own illustration is that the illustration replaces the
    words - so this checks the heading and the drawing beside it are the same
    subject, by position, and that all four headings are still h2s.
  */
  const sections = (nicheEdits.defaults.body as { sections: { heading: string }[] }).sections;
  const headings = [...after.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map((match) =>
    readable(match[1] ?? ''),
  );

  for (const section of sections) {
    yes(`"${section.heading}" is an h2`, headings.includes(section.heading));
  }

  // In the order they ship, which is the order the drawings assume.
  const positions = sections.map((section) => headings.indexOf(section.heading));
  yes(
    `the four sections are in their shipped order (${positions.join(', ')})`,
    positions.every((position, index) => position >= 0 && (index === 0 || position > positions[index - 1]!)),
  );

  // The trend line is armed by `Reveal`, so it must not arrive drawn: the
  // dash offset is set in CSS and the animation runs when the section is
  // reached. What the markup carries is the path's own length.
  yes('the trend line declares its length', after.includes('--pp-draw-length'));
  yes('and is marked for the reveal to arm', after.includes('data-pp-draw'));
}

report(check);
