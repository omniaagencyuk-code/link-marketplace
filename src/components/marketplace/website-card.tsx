import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DomainRating } from '@/components/shared/metric';
import { LinkTypeList } from '@/components/shared/link-type-badge';
import { VerifiedBadge } from '@/components/shared/verified-badge';
import { FavouriteButton } from './favourite-button';
import { AddToOrderButton } from './add-to-order-button';
import { WebsiteSnippet } from './website-snippet';
import { nicheName } from '@/lib/data/categories';
import { countryShortName } from '@/lib/data/countries';
import { formatCompactNumber, formatPrice, formatTurnaround } from '@/lib/utils/format';
import { linkTypeLabels } from '@/lib/utils/labels';
import { cn } from '@/lib/utils/cn';
import type { WebsiteListItem } from '@/lib/types';

/**
 * Compact stacked card used on mobile and in the grid view.
 *
 * The snippet is optional: the card is also the saved-websites card, where
 * there is no single-open state to belong to and the name should still
 * navigate. Passing `onToggleExpand` is what turns the name into a toggle.
 */
export function WebsiteCard({
  website,
  expanded = false,
  onToggleExpand,
}: {
  website: WebsiteListItem;
  expanded?: boolean;
  onToggleExpand?: () => void;
}) {
  const lead = website.headlineService;
  const snippetId = `snippet-card-${website.id}`;

  return (
    <article className="rounded-[var(--radius-card)] border border-line bg-white p-4 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-raised)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {onToggleExpand ? (
              <button
                type="button"
                onClick={onToggleExpand}
                aria-expanded={expanded}
                aria-controls={snippetId}
                className="flex min-w-0 items-center gap-1 text-left text-[15px] font-semibold text-ink hover:text-accent-700"
              >
                <ChevronDown
                  className={cn(
                    'h-4 w-4 shrink-0 text-muted transition-transform',
                    expanded && 'rotate-180',
                  )}
                  aria-hidden="true"
                />
                <span className="truncate">{website.domain}</span>
              </button>
            ) : (
              <Link
                href={`/websites/${website.slug}`}
                className="truncate text-[15px] font-semibold text-ink hover:text-accent-700"
              >
                {website.domain}
              </Link>
            )}
            {website.verified ? <VerifiedBadge /> : null}
          </div>
          {/* Clamped until the card is expanded, where the whole point is to
              see more than the list showed. */}
          <p className={cn('mt-1 text-[12px] text-muted', !expanded && 'line-clamp-2')}>
            {website.description}
          </p>
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
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href={`/websites/${website.slug}`}>View</Link>
          </Button>
          <AddToOrderButton website={website} />
        </div>
      </div>

      {onToggleExpand && expanded ? (
        <div className="mt-4 border-t border-line pt-4">
          <WebsiteSnippet id={snippetId} website={website} variant="card" />
        </div>
      ) : null}
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
