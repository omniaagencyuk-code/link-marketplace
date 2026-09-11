'use client';

import type { ReactNode } from 'react';
import { AuthProvider } from './auth-provider';
import { FavouritesProvider } from './favourites-provider';
import { OrderDraftProvider } from './order-draft-provider';

/** Single mount point for every client-side provider the app needs. */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <FavouritesProvider>
        <OrderDraftProvider>{children}</OrderDraftProvider>
      </FavouritesProvider>
    </AuthProvider>
  );
}
