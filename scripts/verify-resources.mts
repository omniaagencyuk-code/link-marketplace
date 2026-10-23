/**
 * The resources index: what it finds, what it shows, and what it declares.
 *
 * This page is not like the four service pages redrawn before it. There is
 * no CMS copy behind it, so there is no "did every paragraph survive" to
 * check. What it draws is articles, and what can go wrong is therefore
 * different and worse: a filter that quietly drops a post, a page two that
 * repeats page one, a count that is of the wrong thing, or a canonical tag
 * that tells a crawler nineteen articles are really one page.
 *
 * So three things are checked here.
 *
 * **The listing rule**, directly: `src/lib/blog/listing.ts` is the one copy
 * of what a search matches and which posts are on a page, applied by the
 * in-memory store and translated into PostgREST by `cms-repository`. Only
 * the first of those runs from a clone, which is the same limitation
 * `verify:planner` records about its filter - so every predicate is the
 * simplest shape that translates one-to-one, and the arithmetic is asserted
 * exhaustively here because a half-open interval off by one loses a post
 * between pages and nothing says so.
 *
 * **The page**, rendered: that every post handed to it is drawn, that its
 * links point at the articles, that the counts are of published posts and
 * not of the page, and that the empty state says something useful.
 *
 * **What it declares**: the canonical for each view, and that a search is
 * not offered to an index.
 *
 * No key, no database, no network, no browser.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import {
  PER_PAGE,
  applyListing,
  isIndexableView,
  listingHref,
  matchesSearch,
  offsetFor,
  pageCountFor,
  readPage,
  readSearch,
  searchableText,
} from '../src/lib/blog/listing';
import { ResourcesPage, pickFeatured, resultsHeading } from '../src/components/resources/resources-page';
import { pageNumbers } from '../src/components/resources/pager';
import { postCategories } from '../src/lib/config/blog';
import { blogSectionDefaults } from '../src/lib/config/blog-sections';
import { checker, readable, report } from './service-redraw.mts';
import type { BlogPost, PostCategorySlug } from '../src/lib/types/blog';

const check = checker();
const { yes, is, bad, ok } = check;

/* ------------------------------------------------------------- fixtures */

function post(
  index: number,
  category: PostCategorySlug,
  title: string,
  extra: Partial<BlogPost> = {},
): BlogPost {
  const day = String(index + 1).padStart(2, '0');
  return {
    id: `post_${index}`,
    slug: `post-${index}`,
    title,
    excerpt: `An excerpt for ${title.toLowerCase()}.`,
    body: 'word '.repeat(400),
    category,
    status: 'published',
    author: 'The Press Parrot team',
    publishedAt: `2026-01-${day}T09:00:00.000Z`,
    createdAt: `2026-01-${day}T09:00:00.000Z`,
    updatedAt: `2026-01-${day}T09:00:00.000Z`,
    sections: blogSectionDefaults,
    ...extra,
  };
}

/* Twenty-three, so there are three pages of nine and a short last one. */
const CATEGORIES: PostCategorySlug[] = [
  'link-building',
  'seo',
  'content',
  'digital-pr',
  'agency-growth',
];
const POSTS: BlogPost[] = Array.from({ length: 23 }, (_, index) =>
  post(
    index,
    CATEGORIES[index % CATEGORIES.length]!,
    /*
      One title long enough to be worth cutting. A fixture of short titles
      cannot tell a card that prints them whole from a card that truncates
      at twenty characters, and truncation is the thing being ruled out.
    */
    /* Near the end of the range, which after the reverse below is near the
       top - so the long title is on page one, where the grid is rendered. */
    index === 20
      ? 'How to build a link plan that survives a core update, and what to do when it does not'
      : `Guide number ${index}`,
  ),
)
  .reverse(); // newest first, the order the service hands them over in

/* ---------------------------------------------------------- the rule */

