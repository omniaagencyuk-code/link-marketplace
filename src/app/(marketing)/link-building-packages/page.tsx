import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { packageOffers } from '@/lib/services/package-offers';
import { brand, siteUrl } from '@/lib/config/brand';

/**
 * Buying several placements at once, without using the filters.
 *
 * The marketplace asks a buyer eleven questions before it shows them
 * anything, which is right for somebody building a shortlist and paralysing
 * for somebody who wants ten good links. A package answers those questions
 * with a saved search and shows what the answer costs today.
 *
 * ## Every figure here is read, never written
 *
 * The totals, the rating ranges and the rows all come from the listings the
 * basket would actually hold - `packageOffer` prices the same listings
 * `packageLines` would put in it. Nothing is read from the package
 * definition but its name and its sentence, because a price typed into a
 * config file is one the checkout stops charging the moment a publisher
 * repauses or reprices.
 *
 * ## And no row can name a publisher
 *
 * `PackageRow` has no field that could hold a domain, the same constraint
 * the niche pages' `SampleRow` is built to. The marketplace is account-only;
 * this page is not. A buyer sees the actual sites after signing in, on the
 * page behind the button, and may remove any of them before paying.
 */
export const dynamic = 'force-dynamic';

const TITLE = 'Link Building Packages | Buy Multiple Placements';
const DESCRIPTION =
  'Buy five or ten placements in one go, on vetted sites with real organic traffic. See the rating range and the price before you order, and swap any site you do not want.';

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
  const offers = await packageOffers();

  return (
    <>
      <section className="border-b border-line bg-white">
        <Container size="wide" className="py-14 lg:py-20">
          <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            Link building packages
          </h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted">
            A set number of placements, chosen from the same marketplace you can browse
            yourself. You see every site before you pay and can swap any of them.
          </p>
          <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-muted">
            Prices are the total for the placements listed and are worked out from live
            listings, so they move as publishers change their rates.
          </p>
        </Container>
      </section>

      {offers.length === 0 ? (
        /*
          Every package withheld. `packageOffer` returns null for one it
          cannot fill, so this is what an inventory too thin for any of them
          looks like - and an empty page saying so is better than three cards
          quoting a basket we could not assemble.
        */
        <section className="bg-surface">
          <Container size="wide" className="py-14">
            <p className="text-[15px] text-muted">
              No packages are available at the moment. The marketplace is open and can be
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
            <div className="grid gap-6 lg:grid-cols-3">
              {offers.map((offer) => (
                <article
                  key={offer.slug}
                  className="flex flex-col rounded-[var(--radius-card)] border border-line bg-white p-6"
                >
                  <h2 className="text-xl font-semibold tracking-tight text-ink">
                    {offer.name}
                  </h2>
                  <p className="mt-2 text-[14px] leading-relaxed text-muted">
                    {offer.blurb}
                  </p>

                  <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-line pt-5">
                    <div>
                      <dt className="text-[12px] tracking-wide text-muted uppercase">
                        Placements
                      </dt>
                      <dd className="mt-1 text-2xl font-semibold text-ink">
                        {offer.count}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[12px] tracking-wide text-muted uppercase">
                        Total
                      </dt>
                      <dd className="mt-1 text-2xl font-semibold text-ink">
                        {offer.total}
                      </dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-[12px] tracking-wide text-muted uppercase">
                        Domain rating
                      </dt>
                      <dd className="mt-1 text-[15px] font-medium text-ink">
                        DR {offer.drMin}-{offer.drMax}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-5 overflow-hidden rounded-[var(--radius-card)] border border-line">
                    <table className="w-full border-collapse text-left">
                      <caption className="sr-only">
                        The {offer.count} placements in the {offer.name} package, with
                        domains withheld until sign-in
                      </caption>
                      <thead className="bg-surface">
                        <tr>
                          {['Publisher', 'DR', 'Traffic', 'Market'].map((head) => (
                            <th
                              key={head}
                              scope="col"
                              className="px-3 py-2 text-[11px] font-semibold tracking-wide text-muted uppercase"
                            >
                              {head}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {offer.rows.map((row) => (
                          <tr key={row.key} className="border-t border-line">
                            <td className="px-3 py-2 text-[13px] font-medium text-ink">
                              {row.label}
                            </td>
                            <td className="tabular px-3 py-2 text-[13px] text-ink-soft">
                              {row.domainRating}
                            </td>
                            <td className="tabular px-3 py-2 text-[13px] text-ink-soft">
                              {row.traffic}
                            </td>
                            <td className="px-3 py-2 text-[13px] text-ink-soft">
                              {row.country}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-6 flex flex-col gap-3 pt-2">
                    <Button asChild>
                      <Link href={`/dashboard/orders/packages/${offer.slug}`}>
                        See these {offer.count} sites
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </Link>
                    </Button>
                    <Button asChild variant="outline">
                      <Link href={offer.browseHref}>Browse all matching sites</Link>
                    </Button>
                  </div>
                </article>
              ))}
            </div>

            <p className="mt-8 max-w-3xl text-[13px] leading-relaxed text-muted">
              Domains are shown to account holders. A free account is enough to see every
              site in a package and to change it before ordering; you pay only for the
              placements you keep.
            </p>
          </Container>
        </section>
      )}
    </>
  );
}
