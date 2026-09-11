import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { DomainRating } from '@/components/shared/metric';
import { LinkTypeList } from '@/components/shared/link-type-badge';
import { VerifiedBadge } from '@/components/shared/verified-badge';
import { FavouriteButton } from '@/components/marketplace/favourite-button';
import { nicheName } from '@/lib/data/categories';
import { countryShortName } from '@/lib/data/countries';
import { formatCompactNumber, formatPrice } from '@/lib/utils/format';
import type { WebsiteListItem } from '@/lib/types';

/** Compact featured rows - no screenshots, metrics first. */
export function FeaturedWebsites({ websites }: { websites: WebsiteListItem[] }) {
  return (
    <section className="border-b border-line bg-white py-14 lg:py-18">
      <Container size="wide">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Featured websites
            </h2>
            <p className="mt-2 max-w-xl text-[15px] text-muted">
              A sample of the inventory. Every listing shows live metrics, link types and a fixed
              price before you order.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/websites">
              Browse all websites
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        <ul className="mt-8 divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line shadow-[var(--shadow-card)]">
          {websites.map((website) => (
            <li
              key={website.id}
              className="grid grid-cols-2 items-center gap-x-4 gap-y-3 bg-white px-4 py-4 transition-colors hover:bg-surface lg:grid-cols-[minmax(0,2.2fr)_repeat(4,minmax(0,1fr))_auto] lg:gap-6"
            >
              <div className="col-span-2 min-w-0 lg:col-span-1">
                <div className="flex items-center gap-1.5">
                  <Link
                    href={`/websites/${website.slug}`}
                    className="truncate text-[15px] font-semibold text-ink hover:text-accent-700"
                  >
                    {website.domain}
                  </Link>
                  {website.verified ? <VerifiedBadge /> : null}
                </div>
                <p className="mt-0.5 truncate text-[12px] text-muted">
                  {nicheName(website.niche)} &middot; {countryShortName(website.country)} &middot;{' '}
                  {website.description}
                </p>
              </div>

              <Field label="DR">
                <DomainRating value={website.metrics.domainRating} />
              </Field>
              <Field label="Organic traffic">
                <span className="tabular text-[13px] font-medium text-ink">
                  {formatCompactNumber(website.metrics.organicTraffic)}
                </span>
              </Field>
              <Field label="Ref. domains">
                <span className="tabular text-[13px] font-medium text-ink">
                  {formatCompactNumber(website.metrics.referringDomains)}
                </span>
              </Field>
              <Field label="Link type">
                <LinkTypeList types={website.availableLinkTypes} max={2} />
              </Field>

              <div className="col-span-2 flex items-center justify-between gap-3 lg:col-span-1 lg:justify-end">
                <span className="tabular text-[15px] font-semibold text-ink">
                  {formatPrice(website.headlinePriceMinor)}
                </span>
                <div className="flex items-center gap-1">
                  <FavouriteButton websiteId={website.id} domain={website.domain} />
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/websites/${website.slug}`}>View details</Link>
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-medium tracking-wide text-muted uppercase lg:hidden">
        {label}
      </p>
      <div className="mt-0.5 lg:mt-0">{children}</div>
    </div>
  );
}
