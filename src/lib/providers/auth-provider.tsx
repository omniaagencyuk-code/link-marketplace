'use client';

import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useLocalStorage } from '@/lib/hooks/use-local-storage';
import { mockAdmin, mockCustomer } from '@/lib/data/users';
import type { AuthSession, UserProfile } from '@/lib/types';

const STORAGE_KEY = 'linkmarket.auth.v1';

/** Mock auth is on by default in development so the app is explorable. */
const mockAuthEnabled = process.env.NEXT_PUBLIC_ENABLE_MOCK_AUTH !== 'false';

interface StoredAuth {
  userId: string | null;
}

interface AuthContextValue extends AuthSession {
  isAdmin: boolean;
  /**
   * Placeholder sign-in. Replace the body with
   * `supabase.auth.signInWithPassword({ email, password })`.
   */
  signIn: (email?: string) => Promise<UserProfile>;
  signUp: (email?: string) => Promise<UserProfile>;
  signOut: () => Promise<void>;
  /** Development helper - switch between the customer and admin fixtures. */
  signInAsAdmin: () => Promise<UserProfile>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { value, setValue, hydrated } = useLocalStorage<StoredAuth>(STORAGE_KEY, {
    userId: mockAuthEnabled ? mockCustomer.id : null,
  });

  const user = useMemo<UserProfile | null>(() => {
    if (!value.userId) return null;
    if (value.userId === mockAdmin.id) return mockAdmin;
    return mockCustomer;
  }, [value.userId]);

  const signIn = useCallback(
    async (email?: string) => {
      const profile = email && email.endsWith('@linkmarket.io') ? mockAdmin : mockCustomer;
      setValue({ userId: profile.id });
      return profile;
    },
    [setValue],
  );

  const contextValue = useMemo<AuthContextValue>(
    () => ({
      user,
      status: !hydrated ? 'loading' : user ? 'authenticated' : 'unauthenticated',
      isAdmin: user?.role === 'admin',
      signIn,
      signUp: signIn,
      signOut: async () => setValue({ userId: null }),
      signInAsAdmin: async () => {
        setValue({ userId: mockAdmin.id });
        return mockAdmin;
      },
    }),
    [user, hydrated, signIn, setValue],
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
