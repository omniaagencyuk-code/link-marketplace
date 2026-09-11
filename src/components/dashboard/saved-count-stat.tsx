'use client';

import { Bookmark } from 'lucide-react';
import { Stat } from '@/components/ui/stat';
import { useFavourites } from '@/lib/providers/favourites-provider';

/** Reads the client-side favourites store, so it renders as a client island. */
export function SavedCountStat() {
  const { count, hydrated } = useFavourites();
  return (
    <Stat
      label="Saved sites"
      value={hydrated ? String(count) : '—'}
      hint="Shortlisted for later"
      icon={Bookmark}
    />
  );
}
