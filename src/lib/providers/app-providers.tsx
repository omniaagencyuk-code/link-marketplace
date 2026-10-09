'use client';

import type { ReactNode } from 'react';
import { AuthProvider } from './auth-provider';
import { FavouritesProvider } from './favourites-provider';
import { OrderDraftProvider } from './order-draft-provider';
import { ContentDraftProvider } from './content-draft-provider';

/**
 * Single mount point for every client-side provider the app needs.
 *
 * It took the signed-in account as a prop until the root layout stopped
 * resolving it. `AuthProvider` fetches it now, which is what allows a page
 * above this to be prerendered.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <FavouritesProvider>
        <OrderDraftProvider>
          <ContentDraftProvider>{children}</ContentDraftProvider>
        </OrderDraftProvider>
      </FavouritesProvider>
    </AuthProvider>
  );
}