console.log('\n== what a search looks at ==');
{
  const subject = post(1, 'digital-pr', 'Earning coverage', {
    excerpt: 'How a newsroom decides.',
    body: 'A rare word: zebra, mentioned once in passing.',
  });

  yes('the title is searched', matchesSearch(subject, 'earning'));
  yes('and case does not matter', matchesSearch(subject, 'EARNING'));
  yes('the excerpt is searched', matchesSearch(subject, 'newsroom'));
  yes("the category's display name is searched", matchesSearch(subject, 'digital pr'));
  yes('  which is how somebody asks for a filter without knowing it is one', matchesSearch(subject, 'Digital PR'));

  /*
    The body is deliberately not searched. A word mentioned once in passing
    would rank beside the article actually about the subject, and on the
    database side it means scanning every article's markdown on a keystroke.
  */
  yes('the body is not searched', !matchesSearch(subject, 'zebra'));
  yes('  and the searchable text says so', !searchableText(subject).includes('zebra'));

  // Whitespace is not a search.
  is('a blank term is no term', readSearch('   '), undefined);
  is('and a term is trimmed', readSearch('  links  '), 'links');
}

console.log('\n== which page a reader is on ==');
{
  is('no page is page one', readPage(undefined), 1);
  is('a word is page one', readPage('nonsense'), 1);
  is('zero is page one', readPage('0'), 1);
  is('a negative is page one', readPage('-4'), 1);
  is('and a number is itself', readPage('7'), 7);

  is(`${PER_PAGE} posts is one page`, pageCountFor(PER_PAGE), 1);
  is(`${PER_PAGE + 1} posts is two`, pageCountFor(PER_PAGE + 1), 2);
  /*
    Nothing is still one page, not none: a reader whose search matched
    nothing is on page one of one, and a pager with zero pages has nowhere
    to put them.
  */
  is('and nothing is one page, not none', pageCountFor(0), 1);

  is('page one starts at nought', offsetFor(1, 23), 0);
  is('page two starts after the first page', offsetFor(2, 23), PER_PAGE);
  // A page past the end is the last page, not an empty grid.
  is('page nine of three is the third', offsetFor(9, 23), PER_PAGE * 2);
}

console.log('\n== every post is on exactly one page ==');
{
  /*
    The assertion the whole pager rests on. Walk every page of the archive,
    collect what each one showed, and compare the result with the archive
    itself - in order. An off-by-one in the slice loses a post between pages
    two and three, and no page looks wrong on its own.
  */
  const pageCount = pageCountFor(POSTS.length);
  const seen: BlogPost[] = [];
  for (let page = 1; page <= pageCount; page += 1) {
    seen.push(...applyListing(POSTS, { page }).posts);
  }

  is(`${POSTS.length} posts across ${pageCount} pages`, seen.length, POSTS.length);
  const ids = seen.map((entry) => entry.id);
  is('with none repeated', new Set(ids).size, ids.length);
  yes(
    'and in the order the archive is in',
    ids.join() === POSTS.map((entry) => entry.id).join(),
  );

  const last = applyListing(POSTS, { page: pageCount });
  is('the last page holds the remainder', last.posts.length, POSTS.length % PER_PAGE);

  /*
    And a page number past the end is the last page rather than an empty
    grid. A reader arrives on page nine from a stale link, or from a search
    that used to have more results than it does now; what they should get is
    articles.
  */
  const past = applyListing(POSTS, { page: 99 });
  is('page ninety-nine of three is the third', past.page, pageCount);
  is('  with posts on it', past.posts.length, POSTS.length % PER_PAGE);
  yes('  the same ones the last page has', past.posts[0]?.id === last.posts[0]?.id);
}

console.log('\n== a filter and a search together ==');
{
  const category: PostCategorySlug = 'seo';
  const inCategory = POSTS.filter((entry) => entry.category === category);

  const filtered = applyListing(POSTS, { category });
  is('the total is the category, not the archive', filtered.total, inCategory.length);
  yes(
    'and every post shown is in it',
    filtered.posts.every((entry) => entry.category === category),
  );

  /*
    Both at once, which is the combination most likely to be wrong: it is
    easy to write a filter that searches the category's posts and a search
    that ignores the category.
  */
  const both = applyListing(POSTS, { category, search: 'Guide number 1' });
  yes(
    'a search inside a category stays inside it',
    both.posts.every((entry) => entry.category === category),
  );
  yes(
    '  and still matches',
    both.posts.every((entry) => matchesSearch(entry, 'guide number 1')),
  );
  is(
    '  with the total counted the same way',
    both.total,
    inCategory.filter((entry) => matchesSearch(entry, 'guide number 1')).length,
  );

  const nothing = applyListing(POSTS, { search: 'xyzzy' });
  is('a search that matches nothing has no posts', nothing.posts.length, 0);
  is('  a total of nothing', nothing.total, 0);
  is('  and is still page one of one', nothing.pageCount, 1);
}

