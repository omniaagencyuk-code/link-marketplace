'use client';

import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useLocalStorage } from '@/lib/hooks/use-local-storage';
import { storageKey } from '@/lib/config/brand';

const STORAGE_KEY = storageKey('favourites.v1');

interface FavouritesContextValue {
  favourites: string[];
  isFavourite: (websiteId: string) => boolean;
  toggle: (websiteId: string) => void;
  remove: (websiteId: string) => void;
  clear: () => void;
  count: number;
  hydrated: boolean;
}

const FavouritesContext = createContext<FavouritesContextValue | null>(null);

/**
 * Saved websites.
 *
 * Persisted to localStorage for now. When Supabase Auth lands, swap the
 * storage calls for the `favourites` table - the consumer API stays the same.
 */
export function FavouritesProvider({ children }: { children: ReactNode }) {
  const { value: favourites, setValue, hydrated } = useLocalStorage<string[]>(STORAGE_KEY, []);

  const toggle = useCallback(
    (websiteId: string) => {
      setValue((current) =>
        current.includes(websiteId)
          ? current.filter((id) => id !== websiteId)
          : [websiteId, ...current],
      );
    },
    [setValue],
  );

  const remove = useCallback(
    (websiteId: string) => setValue((current) => current.filter((id) => id !== websiteId)),
    [setValue],
  );

  const value = useMemo<FavouritesContextValue>(
    () => ({
      favourites,
      isFavourite: (websiteId: string) => favourites.includes(websiteId),
      toggle,
      remove,
      clear: () => setValue([]),
      count: favourites.length,
      hydrated,
    }),
    [favourites, toggle, remove, setValue, hydrated],
  );

  return <FavouritesContext.Provider value={value}>{children}</FavouritesContext.Provider>;
}

export function useFavourites() {
  const context = useContext(FavouritesContext);
  if (!context) throw new Error('useFavourites must be used inside <FavouritesProvider>');
  return context;
}
