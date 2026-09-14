import Link from 'next/link';
import type { ReactNode } from 'react';
import { Container } from '@/components/layout/container';

/**
 * The editorial section.
 *
 * Substantial public content about link building, laid out as a set of short
 * readable articles with a sticky contents list rather than a wall of text.
 * Internal links point at the service pages they actually belong to.
 */

interface Article {
  id: string;
  heading: string;
  body: ReactNode;
}

const articles: Article[] = [
  {
    id: 'what-is-link-building',
    heading: 'What is link building?',
    body: (
      <>
        <p>
          Link building is the work of getting other websites to link to yours. A link is a
          recommendation of sorts: someone thought a page was worth pointing their readers at.
          Search engines have used that signal since the beginning, and despite everything that has
          changed around it, they still do.
        </p>
        <p>
          In practice it covers several different activities. Earning coverage because you
          published something worth covering. Writing for someone else&rsquo;s audience in exchange
          for a mention. Getting a relevant page updated to reference yours. They differ in effort,
          cost and speed, but the intent is the same: a credible page, on a relevant site, pointing
          at yours.
        </p>
      </>
    ),
  },
  {
    id: 'why-link-building-matters',
    heading: 'Why link building still matters for SEO',
    body: (
      <>
        <p>
          Every few years the industry announces that links are finished. They are not, and the
          reason is fairly mundane: search engines need some way to judge whether a page deserves
          to outrank a similar one, and links remain one of the few signals that is difficult to
          manufacture at scale without it being obvious.
        </p>
        <p>
          What has changed is the tolerance for low quality. Volume alone stopped working a long
          time ago. A hundred links from sites nobody reads will do less than a handful from places
          that genuinely cover your subject, and may do harm if the pattern is blatant enough.
        </p>
        <p>
          The practical upshot is that link building has become more like publishing and less like
          procurement. Fewer links, better chosen, on pages worth linking to.
        </p>
      </>
    ),
  },
  {
    id: 'high-quality-backlink',
    heading: 'What makes a high quality backlink?',
    body: (
      <>
        <p>
          Relevance first. A link from a mid-sized site that actually covers your industry
          generally does more than one from a larger site with no connection to it. Topical fit is
          what makes a link look earned rather than bought.
        </p>
        <p>
          Then look past the headline authority score. Domain rating and similar metrics are
          third-party estimates, and they can be inflated deliberately. Real organic traffic,
          distributed across a reasonable number of pages, is much harder to fake.
        </p>
        <p>
          Finally, the placement itself. A link inside the body of an article, in a sentence that
          would make sense without it, carries more weight than one in a footer, an author bio or a
          block of links at the end of a post. And the page carrying it should be indexed and
          plausibly read by somebody.
        </p>
      </>
    ),
  },
  {
    id: 'guest-posts-vs-niche-edits',
    heading: 'Guest posts vs niche edits',
    body: (
      <>
        <p>
          A{' '}
          <Link href="/guest-posts" className="text-accent-700 hover:underline">
            guest post
          </Link>{' '}
          is a new article written for a publisher&rsquo;s site, built around a subject you choose,
          with your link placed where it naturally belongs. You control the framing, which matters
          when the page you are linking to needs explaining rather than merely mentioning.
        </p>
        <p>
          A{' '}
          <Link href="/niche-edits" className="text-accent-700 hover:underline">
            niche edit
          </Link>{' '}
          adds your link to an article that already exists and is already indexed. It is usually
          faster and the host page has some history behind it, but you are working with a sentence
          somebody else wrote.
        </p>
        <p>
          Most campaigns want both. Niche edits keep momentum on pages that are already close to
          where you want them; guest posts do the heavier work of establishing relevance for pages
          starting from nothing.
        </p>
      </>
    ),
  },
  {
    id: 'how-we-vet',
    heading: 'How Press Parrot vets websites',
    body: (
      <>
        <p>
          A site is reviewed by a person before it is listed. We look at whether the organic
          traffic is real and reasonably spread rather than concentrated in one lucky page, whether
          the site publishes genuine editorial content alongside any sponsored work, and how many
          commercial outbound links its articles already carry.
        </p>
        <p>
          We also check the basics that get missed: is the site actually indexed, does it have a
          publishing history, and does its authority come from somewhere plausible rather than from
          a network of sites all linking to each other.
        </p>
        <p>
          Sites that fail are not listed at a lower price. They are not listed. That is the whole
          point of a vetted marketplace, and it is why the inventory sits behind an account rather
          than being scraped and resold elsewhere.
        </p>
      </>
    ),
  },
  {
    id: 'choosing-opportunities',
    heading: 'How to choose link building opportunities',
    body: (
      <>
        <p>
          Start from the page you are trying to move, not from the list of available sites. What
          would a reasonable reader expect to find linking to it? That question narrows a
          five-thousand-site marketplace faster than any filter.
        </p>
        <p>
          Then use the metrics to sanity-check rather than to select. Filter to a relevance band
          first, and only then sort by authority, traffic or price. Choosing the highest DR site
          you can afford is how link profiles end up looking bought.
        </p>
        <p>
          Spread placements across several target pages, vary the anchors so the profile reads
          naturally, and keep a steady pace instead of buying a large batch and then stopping.
        </p>
      </>
    ),
  },
  {
    id: 'agencies',
    heading: 'Link building for SEO agencies',
    body: (
      <>
        <p>
          Everything above gets harder when you multiply it by a client list. Each account needs
          its own shortlist, its own anchors, its own content and its own reporting, and each
          supplier relationship has to be maintained separately.
        </p>
        <p>
          A single marketplace with fixed prices removes most of that overhead: the same inventory
          and the same costs across every campaign, so a retainer can be quoted from known numbers
          rather than estimated and reconciled afterwards.{' '}
          <Link href="/link-building-agencies" className="text-accent-700 hover:underline">
            More on how agencies use Press Parrot
          </Link>
          .
        </p>
      </>
    ),
  },
  {
    id: 'content-and-links',
    heading: 'Content and link building',
    body: (
      <>
        <p>
          The most common reason a link campaign underdelivers has nothing to do with the links. It
          is that the pages receiving them were never strong enough to hold a position once they
          arrived there.
        </p>
        <p>
          Links get a page considered. The page itself has to do the rest: answer the question the
          searcher arrived with, cover the follow-ups, and give somebody a reason to stay.{' '}
          <Link href="/content-writing" className="text-accent-700 hover:underline">
            SEO content writing
          </Link>{' '}
          and link building are usually treated as separate budgets, and they work considerably
          better when they are planned together.
        </p>
      </>
    ),
  },
];

