'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DomainRating } from '@/components/shared/metric';
import { AddToOrderButton } from './add-to-order-button';
import { formatNumber, formatPrice, formatTurnaround } from '@/lib/utils/format';
import { linkTypeLabels } from '@/lib/utils/labels';
import { cn } from '@/lib/utils/cn';
import type { WebsiteListItem } from '@/lib/types';

/**
 * The inline snippet under an expanded marketplace row.
 *
 * Everything here is already on the row or already on the listing page - the
 * description untruncated, the same four metrics at a readable size, and the
 * prices for each placement the publisher offers. It buys the reader a
 * decision without a page load, and it is not a second detail page: anything
 * that needs more than a glance is behind "View full details".
 *
 * Shared by the table and the card so the two cannot drift apart.
 */
export function WebsiteSnippet({
  website,
  className,
  id,
  variant = 'row',
}: {
  website: WebsiteListItem;
  className?: string;
  id?: string;
  /**
   * What the surrounding element already shows.
   *
   * A table row truncates the domain and the description to one line each and
   * has no room for a readable metric, so the snippet carries all three. A
   * card already shows the domain in full, the description (unclamped once
   * expanded) and the same four metrics an inch higher up; repeating them
   * there reads as a rendering fault, so the card gets prices and buttons.
   */
  variant?: 'row' | 'card';
}) {
  const full = variant === 'row';
  const lead = website.headlineService;

  // Only what is actually for sale at an actual price. A service with no price
  // set is not a free placement, it is an unanswered question, and listing it
  // at zero would read as the former.
  const priced = website.services.filter(
    (service) => service.available && service.priceMinor > 0,
  );

  return (
    <div
      id={id}
      className={cn(
        'grid gap-5',
        full && 'lg:grid-cols-[minmax(0,1fr)_260px]',
        className,
      )}
    >
      <div className="min-w-0 space-y-4 empty:hidden">
        {full ? (
          <div>
            <h3 className="text-[14px] font-semibold break-all text-ink">{website.domain}</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{website.description}</p>
          </div>
        ) : null}

        {full ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            <Stat label="Domain Rating">
              <DomainRating value={website.metrics.domainRating} className="text-[13px]" />
            </Stat>
            <Stat label="Organic traffic">
              <Value>{formatNumber(website.metrics.organicTraffic)}</Value>
            </Stat>
            <Stat label="Ref. domains">
              <Value>{formatNumber(website.metrics.referringDomains)}</Value>
            </Stat>
            <Stat label="Turnaround">
              <Value>
                {lead ? formatTurnaround(lead.turnaroundMinDays, lead.turnaroundMaxDays) : '—'}
              </Value>
            </Stat>
          </dl>
        ) : null}
      </div>

      <div className={cn('space-y-4', full && 'lg:border-l lg:border-line lg:pl-5')}>
        <div>
          <h4 className="text-[11px] font-semibold tracking-[0.04em] text-muted uppercase">
            Pricing
          </h4>
          {priced.length === 0 ? (
            <p className="mt-2 text-[13px] text-muted">No prices published for this site yet.</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {priced.map((service) => (
                <li key={service.id} className="flex items-baseline justify-between gap-3">
                  <span className="text-[13px] text-ink-soft">
                    {linkTypeLabels[service.type]}
                  </span>
                  <span className="tabular text-[14px] font-semibold text-ink">
                    {formatPrice(service.priceMinor)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <AddToOrderButton website={website} prominent fullWidth />
          <Button asChild variant="outline" size="sm" className="w-full">
            <Link href={`/websites/${website.slug}`}>
              View full details
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] font-medium tracking-wide text-muted uppercase">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}

function Value({ children }: { children: React.ReactNode }) {
  return <span className="tabular text-[15px] font-semibold text-ink">{children}</span>;
}
