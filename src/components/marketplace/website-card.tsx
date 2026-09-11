import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { DomainRating } from '@/components/shared/metric';
import { LinkTypeList } from '@/components/shared/link-type-badge';
import { VerifiedBadge } from '@/components/shared/verified-badge';
import { FavouriteButton } from './favourite-button';
import { nicheName } from '@/lib/data/categories';
import { countryShortName } from '@/lib/data/countries';
import { formatCompactNumber, formatPrice, formatTurnaround } from '@/lib/utils/format';
import { linkTypeLabels } from '@/lib/utils/labels';
import type { WebsiteListItem } from '@/lib/types';

/** Compact stacked card used on mobile and in the grid view. */
export function WebsiteCard({ website }: { website: WebsiteListItem }) {
  const lead = website.headlineService;

  return (
    <article className="rounded-[var(--radius-card)] border border-line bg-white p-4 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-raised)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Link
              href={`/websites/${website.slug}`}
              className="truncate text-[15px] font-semibold text-ink hover:text-accent-700"
            >
              {website.domain}
            </Link>
            {website.verified ? <VerifiedBadge /> : null}
          </div>
          <p className="mt-1 line-clamp-2 text-[12px] text-muted">{website.description}</p>
        </div>
        <FavouriteButton websiteId={website.id} domain={website.domain} />
      </div>

      <dl className="mt-3.5 grid grid-cols-4 gap-2 border-y border-line py-3">
        <Metric label="DR">
          <DomainRating value={website.metrics.domainRating} />
        </Metric>
        <Metric label="Traffic">
          <span className="tabular text-[13px] font-semibold text-ink">
            {formatCompactNumber(website.metrics.organicTraffic)}
          </span>
        </Metric>
        <Metric label="Ref. domains">
          <span className="tabular text-[13px] font-semibold text-ink">
            {formatCompactNumber(website.metrics.referringDomains)}
          </span>
        </Metric>
        <Metric label="Turnaround">
          <span className="tabular text-[13px] font-semibold whitespace-nowrap text-ink">
            {lead ? formatTurnaround(lead.turnaroundMinDays, lead.turnaroundMaxDays) : '—'}
          </span>
        </Metric>
      </dl>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[12px] text-muted">
        <span>{nicheName(website.niche)}</span>
        <span aria-hidden="true">&middot;</span>
        <span>{countryShortName(website.country)}</span>
        <LinkTypeList types={website.availableLinkTypes} />
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div>
          <span className="tabular text-[17px] font-semibold text-ink">
            {formatPrice(website.headlinePriceMinor)}
          </span>
          {lead ? (
            <span className="ml-1.5 text-[11px] text-muted">{linkTypeLabels[lead.type]}</span>
          ) : null}
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href={`/websites/${website.slug}`}>View details</Link>
        </Button>
      </div>
    </article>
  );
}

function Metric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] font-medium tracking-wide text-muted uppercase">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}
