import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageTitle } from '@/components/dashboard/page-title';
import { AddPackageToOrder } from '@/components/dashboard/add-package-to-order';
import { Button } from '@/components/ui/button';
import { packageBySlug } from '@/lib/config/packages';
import { packageContents } from '@/lib/services/package-offers';
import { packageHref } from '@/lib/packages/rules';
import { requireCustomerSession } from '@/lib/auth/customer-access';
import { formatPrice } from '@/lib/utils/format';
import type { DraftOrderItem } from '@/lib/types';

/*
  Never cached. The sites in a package are whichever ones match today, and a
  cached copy would offer a buyer a basket of listings that have since been
  paused or repriced - which `priceBasket` would then reject at checkout,
  having shown them the old figure the whole way through.
*/
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Package' };

export default async function PackagePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const pkg = packageBySlug(slug);
  if (!pkg) notFound();

  await requireCustomerSession(`/dashboard/orders/packages/${slug}`);

  const contents = await packageContents(pkg);
  // Not fillable right now. A page offering seven of a promised ten is worse
  // than one that says the package is unavailable.
  if (!contents) notFound();

  const { lines, totalMinor } = contents;

  /*
    No target URL and no anchor text, on purpose. Both are the buyer's to
    write and the basket will not submit a line without them, so a package
    hands over an order to finish rather than one to pay for.
  */
  const draftLines: Omit<DraftOrderItem, 'id' | 'addedAt'>[] = lines.map((line) => ({
    websiteId: line.item.id,
    websiteSlug: line.item.slug,
    websiteDomain: line.item.domain,
    serviceType: line.service.type,
    priceMinor: line.service.priceMinor,
    targetUrl: '',
    anchorText: '',
  }));

  return (
    <div className="space-y-8">
      <PageTitle
        title={`${pkg.name} package`}
        description={`${pkg.count} placements, ${formatPrice(totalMinor)} in total. Remove anything you do not want before you order.`}
      />

      <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-white">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">
            The {pkg.count} sites in the {pkg.name} package
          </caption>
          <thead className="bg-surface">
            <tr>
              {['Website', 'Service', 'DR', 'Traffic', 'Market', 'Price'].map((head) => (
                <th
                  key={head}
                  scope="col"
                  className="px-4 py-2.5 text-[11px] font-semibold tracking-wide text-muted uppercase"
                >
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.item.id} className="border-t border-line">
                <td className="px-4 py-3 text-[14px] font-medium text-ink">
                  <Link
                    href={`/websites/${line.item.slug}`}
                    className="hover:text-accent-700"
                  >
                    {line.item.domain}
                  </Link>
                </td>
                <td className="px-4 py-3 text-[14px] text-ink-soft">
                  {line.service.type}
                </td>
                <td className="tabular px-4 py-3 text-[14px] text-ink-soft">
                  {line.item.metrics.domainRating}
                </td>
                <td className="tabular px-4 py-3 text-[14px] text-ink-soft">
                  {line.item.metrics.organicTraffic}
                </td>
                <td className="px-4 py-3 text-[14px] text-ink-soft">
                  {line.item.country ?? '—'}
                </td>
                <td className="tabular px-4 py-3 text-[14px] text-ink-soft">
                  {formatPrice(line.service.priceMinor)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-line-strong bg-surface">
              <td colSpan={5} className="px-4 py-3 text-[14px] font-semibold text-ink">
                Total
              </td>
              <td className="tabular px-4 py-3 text-[14px] font-semibold text-ink">
                {formatPrice(totalMinor)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <AddPackageToOrder lines={draftLines} count={lines.length} />
        <Button asChild variant="outline">
          <Link href={packageHref(pkg)}>Browse all matching sites</Link>
        </Button>
      </div>

      <p className="max-w-2xl text-[13px] leading-relaxed text-muted">
        Adding puts these placements in your order, where you give each one a target URL
        and anchor text before checking out. A site already in your order is not added
        again. Prices are confirmed against the marketplace when you check out.
      </p>
    </div>
  );
}