/* --------------------------------------------------------- the addresses */

console.log('\n== what a view is called ==');
{
  is('the index is /resources', listingHref({}), '/resources');
  is('a category carries its slug', listingHref({ category: 'seo' }), '/resources?category=seo');
  is('a search carries the term', listingHref({ search: 'links' }), '/resources?q=links');
  is(
    'and the two together carry both',
    listingHref({ category: 'seo', search: 'links' }),
    '/resources?category=seo&q=links',
  );

  /*
    Page one never says so. /resources and /resources?page=1 would otherwise
    be two addresses for one page, which is the duplicate a canonical is
    supposed to resolve rather than create.
  */
  is('page one is left unsaid', listingHref({ page: 1 }), '/resources');
  is('page two is said', listingHref({ page: 2 }), '/resources?page=2');
  is(
    'and a page of a category keeps both',
    listingHref({ category: 'content', page: 3 }),
    '/resources?category=content&page=3',
  );

  // A blank search is not a search, so it is not in the URL either.
  is('a blank search leaves no trace', listingHref({ search: '  ' }), '/resources');
}

console.log('\n== what is offered to an index ==');
{
  yes('the index is indexable', isIndexableView({}));
  yes('a category is a real section', isIndexableView({ category: 'seo' }));
  yes('and so is a page of one', isIndexableView({ category: 'seo', page: 2 }));

  /*
    A search is not. Every term a reader types makes a URL and none of them
    is a page anybody wrote; indexing them is how a site grows a thousand
    thin archive pages that compete with the articles themselves.
  */
  yes('a search is not', !isIndexableView({ search: 'links' }));
  yes('nor a search inside a category', !isIndexableView({ category: 'seo', search: 'links' }));
}

console.log('\n== the pager prints a sensible run of numbers ==');
{
  is('three pages print all three', pageNumbers(2, 3).join(), '1,2,3');
  yes('forty pages do not print forty', pageNumbers(20, 40).length < 10);
  yes('  and say where the gaps are', pageNumbers(20, 40).includes(null));
  yes('the first and last are always offered', (() => {
    const run = pageNumbers(20, 40);
    return run[0] === 1 && run[run.length - 1] === 40;
  })());
  yes('the current page is in it', pageNumbers(20, 40).includes(20));
  yes('with its neighbours', pageNumbers(20, 40).includes(19) && pageNumbers(20, 40).includes(21));
  // Nothing elided between consecutive numbers.
  yes(
    'and no ellipsis stands between two adjacent pages',
    pageNumbers(2, 4).every((entry, index, run) => {
      if (entry !== null) return true;
      const before = run[index - 1];
      const after = run[index + 1];
      return typeof before === 'number' && typeof after === 'number' && after - before > 1;
    }),
  );
}

console.log('\n== which article leads ==');
{
  /*
    There is no `featured` flag on a post, so the lead is a rule rather than
    a slug: the newest with a cover image, and the newest of any kind when
    none has one. A slug typed into the page is a slug that keeps pointing
    at an article somebody later unpublishes.
  */
  const none = POSTS;
  is('with no cover images, the newest leads', pickFeatured(none)?.id, none[0]?.id);

  const withCover = [
    none[0]!,
    { ...none[1]!, coverImage: { src: '/a.jpg', alt: 'A' } },
    none[2]!,
  ];
  is('a cover image wins over being newest', pickFeatured(withCover)?.id, none[1]?.id);
  is('and an empty archive leads with nothing', pickFeatured([]), undefined);
}

