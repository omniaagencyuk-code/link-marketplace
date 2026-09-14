'use client';

import { createContext, useContext, useMemo, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { signOutAction } from '@/app/(auth)/actions';
import type { AuthSession, UserProfile } from '@/lib/types';

/**
 * Client-side view of the signed-in account.
 *
 * The session itself is a signed, httpOnly cookie verified on the server; this
 * provider only mirrors the result so client components (the header, the
 * dashboard shell) can render the right state without a round trip. It is
 * deliberately not the source of truth: nothing here can grant access, and
 * every protected route re-checks the cookie server-side.
 */

interface AuthContextValue extends AuthSession {
  isAdmin: boolean;
  signOut: () => void;
  signingOut: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  children,
  user,
}: {
  children: ReactNode;
  /** Resolved from the session cookie in the root layout. */
  user: UserProfile | null;
}) {
  const router = useRouter();
  const [signingOut, startSignOut] = useTransition();

  const contextValue = useMemo<AuthContextValue>(
    () => ({
      user,
      status: user ? 'authenticated' : 'unauthenticated',
      isAdmin: user?.role === 'admin',
      signingOut,
      signOut: () => {
        startSignOut(async () => {
          await signOutAction();
          router.refresh();
        });
      },
    }),
    [user, signingOut, router],
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