export function SeoEditorial() {
  return (
    <section className="border-b border-line bg-white" aria-labelledby="editorial-heading">
      <Container size="wide" className="py-14 lg:py-20">
        <div className="max-w-2xl">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-accent-700 uppercase">
            Link building, explained
          </p>
          <h2
            id="editorial-heading"
            className="mt-4 text-2xl font-semibold tracking-tight text-ink sm:text-[2rem] sm:leading-tight"
          >
            What we have learned about building links that last
          </h2>
        </div>

        <div className="mt-11 grid gap-10 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] lg:gap-16">
          <nav aria-label="On this page" className="lg:sticky lg:top-24 lg:self-start">
            <h3 className="text-[12px] font-semibold tracking-wide text-muted uppercase">
              On this page
            </h3>
            <ol className="mt-4 space-y-2.5 border-l border-line pl-4">
              {articles.map((article) => (
                <li key={article.id}>
                  <a
                    href={`#${article.id}`}
                    className="text-[13px] leading-snug text-muted transition-colors hover:text-accent-700"
                  >
                    {article.heading}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="min-w-0 max-w-2xl space-y-11">
            {articles.map((article) => (
              <article key={article.id} id={article.id} className="scroll-mt-24">
                <h3 className="text-[1.375rem] font-semibold tracking-tight text-ink sm:text-2xl">
                  {article.heading}
                </h3>
                <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-muted [&_p]:m-0">
                  {article.body}
                </div>
              </article>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
