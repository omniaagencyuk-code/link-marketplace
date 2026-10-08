'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { CreditCard, LogOut, Search, UserCircle } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { useAuth } from '@/lib/providers/auth-provider';

/**
 * Search the marketplace, and who is signed in.
 *
 * ## The search is the marketplace's own
 *
 * It submits to `/marketplace?q=`, which is the parameter that page already
 * reads and which reaches `marketplace_search` in the database. No second
 * search path, no index to keep in step, and the results are the ones the
 * marketplace would have shown - which is the only way the box can be trusted
 * to mean what it says.
 *
 * ## There is no bell
 *
 * Nothing in this application produces a customer notification, and the brief
 * asked for the feature to be left out rather than drawn with a number that
 * is not a count of anything. When notifications exist, this is where one
 * goes.
 */
export function CustomerTopbar() {
  const router = useRouter();
  const { user, signOut, signingOut } = useAuth();
  const [term, setTerm] = useState('');
  const box = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

  // The keycap drawn in the box says this works, so it has to.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        box.current?.focus();
        box.current?.select();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    function onDown(event: MouseEvent) {
      if (!menu.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    function onEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onEscape);
    };
  }, [menuOpen]);

  return (
    <>
      <form
        role="search"
        className="min-w-0 flex-1"
        onSubmit={(event) => {
          event.preventDefault();
          const query = term.trim();
          router.push(query ? `/marketplace?q=${encodeURIComponent(query)}` : '/marketplace');
        }}
      >
        <label htmlFor="marketplace-search" className="sr-only">
          Search the marketplace
        </label>
        <div className="relative max-w-xl">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <input
            ref={box}
            id="marketplace-search"
            type="search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search thousands of websites, niches or topics..."
            className="h-10 w-full rounded-lg border border-line bg-surface pr-16 pl-9 text-[13px] text-ink transition-colors placeholder:text-muted-soft focus:border-accent-500 focus:bg-white focus:outline-none"
          />
          <kbd
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 rounded border border-line bg-white px-1.5 py-0.5 text-[10px] font-medium text-muted"
          >
            ⌘K
          </kbd>
        </div>
      </form>

      <div ref={menu} className="relative shrink-0">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
          className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-sunken"
        >
          <Avatar initials={user?.avatarInitials ?? '—'} tone="accent" />
          <span className="hidden min-w-0 text-left sm:block">
            <span className="block truncate text-[13px] font-medium text-ink">
              {user?.fullName ?? 'Your account'}
            </span>
            {user?.company ? (
              <span className="block truncate text-[11px] text-muted">{user.company}</span>
            ) : null}
          </span>
        </button>

        {menuOpen ? (
          <div
            role="menu"
            className="absolute right-0 z-40 mt-2 w-56 rounded-lg border border-line bg-white p-1.5 shadow-lg"
          >
            {/* Pages that exist, reached the way they are reached elsewhere. */}
            <Link
              href="/dashboard/account"
              role="menuitem"
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2 rounded-md px-2.5 py-2 text-[13px] text-ink transition-colors hover:bg-surface-sunken"
            >
              <UserCircle className="h-3.5 w-3.5" aria-hidden="true" />
              Account
            </Link>
            <Link
              href="/dashboard/billing"
              role="menuitem"
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2 rounded-md px-2.5 py-2 text-[13px] text-ink transition-colors hover:bg-surface-sunken"
            >
              <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
              Billing
            </Link>
            <button
              type="button"
              role="menuitem"
              disabled={signingOut}
              onClick={signOut}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] text-ink transition-colors hover:bg-surface-sunken disabled:opacity-60"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              {signingOut ? 'Signing out...' : 'Sign out'}
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}