console.log('\n== what the grid is called ==');
{
  is('the index', resultsHeading({}), 'Latest articles');
  is('a category', resultsHeading({ category: 'agency-growth' }), 'Agency Growth');
  is('a search says what was searched', resultsHeading({ search: 'links' }), 'Results for “links”');
  is(
    'and a search inside a category is still the search',
    resultsHeading({ category: 'seo', search: 'links' }),
    'Results for “links”',
  );
}

/* --------------------------------------------------------- the rendering */

const COUNTS = Object.fromEntries(
  postCategories.map((entry) => [
    entry.slug,
    POSTS.filter((candidate) => candidate.category === entry.slug).length,
  ]),
);

/*
  The search box is a client component and calls `useRouter`, which throws
  without an app router above it. Rendering the page on a server is exactly
  the situation Next is in on the first paint, so the stub here is what that
  moment looks like: a router whose methods are never called, because
  nothing has been typed yet.

  Stubbed rather than stripped out. The form, its field and the pills are
  part of what this suite checks, and a page rendered without them would
  pass every assertion about a search box that was not there.
*/
const STILL_ROUTER = {
  push: () => {},
  replace: () => {},
  refresh: () => {},
  back: () => {},
  forward: () => {},
  prefetch: () => {},
} as never;

function render(options: Partial<Parameters<typeof ResourcesPage>[0]> = {}) {
  const result = applyListing(POSTS, options.query ?? {});
  return renderToStaticMarkup(
    createElement(
      AppRouterContext.Provider,
      { value: STILL_ROUTER },
    createElement(ResourcesPage, {
      posts: result.posts,
      featured: pickFeatured(result.posts),
      total: result.total,
      page: result.page,
      pageCount: result.pageCount,
      counts: COUNTS,
      query: {},
      heading: 'Link building, without the folklore',
      intro: 'Practical guides on link building, SEO, content and digital PR.',
      ...options,
    } as never),
    ),
  );
}

const page1 = render();
const page1Text = readable(page1);

