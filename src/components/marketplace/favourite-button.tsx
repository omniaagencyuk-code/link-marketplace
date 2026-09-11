'use client';

import { Bookmark } from 'lucide-react';
import { useFavourites } from '@/lib/providers/favourites-provider';
import { cn } from '@/lib/utils/cn';

export function FavouriteButton({
  websiteId,
  domain,
  className,
  size = 'sm',
}: {
  websiteId: string;
  domain: string;
  className?: string;
  size?: 'sm' | 'md';
}) {
  const { isFavourite, toggle, hydrated } = useFavourites();
  const saved = hydrated && isFavourite(websiteId);

  return (
    <button
      type="button"
      onClick={() => toggle(websiteId)}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${domain} from saved websites` : `Save ${domain}`}
      title={saved ? 'Saved' : 'Save website'}
      className={cn(
        'inline-flex items-center justify-center rounded-md transition-colors',
        size === 'sm' ? 'h-7 w-7' : 'h-9 w-9',
        saved
          ? 'bg-accent-50 text-accent-700 hover:bg-accent-100'
          : 'text-muted hover:bg-surface-sunken hover:text-ink',
        className,
      )}
    >
      <Bookmark
        className={cn(size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4')}
        fill={saved ? 'currentColor' : 'none'}
        aria-hidden="true"
      />
    </button>
  );
}
