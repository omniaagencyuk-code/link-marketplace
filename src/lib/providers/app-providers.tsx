'use client';

import type { ReactNode } from 'react';
import { AuthProvider } from './auth-provider';
import { FavouritesProvider } from './favourites-provider';
import { OrderDraftProvider } from './order-draft-provider';
import { ContentDraftProvider } from './content-draft-provider';
import type { UserProfile } from '@/lib/types';

/** Single mount point for every client-side provider the app needs. */
export function AppProviders({
  children,
  user,
}: {
  children: ReactNode;
  /** The server-verified account, resolved in the root layout. */
  user: UserProfile | null;
}) {
  return (
    <AuthProvider user={user}>
      <FavouritesProvider>
        <OrderDraftProvider>
          <ContentDraftProvider>{children}</ContentDraftProvider>
        </OrderDraftProvider>
      </FavouritesProvider>
    </AuthProvider>
  );
}
