'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { signOutAction } from '@/app/(auth)/actions';
import type { AuthSession, UserProfile } from '@/lib/types';

/**
 * Client-side view of the signed-in account.
 *
 * The session itself is a signed, httpOnly cookie verified on the server; this
 * provider only mirrors the result so client components (the header, the
 * dashboard shell) can render the right state. It is deliberately not the
 * source of truth: nothing here can grant access, and every protected route
 * re-checks the cookie server-side.
 *
 * ## Why it is fetched rather than handed in
 *
 * The root layout used to resolve the session and pass it down. That is one
 * fewer request and it was the right shape until it was measured: reading a
 * cookie in the root layout makes every page in the application
 * personalised, and a personalised page cannot be prerendered. It is why 96
 * of 99 routes were rendered from scratch on every request - the homepage,
 * the pricing page and the terms among them - and why the homepage took
 * seconds to answer.
 *
 * So the account arrives a moment after the page does. `status` carries
 * `'loading'` for that moment, which the type has always allowed, and
 * consumers show a neutral state rather than guessing: a header that says
 * "Log in" before correcting itself is worse than one that says nothing
 * yet, because the first is wrong and the second is only incomplete.
 */

interface AuthContextValue extends AuthSession {
  isAdmin: boolean;
  signOut: () => void;
  signingOut: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [signingOut, startSignOut] = useTransition();

  /*
    `undefined` until the answer arrives, `null` once it is known to be
    nobody. Two states rather than one, so "signed out" is something that
    was established rather than the absence of news.
  */
  const [user, setUser] = useState<UserProfile | null | undefined>(undefined);

  /*
    Re-checked on navigation, but only while nobody is signed in.

    Signing in is a server action that ends in `redirect()`, which the client
    follows as a soft navigation - the root layout is not remounted, so an
    effect that ran once on mount would never learn that there is now an
    account, and the header would stay signed out until a full reload.

    Depending on the path covers that, and depending on `user` keeps it
    cheap: once somebody is known to be signed in, this stops asking.
    Signing out sets the state directly, so it does not need a request
    either. What is left is one small request per navigation for a
    signed-out visitor, which does not block anything - the page is already
    on screen - and is the price of the header being right after a sign-in
    that lands anywhere other than the dashboard.
  */
  const pathname = usePathname();

  /*
    One request per path, not two.

    `user` has to be a dependency - the effect must stop asking once
    somebody is signed in - but it changes from `undefined` to `null` when
    the first answer comes back, and `null` is still falsy, so the effect
    ran a second time and asked again. Two requests on every page load,
    both returning the same thing, which the browser showed and nothing
    else would have.

    A ref rather than more state: remembering what was already asked must
    not itself cause a render.
  */
  const askedFor = useRef<string | null>(null);

  useEffect(() => {
    if (user) return;
    if (askedFor.current === pathname) return;
    askedFor.current = pathname;

    let live = true;
    fetch('/api/me', { credentials: 'same-origin' })
      .then((response) => (response.ok ? response.json() : { user: null }))
      .then((body: { user: UserProfile | null }) => {
        if (live) setUser(body.user ?? null);
      })
      // A failed request is not a signed-out visitor, but it has to resolve
      // to something or the header waits for ever. Signed out is the safe
      // reading: it offers a way in rather than pretending to be signed in.
      .catch(() => {
        if (live) setUser(null);
      });
    return () => {
      live = false;
    };
  }, [pathname, user]);

  const contextValue = useMemo<AuthContextValue>(
    () => ({
      user: user ?? null,
      status: user === undefined ? 'loading' : user ? 'authenticated' : 'unauthenticated',
      isAdmin: user?.role === 'admin',
      signingOut,
      signOut: () => {
        startSignOut(async () => {
          await signOutAction();
          // Locally first, so the header changes immediately rather than
          // after the refetch; the server cookie is already gone.
          setUser(null);
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
