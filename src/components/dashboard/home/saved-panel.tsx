'use client';

import Link from 'next/link';
import { Bookmark } from 'lucide-react';
import { useFavourites } from '@/lib/providers/favourites-provider';
import { useListings } from '@/lib/hooks/use-listings';
import { formatCompactNumber, formatPrice } from '@/lib/utils/format';
import { PanelEmpty } from './cards';
import { SiteMark } from './site-mark';

/**
 * The shortlist, on the dashboard.
 *
 * A client island because the shortlist is a client fact: saved sites live in
 * this browser's storage, not in the database. `favourites-provider` says so
 * and says what would change if they moved. Until they do, nothing on the
 * server knows which sites a customer has saved - which is also why they
 * cannot be a signal for recommendations.
 *
 * The listings behind the ids are fetched once the browser knows which they
 * are, through the same batched, capped fetch the saved page uses.
 */
export function SavedPanel({ limit = 5 }: { limit?: number }) {
  const { favourites, hydrated } = useFavourites();
  const wanted = favourites.slice(0, limit);
  const { items, loading } = useListings(wanted, hydrated);

  if (!hydrated || loading) {
    return (
      <ul className="divide-y divide-line">
        {Array.from({ length: 3 }).map((_, index) => (
          <li key={index} className="flex items-center gap-3 px-5 py-3">
            <span className="h-8 w-8 shrink-0 rounded-lg bg-surface-sunken" />
            <span className="h-3 flex-1 rounded bg-surface-sunken" />
            <span className="h-3 w-12 rounded bg-surface-sunken" />
          </li>
        ))}
      </ul>
    );
  }

  if (items.length === 0) {
    return (
      <PanelEmpty
        icon={Bookmark}
        title="No saved websites yet"
        body="Browse the marketplace and save the publishers you like. They will be waiting here."
        action={{ label: 'Browse websites', href: '/marketplace' }}
      />
    );
  }

  return (
    <ul className="divide-y divide-line">
      {items.map((website) => (
        <li key={website.id}>
          <Link
            href={`/websites/${website.slug}`}
            className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-sunken"
          >
            <SiteMark domain={website.domain} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-ink">
                {website.domain}
              </span>
              <span className="tabular block truncate text-[11px] text-muted">
                DR {website.metrics.domainRating} &middot;{' '}
                {formatCompactNumber(website.metrics.organicTraffic)} traffic
              </span>
            </span>
            <span className="tabular shrink-0 text-[13px] font-semibold text-ink">
              {website.headlineService ? formatPrice(website.headlineService.priceMinor) : '—'}
            </span>
            <Bookmark
              className="h-4 w-4 shrink-0 fill-accent-600 text-accent-600"
              aria-label="Saved"
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}
