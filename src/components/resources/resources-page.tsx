import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  Compass,
  Link2,
  Mail,
  Newspaper,
  PenLine,
  Search,
  TrendingUp,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Reveal } from '@/components/cms/reveal';
import { ArticleCard, FeaturedArticleCard } from './article-card';
import { ResourceFilters } from './filters';
import { Pager } from './pager';
import { DailySquawk } from './daily-squawk';
import { listingHref, type ListingQuery } from '@/lib/blog/listing';
import { postCategories } from '@/lib/config/blog';
import { brand } from '@/lib/config/brand';
import type { Animation } from '@/lib/cms/sections';
import type { BlogPost, PostCategorySlug } from '@/lib/types/blog';

/**
 * /resources, as its own composition.
 *
 * The fifth page redrawn, and the first that is a listing rather than a
 * marketing page: there is no CMS copy behind it and nothing an editor
 * types. What it draws is articles, and the rule that follows from that is
 * the whole of this file's design - **nothing here is written down that the
 * article system could tell us instead.** The categories, their names, their
 * descriptions and their counts, the featured article, the reading times and
 * the article count are all read; the only sentences typed here are the four
 * in the strip below the hero and the band's own heading, and each of those
 * is checked against something true.
 *
 * ## The hero's article is chosen, not configured
 *
 * There is no `featured` flag on a post. So the lead is picked by a rule the
 * suite can state: the newest live post that has a cover image, and the
 * newest live post otherwise. A rule rather than a hand-picked slug, because
 * a slug typed here is a slug that keeps pointing at an article somebody
 * later unpublishes.
 *
 * ## Search and filtering are the server's
 *
 * `ResourceFilters` is the only client component on the page and it
 * enhances a real GET form; the results themselves are rendered on the
 * server from `blogService.page`, which filters, searches, sorts and slices
 * in the database. So the archive is crawlable, every view is a URL, and
 * none of it depends on JavaScript having arrived.
 */

const FADE_UP: Animation = { entrance: 'fade-up', speed: 'normal', delay: 'none' };
const STAGGER: Animation = { entrance: 'stagger', speed: 'normal', delay: 'none' };
const SLIDE_LEFT: Animation = { entrance: 'slide-left', speed: 'normal', delay: 'none' };

/** Where the grid is, so the search box can say what it controls. */
const RESULTS_ID = 'articles';

/**
 * The four points under the hero.
 *
 * The only invented copy on the page, and each one restates something that
 * is already true and checkable rather than making a new claim. There is
 * deliberately nothing here about how often we publish or how many people
 * write: the design this came from promised "Regular updates - stay ahead of
 * the latest trends", and nothing in this codebase schedules a post.
 */
function strip(topicCount: number): { icon: LucideIcon; title: string; body: string }[] {
  return [
    {
      icon: Compass,
      title: 'Practical advice',
      body: 'Written to be acted on rather than agreed with.',
    },
    {
      icon: Users,
      title: 'Written in-house',
      body: 'By the people who run the marketplace, not a content farm.',
    },
    {
      icon: BookOpen,
      title: `${topicCount} topics`,
      body: 'Link building, digital PR, SEO, content and agency growth.',
    },
    {
      icon: Search,
      title: 'Free to read',
      body: 'No account, no paywall and no sign-up to get to the end.',
    },
  ];
}

/** A mark per category, matching the one the covers draw. */
const TOPIC_MARKS: Record<PostCategorySlug, LucideIcon> = {
  'link-building': Link2,
  'digital-pr': Newspaper,
  seo: Search,
  content: PenLine,
  'agency-growth': TrendingUp,
};

