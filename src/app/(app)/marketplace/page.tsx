import { Suspense } from 'react';
import type { Metadata } from 'next';
import { MarketplaceView } from '@/components/marketplace/marketplace-view';
import { BulkPricingNote } from '@/components/marketplace/bulk-pricing-note';
import { ProjectsPanel } from '@/components/marketplace/projects-panel';
import { requireCustomerSession } from '@/lib/auth/customer-access';
import { settingsService, websiteService } from '@/lib/services';
import { gapService } from '@/lib/services/gap-service';
import { parseFilters, toWebsiteQuery } from '@/lib/marketplace/filters';
import { sortOptions } from '@/lib/utils/labels';
import type { SortKey } from '@/lib/types';

/**
 * The marketplace. One render, for somebody with an account.
 *
 * ## What used to be here
 *
 * Two renders: this one, and a public gateway that explained the marketplace
 * and sold the signup to anybody arriving without an account. Its comment
 * said `proxy.ts` let `/marketplace` through "precisely because of the
 * signed-out half".
 *
 * That stopped being true and the comment did not. `/marketplace` is an
 * inventory path in `isInventoryPath`, so a request without a session is
 * 307'd to /signup before this file runs - the gateway had been unreachable
 * ever since, and the comment was the only thing still claiming otherwise.
 *
 * The gateway's job - being the public, indexable page that describes the
 * inventory - belongs to /guest-posts and its niche pages now, and that
 * decision is held in four places rather than one: the gate in `proxy.ts`,
 * the segment's `robots` in the layout beside this file, `/marketplace`'s
 * deliberate absence from the sitemap, and `verify:access`, which asserts
 * all three. Deleting two hundred lines of unreachable page is the only one
 * of the five that had not caught up.
 *
 * So this is not a feature being removed. It is the last copy of a decision
 * already taken agreeing with the other four.
 *
 * ## The session is required rather than checked
 *
 * `requireCustomerSession`, as `/websites/[slug]` does it - the second of the
 * two checks AGENTS.md describes, where the proxy is the first. A page that
 * read the session and branched on it would be a page that renders something
 * for a visitor the gate is there to stop, which is exactly what was left
 * here to delete.
 */

/*
  A title and nothing else.

  This carried a description, a canonical and an Open Graph block, written for
  a page meant to be found in search. The segment's layout answers
  `robots: { index: false, follow: false }` for everything under it, so there
  is no search listing for any of it to describe - and metadata that implies
  otherwise is the same drift as the comment above.
*/
export const metadata: Metadata = { title: 'Link building marketplace' };

/**
 * The sort in the URL, if it is one the dropdown offers.
 *
 * The same rule the hook applies, for the same reason: an order that no longer
 * exists would leave the control blank while the list was ordered by something
 * unnameable.
 */
function sortFromParams(params: URLSearchParams): SortKey {
  const asked = params.get('sort');
  return sortOptions.some((option) => option.value === asked) ? (asked as SortKey) : 'relevance';
}

export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireCustomerSession('/marketplace');

  /*
    The inventory figure, counted rather than advertised.

    It was `marketingStats.inventory` - a constant of 5,247 declared in the
    mock data file. Measured against the live marketplace it was wrong by
    more than half: there are 12,190 active listings. Wrong in the direction
    nobody checks, too, because a number that undersells is not a number
    anybody disputes.

    The same failure the homepage had with "5,000+ vetted websites" against a
    real number nearer nine hundred. That one was caught because it
    overstated; this one sat here understating for just as long.

    `getStats` counts in the database and is memoised for the request.
  */
  const stats = await websiteService.getStats();
  const inventory = stats.totalWebsites;

  /*
    Filtered in the database, not in the browser.

    The URL is already where the filters live - `useMarketplaceFilters` has
    always written them there - so the page can read them straight out of
    `searchParams` and ask for the one page it needs. Reading them with the
    same parser the browser writes with is the whole of why that parser moved
    out of the hook: two readings of one URL is one filter's spelling away
    from showing a customer a different list from the one their address bar
    describes.
  */
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    const single = Array.isArray(value) ? value[0] : value;
    if (typeof single === 'string' && single !== '') params.set(key, single);
  }

  const settings = await settingsService.get();
  const filters = parseFilters(params);
  const sort = sortFromParams(params);
  const page = Math.max(1, Number(params.get('page') ?? '1') || 1);
  const pageSize = Math.max(1, Number(params.get('size') ?? String(settings.defaultPageSize)) || settings.defaultPageSize);

  const [result, facets] = await Promise.all([
    websiteService.search(toWebsiteQuery(filters, sort, page, pageSize), filters.topic),
    websiteService.facets(filters.topic),
  ]);

  const projects = user.id ? await gapService.projects(user.id, 5) : [];

  return (
    <div className="space-y-5">
      {/*
        The header and the projects panel share a row on a wide screen and
        stack below it. Compact on purpose: this sits inside the customer
        rail now, and a decorative band pushing the first publisher below
        the fold is the opposite of what a marketplace is for.
      */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <section className="relative flex flex-col justify-center overflow-hidden rounded-[var(--radius-card)] border border-accent-100 bg-accent-50/60 px-5 py-5 sm:px-6">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-16 -right-10 h-48 w-48 rounded-full bg-accent-100/70 blur-3xl"
          />
          <div className="relative">
            <h1 className="text-[26px] leading-tight font-semibold tracking-tight text-ink sm:text-[30px]">
              Publisher Marketplace
            </h1>
            <p className="mt-1.5 max-w-xl text-[14px] leading-relaxed text-ink-soft">
              Find high-quality websites and order backlinks from trusted publishers.
            </p>
            {inventory > 0 ? (
              <p className="mt-3 text-[12px] text-muted">
                <strong className="tabular font-semibold text-ink">
                  {inventory.toLocaleString('en-GB')}
                </strong>{' '}
                vetted websites, counted from the live marketplace.
              </p>
            ) : null}
          </div>
        </section>

        <ProjectsPanel projects={projects} />
      </div>

      {/*
        Outside the filters and the listings, between the header row and
        the results. Anywhere inside `MarketplaceView` would put a
        promotional line among the controls somebody is using to find a
        publisher; here it is a sibling and the view is untouched.
      */}
      <BulkPricingNote />

      <Suspense fallback={<MarketplaceSkeleton />}>
        <MarketplaceView
          result={result}
          facets={facets}
          defaultPageSize={settings.defaultPageSize}
        />
      </Suspense>
    </div>
  );
}

function MarketplaceSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <div className="hidden h-96 animate-pulse rounded-[var(--radius-card)] border border-line bg-white lg:block" />
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, index) => (
          <div
            key={index}
            className="h-14 animate-pulse rounded-[var(--radius-card)] border border-line bg-white"
          />
        ))}
      </div>
    </div>
  );
}