console.log('\n== the page draws what it was given ==');
{
  const shown = applyListing(POSTS, {}).posts;
  const missing = shown.filter((entry) => !page1Text.includes(entry.title));
  for (const entry of missing) bad('  a post was not drawn', entry.title);
  if (missing.length === 0) ok(`all ${shown.length} posts on the page are drawn`);

  // Every one of them links to its article.
  const unlinked = shown.filter((entry) => !page1.includes(`href="/resources/${entry.slug}"`));
  for (const entry of unlinked) bad('  a post was drawn without a link', entry.slug);
  if (unlinked.length === 0) ok('and every one links to its article');

  /*
    Whole, and in the link: a card that shortens a title or an excerpt is
    showing something its author did not write, and a title cut mid-phrase
    can say the opposite of what it said.

    Read out of the anchor rather than looked for anywhere on the page - the
    longest title here appears nowhere else, but a short one would also
    match the page's own prose.
  */
  const linked = [...page1.matchAll(/<a\b[^>]*href="\/resources\/([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map(
    (match) => ({ slug: match[1]!, text: readable(match[2] ?? '') }),
  );
  const cut = shown.filter((entry) => {
    const anchor = linked.find((candidate) => candidate.slug === entry.slug);
    return !anchor || anchor.text !== entry.title;
  });
  for (const entry of cut) bad('  a title was not printed whole', entry.title.slice(0, 60));
  if (cut.length === 0) ok('each title is printed whole, in its own link');

  yes(
    'and every excerpt unshortened',
    shown.every((entry) => page1Text.includes(entry.excerpt)),
  );

  yes('the heading is the page title', page1.includes('Link building, without the folklore'));
  is('and there is exactly one h1', (page1.match(/<h1[^>]*>/g) ?? []).length, 1);

  /*
    The hero's article is lifted out of the grid rather than shown twice.
    Asserted against the grid itself rather than the whole page: the Daily
    Squawk band further down also links to it, on purpose, and counting
    every link to the slug cannot tell that apart from the duplicate card
    this is about.
  */
  const lead = pickFeatured(shown)!;
  /* The grid's own list and nothing after it. Slicing to the end of the
     document swept in the Daily Squawk band, which links to the same
     article on purpose, and read that as the duplicate. */
  const gridStart = page1.indexOf('id="articles"');
  const gridMarkup = page1.slice(gridStart, page1.indexOf('</ul>', gridStart));
  yes('the featured article is not repeated in the grid', !gridMarkup.includes(`href="/resources/${lead.slug}"`));
  is(
    'and the grid holds the rest of the page',
    new Set(
      [...gridMarkup.matchAll(/href="\/resources\/([a-z0-9-]+)"/g)].map((match) => match[1]),
    ).size,
    shown.length - 1,
  );
  is(
    'with every article on the page linked somewhere',
    new Set(linked.map((entry) => entry.slug)).size,
    shown.length,
  );
}

console.log('\n== the counts are of the archive, not of the page ==');
{
  yes(`the total is stated (${POSTS.length})`, page1Text.includes(`${POSTS.length} articles`));
  yes(
    '  with the page a reader is on',
    page1Text.includes(`page 1 of ${pageCountFor(POSTS.length)}`),
  );

  for (const entry of postCategories) {
    const count = COUNTS[entry.slug] ?? 0;
    yes(
      `${entry.name} says ${count} article${count === 1 ? '' : 's'}`,
      page1Text.includes(`${count} ${count === 1 ? 'article' : 'articles'}`),
    );
    yes(`  and links to its own view`, page1.includes(`href="/resources?category=${entry.slug}"`));
    yes(`  with its description`, page1Text.includes(entry.description));
  }
}

console.log('\n== the empty state ==');
{
  const empty = readable(
    render({ posts: [], featured: undefined, total: 0, page: 1, pageCount: 1, query: { search: 'xyzzy' } }),
  );
  yes('says the search matched nothing', empty.includes('Nothing matched that search'));
  yes('  and offers a way back', empty.includes('Show all articles'));
  yes('  rather than saying nothing is published', !empty.includes('The first articles are on their way'));

  const bare = readable(render({ posts: [], featured: undefined, total: 0, page: 1, pageCount: 1 }));
  yes('an empty archive says so instead', bare.includes('The first articles are on their way'));
}

console.log('\n== what the page does not claim ==');
{
  /*
    The design this came from has an email field, a Subscribe button and
    "Join 1,000+ SEOs and marketers already subscribed". There is no mailing
    list in this codebase - no list, no sender, no unsubscribe - so a field
    would collect addresses nothing could send to and the line under it
    would be a number nobody counted.
  */
  yes('there is no sign-up field', !/<input[^>]+type="email"/.test(page1));
  yes('nor a subscribe button', !/subscribe/i.test(page1Text));
  yes('nor a subscriber count', !/\bjoin \d/i.test(page1Text));
  yes('and nothing promises a newsletter', !/newsletter/i.test(page1Text));

  // Nor how often anybody publishes, which nothing here schedules.
  for (const claim of ['every week', 'weekly', 'daily digest', 'new guides every']) {
    yes(`nor "${claim}"`, !page1Text.toLowerCase().includes(claim));
  }

  // The band still exists and still points at the writing.
  yes('the Daily Squawk band is there', page1Text.includes('The Daily Squawk'));
  yes('  pointing at a guide', page1.includes('Read the latest guide'));
}

console.log('\n== the contact band the old page had ==');
{
  for (const phrase of [
    'Got a question the guides do not answer?',
    'Tell us what you are trying to achieve and we will tell you honestly whether Press Parrot is the right fit.',
    'Email the team',
    'Create free account',
  ]) {
    yes(`"${phrase.slice(0, 44)}…" survived the redraw`, page1Text.includes(phrase));
  }
  yes('and still links to signup', page1.includes('href="/signup"'));
  yes('and to the mailbox', page1.includes('href="mailto:'));
}

console.log('\n== covers, and what they cost ==');
{
  /*
    Nothing in the archive has a cover image today, so every card draws the
    category fallback - which is why it has to be a real design rather than
    a grey box. Checked as an absence of the thing that goes wrong: no
    <img> at all when no post has one, so there is nothing to 404.
  */
  const covers = (page1.match(/data-pp-cover/g) ?? []).length;
  is('no cover image is requested when no post has one', covers, 0);

  /*
    And nothing on the page is a broken placeholder: every image that *is*
    requested has a source and an alt attribute, the mascot's deliberately
    empty one included.
  */
  const images = [...page1.matchAll(/<img\b[^>]*>/g)].map((match) => match[0]);
  yes(
    `all ${images.length} images have a source`,
    images.every((tag) => /\ssrc="[^"]+"/.test(tag)),
  );
  yes('and all of them an alt attribute', images.every((tag) => /\salt="/.test(tag)));

  const illustrated = [
    { ...POSTS[0]!, coverImage: { src: '/images/a.jpg', alt: 'Alt as written' } },
    { ...POSTS[1]!, coverImage: { src: '/images/b.jpg', alt: 'The second one' } },
  ];

  /* Covers read off their own tags: looking for an attribute anywhere on the
     page passed with every cover switched to eager, because the mascot
     further down is lazy and satisfied the search. */
  const coverTags = (markup: string) =>
    [...markup.matchAll(/<img\b[^>]*data-pp-cover[^>]*>/g)].map((match) => match[0]);

  const bare = render({ posts: illustrated, featured: undefined, total: 2, page: 1, pageCount: 1 });
  const bareCovers = coverTags(bare);
  is('a cover is drawn for each post that has one', bareCovers.length, 2);
  yes("a post's own image is used", bareCovers[0]!.includes('src="/images/a.jpg"'));
  yes('  with the alt text the editor wrote', bareCovers[0]!.includes('alt="Alt as written"'));

  /*
    Exactly one eager image, and it is whichever is the largest thing above
    the fold. With no featured article the first card is it, so that one is
    fetched immediately and everything below it waits - nine cards fetching
    nine images before a reader has scrolled to any of them is the cost this
    rule exists to avoid.
  */
  yes('with no hero, the first card is the one fetched eagerly', bareCovers[0]!.includes('loading="eager"'));
  yes('  and the next one waits', bareCovers[1]!.includes('loading="lazy"'));

  const led = render({
    posts: illustrated,
    featured: illustrated[0],
    total: 2,
    page: 1,
    pageCount: 1,
  });
  const ledCovers = coverTags(led);
  yes('with a hero, the hero is the eager one', ledCovers[0]!.includes('loading="eager"'));
  yes(
    '  and every card below it waits',
    ledCovers.slice(1).every((tag) => tag.includes('loading="lazy"')),
  );
  is('  with only one eager image on the page', ledCovers.filter((tag) => tag.includes('loading="eager"')).length, 1);
}

console.log('\n== nothing is hidden from a crawler ==');
{
  yes('no element arrives already armed', !page1.includes('data-armed'));
  yes('nor already inked', !page1.includes('data-pp-on'));
  yes('no inline opacity:0', !/opacity:\s*0[^.\d]/.test(page1));
  yes('no inline display:none', !/display:\s*none/.test(page1));

  /*
    The search box is a form that submits to the index, so it works before
    its JavaScript arrives - which on the page listing the site's articles
    is the difference between a filter that needs a bundle and an archive
    that needs one.
  */
  yes('the search is a GET form', page1.includes('action="/resources"') && page1.includes('method="get"'));
  yes('  with a named field', page1.includes('name="q"'));
  yes('and the category pills are links', page1.includes('href="/resources?category='));
}

console.log('\n== the pager ==');
{
  const paged = render({ query: { page: 2 } });
  yes('page two links back to page one', paged.includes('href="/resources"'));
  yes('  and on to page three', paged.includes('href="/resources?page=3"'));
  yes('  marking previous and next for a crawler', paged.includes('rel="prev"') && paged.includes('rel="next"'));

  const single = render({ posts: POSTS.slice(0, 3), total: 3, page: 1, pageCount: 1 });
  yes('one page of results draws no pager', !single.includes('Article pages'));
}

report(check);