export function ResourcesPage({
  posts,
  featured,
  total,
  page,
  pageCount,
  counts,
  query,
  heading,
  intro,
}: {
  /** This page of results, already filtered, searched and sliced. */
  posts: BlogPost[];
  /** The hero's article. Absent on a filtered view, which leads with the grid. */
  featured?: BlogPost;
  total: number;
  page: number;
  pageCount: number;
  counts: Record<string, number>;
  query: ListingQuery;
  heading: string;
  intro: string;
}) {
  const category = query.category;
  const searching = Boolean(query.search);
  const filtered = Boolean(category) || searching;
  const topics = strip(postCategories.length);

  /*
    The hero's article is lifted out of the grid rather than shown twice.
    The page this replaces did the same, and the reason is the obvious one:
    a listing with the same article at the top and again three cards later
    reads as a bug, whatever it is.

    The count below the heading is still the whole result, because that is
    what it says it is - the hero is one of those articles, moved, not one
    extra.
  */
  const grid = featured ? posts.filter((post) => post.id !== featured.id) : posts;

  return (
    <>
      {/* ------------------------------------------------------------ hero */}
      <section className="relative overflow-x-clip border-b border-line bg-white">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(48rem 30rem at 82% -10%, rgba(16,185,129,0.16) 0%, transparent 62%), radial-gradient(34rem 24rem at 0% 104%, rgba(16,185,129,0.09) 0%, transparent 60%)',
          }}
        />

        <Container size="wide" className="relative py-12 lg:py-20">
          <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,32rem)] lg:gap-16">
            <div className="min-w-0">
              <p
                data-pp-enter=""
                className="inline-flex rounded-full bg-accent-50 px-3 py-1 text-[11px] font-semibold tracking-[0.12em] text-accent-700 uppercase"
              >
                Resources &amp; guides
              </p>

              {/* Transform only: the LCP candidate is not faded in. */}
              <h1
                data-pp-enter="heading"
                style={{ '--pp-delay': '80ms' } as React.CSSProperties}
                className="mt-5 text-[2.25rem] leading-[1.06] font-semibold tracking-tight text-ink sm:text-5xl lg:text-[3.1rem]"
              >
                {heading}
              </h1>

              <p
                data-pp-enter=""
                style={{ '--pp-delay': '220ms' } as React.CSSProperties}
                className="mt-6 max-w-xl text-[16px] leading-relaxed text-muted lg:text-[17px]"
              >
                {intro}
              </p>

              <div
                data-pp-enter=""
                style={{ '--pp-delay': '340ms' } as React.CSSProperties}
                className="mt-8 max-w-xl"
              >
                <ResourceFilters
                  category={category}
                  search={query.search}
                  resultsId={RESULTS_ID}
                />
              </div>
            </div>

            {/* ------------------------------------- the featured article */}
            {featured ? (
              <div
                data-pp-enter="panel"
                style={{ '--pp-delay': '200ms' } as React.CSSProperties}
                className="relative min-w-0"
              >
                <FeaturedArticleCard post={featured} />
              </div>
            ) : null}
          </div>
        </Container>
      </section>

      {/* ----------------------------------------------------- the strip */}
      <section className="border-b border-line bg-surface">
        <Container size="wide" className="py-10 lg:py-12">
          <Reveal animation={STAGGER}>
            <ul data-reveal-items="" className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {topics.map((item) => (
                <li key={item.title} className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-50 text-accent-700">
                    <item.icon className="h-4.5 w-4.5" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block text-[14px] font-semibold text-ink">{item.title}</span>
                    <span className="mt-0.5 block text-[13px] leading-snug text-muted">
                      {item.body}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </Reveal>
        </Container>
      </section>

      {/* ------------------------------------------------------ the grid */}
      <section className="border-b border-line bg-white">
        <Container size="wide" className="py-14 lg:py-20">
          <Reveal animation={FADE_UP}>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-[2rem] sm:leading-tight">
                  {resultsHeading(query)}
                </h2>
                {/*
                  The count is the whole result, not this page of it - a
                  reader on page two of nineteen articles is looking at nine
                  of nineteen, and saying "9 articles" there would be wrong.
                */}
                <p className="mt-2 text-[14px] text-muted">
                  {total === 0
                    ? 'No articles match yet.'
                    : `${total} ${total === 1 ? 'article' : 'articles'}${
                        pageCount > 1 ? ` · page ${page} of ${pageCount}` : ''
                      }`}
                </p>
              </div>

              {filtered ? (
                <Link
                  href="/resources"
                  className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent-700 hover:text-accent-800"
                >
                  Clear filters
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              ) : null}
            </div>
          </Reveal>

          {grid.length === 0 && !featured ? (
            <Reveal animation={FADE_UP}>
              <div className="mt-10 rounded-[var(--radius-card)] border border-dashed border-line-strong bg-surface px-6 py-16 text-center">
                <BookOpen className="mx-auto h-6 w-6 text-muted" aria-hidden="true" />
                <h3 className="mt-4 text-[16px] font-semibold text-ink">
                  {searching ? 'Nothing matched that search' : 'Nothing here yet'}
                </h3>
                <p className="mx-auto mt-1.5 max-w-sm text-[14px] leading-relaxed text-muted">
                  {searching
                    ? 'Try a shorter phrase, or clear the search to see everything.'
                    : category
                      ? 'No articles in this topic yet.'
                      : 'The first articles are on their way.'}
                </p>
                {filtered ? (
                  <Button asChild variant="outline" size="sm" className="mt-6">
                    <Link href="/resources">Show all articles</Link>
                  </Button>
                ) : null}
              </div>
            </Reveal>
          ) : (
            <>
              <Reveal animation={STAGGER}>
                <ul
                  id={RESULTS_ID}
                  data-reveal-items=""
                  className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
                >
                  {grid.map((post, index) => (
                    <li key={post.id}>
                      {/*
                        The first card is eager only when there is no
                        featured article above it to be the page's largest
                        paint - on the unfiltered index that is the hero's.
                      */}
                      <ArticleCard post={post} priority={!featured && index === 0} />
                    </li>
                  ))}
                </ul>
              </Reveal>

              <Pager query={query} page={page} pageCount={pageCount} />
            </>
          )}
        </Container>
      </section>

      {/* --------------------------------------------------- Daily Squawk */}
      <DailySquawk latest={featured ?? posts[0]} />

      {/* -------------------------------------------------- popular topics */}
      <section id="topics" className="border-b border-line bg-white">
        <Container size="wide" className="py-14 lg:py-20">
          <Reveal animation={FADE_UP}>
            <div className="max-w-2xl">
              <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-[2rem] sm:leading-tight">
                Browse by topic
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed text-muted">
                Every guide sits in one of these. The counts are what is published today.
              </p>
            </div>
          </Reveal>

          <Reveal animation={STAGGER}>
            <ul
              data-reveal-items=""
              className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
            >
              {postCategories.map((entry) => {
                const Mark = TOPIC_MARKS[entry.slug] ?? Link2;
                /* Read, never written: a hardcoded count is a number that is
                   wrong the first time somebody publishes. */
                const count = counts[entry.slug] ?? 0;
                return (
                  <li key={entry.slug}>
                    <Link
                      href={listingHref({ category: entry.slug })}
                      className="group flex h-full flex-col rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)] transition-all duration-200 hover:-translate-y-1 hover:border-accent-200 hover:shadow-[var(--shadow-pop)]"
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-50 text-accent-700 transition-colors group-hover:bg-accent-100">
                        <Mark className="h-4.5 w-4.5" aria-hidden="true" />
                      </span>
                      <span className="mt-4 text-[15px] font-semibold text-ink group-hover:text-accent-700">
                        {entry.name}
                      </span>
                      <span className="mt-1.5 flex-1 text-[13px] leading-snug text-muted">
                        {entry.description}
                      </span>
                      <span className="mt-4 flex items-center justify-between border-t border-line pt-3 text-[12px] text-muted">
                        {count} {count === 1 ? 'article' : 'articles'}
                        <ArrowRight
                          className="h-3.5 w-3.5 text-accent-700 transition-transform duration-200 group-hover:translate-x-1"
                          aria-hidden="true"
                        />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Reveal>
        </Container>
      </section>

      {/* ------------------------------------------------------- contact
          Kept from the page this replaces, wording and destinations intact:
          it is the only conversion path the index has ever had. */}
      <section id="contact" className="overflow-x-clip border-t border-line bg-surface">
        <Container size="wide" className="py-14 lg:py-20">
          <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr] lg:items-center">
            <Reveal animation={FADE_UP}>
              <div>
                <Badge tone="accent">Contact</Badge>
                <h2 className="mt-4 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                  Got a question the guides do not answer?
                </h2>
                <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted">
                  Tell us what you are trying to achieve and we will tell you honestly whether Press
                  Parrot is the right fit.
                </p>
              </div>
            </Reveal>

            <Reveal animation={SLIDE_LEFT}>
              <div className="flex flex-wrap gap-3 lg:justify-end">
                <Button asChild variant="accent" size="lg">
                  <Link href={`mailto:${brand.salesEmail}`}>
                    <Mail className="h-4 w-4" aria-hidden="true" />
                    Email the team
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link href="/signup">
                    Create free account
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
              </div>
            </Reveal>
          </div>
        </Container>
      </section>
    </>
  );
}

/**
 * What the grid is called, given what is being looked at.
 *
 * Exported so the suite can state the four cases rather than reading them
 * off a render: a search says what was searched for, a category says which,
 * and the index says "Latest articles" - which is what it is, newest first.
 */
export function resultsHeading(query: ListingQuery): string {
  if (query.search) return `Results for “${query.search}”`;
  if (query.category) {
    const entry = postCategories.find((candidate) => candidate.slug === query.category);
    return entry ? entry.name : 'Latest articles';
  }
  return 'Latest articles';
}

/**
 * Which article leads the hero.
 *
 * The newest with a cover image, because the hero is a picture; the newest
 * of any kind when none has one, because a hero with a drawn category
 * fallback is better than no hero. A rule, so that it keeps being right
 * after somebody publishes - and so the suite can assert it rather than a
 * slug.
 */
export function pickFeatured(posts: BlogPost[]): BlogPost | undefined {
  return posts.find((post) => Boolean(post.coverImage?.src)) ?? posts[0];
}
