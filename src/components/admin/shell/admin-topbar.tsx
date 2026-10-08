'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { LogOut, Search } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { signOutAdminAction } from '@/app/admin/login/actions';
import { initialsFromName } from '@/lib/utils/format';

/**
 * Search, and who is signed in.
 *
 * ## What the search actually searches
 *
 * The website list, because that is the search this application has. There is
 * no global index over orders, customers, pages and posts, and building one is
 * its own piece of work rather than a side effect of a restyle.
 *
 * So the box says what it does. A control labelled "Search websites, orders,
 * users, content" that only finds websites is worse than a narrower one: it
 * teaches somebody that their order is not in the system when it is. The
 * placeholder names the thing it searches, and the rest is a listed
 * limitation rather than a silent one.
 *
 * It submits to the admin website list with the term already applied, so it
 * uses the paged, server-side search that list already runs - no second query
 * path, and no result set this component has to hold.
 */
export function AdminTopbar({ email }: { email: string }) {
  const router = useRouter();
  const [term, setTerm] = useState('');
  const box = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

  /*
    Cmd-K focuses the box, which is what the hint in it claims.

    The hint is drawn whether or not the shortcut works, so the shortcut has
    to exist: a keycap printed in an input that does nothing is the same class
    of thing as a button that does nothing.
  */
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

  // Closed by a click anywhere else, which is what a menu with no backdrop
  // needs if it is not to be dismissable only by pressing the button again.
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

  const name = email.split('@')[0] ?? email;

  return (
    <>
      <form
        role="search"
        className="min-w-0 flex-1"
        onSubmit={(event) => {
          event.preventDefault();
          const query = term.trim();
          router.push(query ? `/admin/websites?q=${encodeURIComponent(query)}` : '/admin/websites');
        }}
      >
        <label htmlFor="admin-global-search" className="sr-only">
          Search websites
        </label>
        <div className="relative max-w-xl">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <input
            ref={box}
            id="admin-global-search"
            type="search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search websites by domain, title or niche..."
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
          <Avatar initials={initialsFromName(name.replace(/[._-]/g, ' '))} tone="accent" />
          <span className="hidden min-w-0 text-left sm:block">
            <span className="block truncate text-[13px] font-medium text-ink capitalize">
              {name}
            </span>
            <span className="block truncate text-[11px] text-muted">Administrator</span>
          </span>
        </button>

        {menuOpen ? (
          <div
            role="menu"
            className="absolute right-0 z-40 mt-2 w-60 rounded-lg border border-line bg-white p-1.5 shadow-lg"
          >
            <p className="truncate px-2.5 py-2 text-[12px] text-muted">{email}</p>
            <form action={signOutAdminAction}>
              <button
                type="submit"
                role="menuitem"
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] text-ink transition-colors hover:bg-surface-sunken"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                Sign out
              </button>
            </form>
          </div>
        ) : null}
      </div>
    </>
  );
}
