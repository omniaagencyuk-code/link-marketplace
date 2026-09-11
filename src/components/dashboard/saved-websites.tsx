'use client';

import Link from 'next/link';
import { Bookmark } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { WebsiteCard } from '@/components/marketplace/website-card';
import { useFavourites } from '@/lib/providers/favourites-provider';
import { formatPrice } from '@/lib/utils/format';
import type { WebsiteListItem } from '@/lib/types';

export function SavedWebsites({ websites }: { websites: WebsiteListItem[] }) {
  const { favourites, hydrated, clear } = useFavourites();

  if (!hydrated) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="h-48 animate-pulse rounded-[var(--radius-card)] border border-line bg-white"
          />
        ))}
      </div>
    );
  }

  const saved = favourites
    .map((id) => websites.find((website) => website.id === id))
    .filter((website): website is WebsiteListItem => Boolean(website));

  if (saved.length === 0) {
    return (
      <EmptyState
        icon={Bookmark}
        title="Nothing saved yet"
        description="Use the bookmark button on any marketplace listing to build a shortlist you can come back to."
        action={
          <Button asChild variant="accent">
            <Link href="/websites">Browse websites</Link>
          </Button>
        }
      />
    );
  }

  const total = saved.reduce((sum, website) => sum + website.headlinePriceMinor, 0);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-line bg-white px-4 py-3 shadow-[var(--shadow-card)]">
        <p className="text-[13px] text-ink-soft">
          <span className="font-semibold text-ink">{saved.length}</span> saved
          <span className="tabular ml-2 text-muted">
            {formatPrice(total)} to place one link on each
          </span>
        </p>
        <Button variant="ghost" size="sm" onClick={clear}>
          Clear all
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {saved.map((website) => (
          <WebsiteCard key={website.id} website={website} />
        ))}
      </div>
    </>
  );
}
