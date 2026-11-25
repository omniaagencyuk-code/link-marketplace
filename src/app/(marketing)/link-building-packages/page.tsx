import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { tierOffers } from '@/lib/services/tier-offers';
import { brand, siteUrl } from '@/lib/config/brand';

/**
 * What a link costs, by domain rating.
 *
 * The marketplace asks eleven questions before it shows anybody anything,
 * which is right for building a shortlist and useless to somebody who only
 * wants to know roughly what a DR 40 link goes for. This page answers that
 * one question and sends them to the marketplace to choose.
 *
 * ## Every figure is read, and none is a promise
 *
 * A tier is a domain rating. Its price is the cheapest listing at that
 * rating right now, and its count is how many there are - both read at
 * request time, neither typed anywhere. So the table cannot quote a figure
 * the marketplace does not have, which is the failure
 * `verify:content-writing` exists to catch on /content-writing.
 *
 * "From" is doing real work: it is the floor, not a typical price, and the
 * page says so rather than letting a reader take it for an average.
 *
 * ## No publisher is named
 *
 * `TierOffer` has no field that could hold a domain. The marketplace is
 * account-only and this page is not, so the constraint is structural rather
 * than a rule somebody has to remember while editing - the same shape
 * `SampleRow` has on the niche pages.
 */
export const dynamic = 'force-dynamic';

const TITLE = 'Link Building Prices by Domain Rating | Press Parrot';
const DESCRIPTION =
  'What a backlink costs at each domain rating, from DR10 to DR60 and above. Live prices from our marketplace of vetted publishers with real organic traffic.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/link-building-packages' },
  openGraph: {
    title: `${TITLE} | ${brand.name}`,
    description: DESCRIPTION,
    url: `${siteUrl}/link-building-packages`,
  },
};

export default async function LinkBuildingPackagesPage() {
  const tiers = await tierOffers();
  /*
    The column is dropped rather than left blank where no median can be had
    - a clone has none. An empty column under a heading reads as missing
    data about the listings; no column reads as the page not offering that.
  */
  const showTypical = tiers.some((tier) => tier.typicalPrice !== null);

  return (
    <>
      <section className="border-b border-line bg-white">
        <Container size="wide" className="py-14 lg:py-20">
          <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            Link building prices by domain rating
          </h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted">
            Roughly what a placement costs at each domain rating. Pick a tier to see every
            publisher in it, with its traffic, market and price, and buy the ones you want.
          </p>
          <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-muted">
            Prices are per placement and read from live listings, so they move as publishers
            change their rates. <strong>From</strong> is the cheapest site at that rating and
            <strong> Typical</strong> is the middle one — worth reading together, because the
            cheapest site in the marketplace clears most of these ratings.
          </p>
        </Container>
      </section>

      {tiers.length === 0 ? (
        /*
          Every tier withheld. `tierOffer` returns null below the stock
          floor, so this is what too thin an inventory looks like - and
          saying so beats a table of prices for links nobody can buy.
        */
        <section className="bg-surface">
          <Container size="wide" className="py-14">
            <p className="text-[15px] text-muted">
              Prices are not available at the moment. The marketplace is open and can be
              browsed a placement at a time.
            </p>
            <div className="mt-6">
              <Button asChild>
                <Link href="/guest-posts">Browse the marketplace</Link>
              </Button>
            </div>
          </Container>
        </section>
      ) : (
        <section className="bg-surface">
          <Container size="wide" className="py-14">
            <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-white">
              <table className="w-full border-collapse text-left">
                <caption className="sr-only">
                  Price per placement by minimum domain rating
                </caption>
                <thead className="bg-surface">
                  <tr>
                    {[
                      'Domain rating',
                      'Sites available',
                      'From',
                      ...(showTypical ? ['Typical'] : []),
                      '',
                    ].map((head) => (
                      <th
                        key={head}
                        scope="col"
                        className="px-4 py-3 text-[11px] font-semibold tracking-wide text-muted uppercase"
                      >
                        {head}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tiers.map((tier) => (
                    <tr key={tier.slug} className="border-t border-line">
                      <td className="px-4 py-4">
                        <span className="text-[16px] font-semibold text-ink">
                          {tier.label}
                        </span>
                        {tier.popular ? (
                          <span className="ml-2 rounded-full bg-accent-50 px-2 py-0.5 text-[11px] font-semibold text-accent-700">
                            Most popular
                          </span>
                        ) : null}
                      </td>
                      <td className="tabular px-4 py-4 text-[14px] text-ink-soft">
                        {tier.sites}
                      </td>
                      <td className="tabular px-4 py-4">
                        <span className="text-[16px] text-ink-soft">{tier.fromPrice}</span>
                      </td>
                      {showTypical ? (
                        <td className="tabular px-4 py-4">
                          <span className="text-[16px] font-semibold text-ink">
                            {tier.typicalPrice ?? '\u2014'}
                          </span>
                          <span className="ml-1 text-[13px] text-muted">/ placement</span>
                        </td>
                      ) : null}
                      <td className="px-4 py-4">
                        <Button asChild size="sm" variant="outline">
                          <Link href={tier.browseHref}>
                            See sites
                            <ArrowRight className="h-4 w-4" aria-hidden="true" />
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link href="/signup">
                  Create a free account
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/how-it-works">How it works</Link>
              </Button>
            </div>

            <p className="mt-6 max-w-3xl text-[13px] leading-relaxed text-muted">
              Domains are shown to account holders. A free account is enough to see every
              publisher, its measured traffic and its price before you order; you pay only
              for the placements you buy. Prices shown exclude any applicable tax.
            </p>
          </Container>
        </section>
      )}
    </>
  );
}
