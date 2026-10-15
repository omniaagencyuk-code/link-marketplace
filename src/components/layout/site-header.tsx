'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Bookmark, ChevronDown, LayoutDashboard, Menu, Search, ShoppingBag, X } from 'lucide-react';
import { Logo } from './logo';
import { Container } from './container';
import { Button } from '@/components/ui/button';
import { defaultMenu } from '@/lib/navigation/defaults';
import type { MenuNode } from '@/lib/navigation/menus';
import { useAuth } from '@/lib/providers/auth-provider';
import { useFavourites } from '@/lib/providers/favourites-provider';
import { useOrderDraft } from '@/lib/providers/order-draft-provider';
import { useContentDraft } from '@/lib/providers/content-draft-provider';
import { cn } from '@/lib/utils/cn';

/**
 * The site header, drawn from a menu it is given.
 *
 * The two menus arrive as props rather than being imported, because they are
 * editable: `siteMenus()` reads the stored ones in the layout above and falls
 * back to the arrays in `config/navigation.ts`. The defaults here are the
 * same fallback again, for the handful of callers - and the tests - that have
 * no menu to hand. A header that imported the config directly would be a
 * header no edit could reach.
 *
 * Which of the two is drawn is decided here rather than in the layout,
 * because only this component knows whether there is an account: the session
 * is fetched in the browser, so a server layout rendering one menu or the
 * other would have to be dynamic to do it.
 */
export function SiteHeader({
  signedOut = defaultMenu('header-signed-out'),
  signedIn = defaultMenu('header-signed-in'),
}: {
  signedOut?: MenuNode[];
  signedIn?: MenuNode[];
} = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, status } = useAuth();
  const { count: favouriteCount, hydrated: favouritesReady } = useFavourites();
  const { count: draftCount } = useOrderDraft();
  const { count: contentCount } = useContentDraft();
  const [menuOpen, setMenuOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<number | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [term, setTerm] = useState('');
  const navRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Close the menus when the route changes. Adjusting state during render is
  // React's recommended alternative to a pathname effect.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (lastPathname !== pathname) {
    setLastPathname(pathname);
    setMenuOpen(false);
    setOpenGroup(null);
    setSearchOpen(false);
  }

  // A dropdown should close when focus or a click leaves it entirely.
  useEffect(() => {
    // `=== null`, not `!openGroup`: the first item's index is 0, and a
    // falsy check would leave the first dropdown unable to be dismissed.
    if (openGroup === null) return;
    function handlePointerDown(event: MouseEvent) {
      if (!navRef.current?.contains(event.target as Node)) setOpenGroup(null);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpenGroup(null);
    }
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openGroup]);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  /*
    An item with no destination is never the current page, and `/` is only
    ever itself. Both matter now that the menu is editable: `''` and `'/'`
    are both prefixes of every path on the site, so without these two lines a
    footer-style heading or a link to the homepage would light up every item
    in the header at once.
  */
  const isActive = (href: string) => {
    if (!href) return false;
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  /*
    Saved sites live in localStorage, so until the store has been read the
    count is not zero - it is unknown. Rendering "Saved Sites 0" through that
    moment and correcting it reads as a site that lost the shortlist, the same
    reason the login button is held back below.
  */
  const savedShown = favouritesReady && favouriteCount > 0;

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    const query = term.trim();
    router.push(query ? `/marketplace?q=${encodeURIComponent(query)}` : '/marketplace');
    setSearchOpen(false);
  }

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/85 backdrop-blur-md">
      <Container size="wide">
        <div className="flex h-16 items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-8">
            <Logo />

            <nav
              ref={navRef}
              aria-label="Main"
              className="hidden items-center gap-0.5 lg:flex"
            >
              {/*
                Both menus go through `NavEntry`, which was the signed-out
                one's component. There is nothing special about a member
                link except that nobody has given it children yet - and if
                somebody does, it gets a dropdown rather than being silently
                flattened.

                Keyed and tracked by position, not by label: two items may
                share a label once an editor owns the list, and a dropdown
                keyed on one of them would open both.
              */}
              {(user ? signedIn : signedOut).map((item, index) => (
                <NavEntry
                  key={`${index}-${item.label}`}
                  item={item}
                  active={isActive(item.href)}
                  open={openGroup === index}
                  onToggle={() => setOpenGroup((current) => (current === index ? null : index))}
                />
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-1.5">
            {user ? (
              <>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Search the marketplace"
                  aria-expanded={searchOpen}
                  onClick={() => setSearchOpen((value) => !value)}
                >
                  <Search className="h-4 w-4" />
                </Button>
                {/*
                  Saved sites, named rather than guessed at.

                  It was a bookmark glyph with a dot on it, which tells you
                  there are some of something. The count is worth showing
                  because it is the one number on this page that is the
                  customer's own, so above `xl` - where the nav leaves the
                  room - it reads "Saved Sites 12". Narrower than that the
                  label is dropped and the dot comes back.

                  Both counts are rendered and one is hidden by breakpoint.
                  `display: none` takes an element out of the accessibility
                  tree as well as the layout, so a screen reader reads the
                  number once, not twice.
                */}
                <Link
                  href="/dashboard/saved"
                  aria-label={
                    favouritesReady
                      ? `Saved sites (${favouriteCount})`
                      : 'Saved sites'
                  }
                  className="relative hidden h-8 items-center justify-center gap-1.5 rounded-md px-2 text-ink-soft transition-colors hover:bg-surface-sunken hover:text-ink sm:inline-flex xl:px-2.5"
                >
                  <Bookmark
                    className="h-4 w-4 shrink-0"
                    fill={savedShown ? 'currentColor' : 'none'}
                    aria-hidden="true"
                  />
                  <span className="hidden text-sm font-medium whitespace-nowrap xl:inline">
                    Saved Sites
                  </span>
                  {savedShown ? (
                    <>
                      <CountDot value={favouriteCount} className="xl:hidden" />
                      <span className="tabular hidden rounded-full bg-accent-50 px-1.5 py-0.5 text-[11px] font-semibold text-accent-700 xl:inline-block">
                        {favouriteCount > 99 ? '99+' : favouriteCount}
                      </span>
                    </>
                  ) : null}
                </Link>
                <Link
                  href="/dashboard/orders"
                  aria-label={`Order draft (${draftCount + contentCount} items)`}
                  className="relative hidden h-8 w-8 items-center justify-center rounded-md text-ink-soft transition-colors hover:bg-surface-sunken hover:text-ink sm:inline-flex"
                >
                  <ShoppingBag className="h-4 w-4" />
                  {draftCount + contentCount > 0 ? (
                    <CountDot value={draftCount + contentCount} />
                  ) : null}
                </Link>
                <Button asChild variant="outline" size="sm" className="ml-1 hidden sm:inline-flex">
                  <Link href="/dashboard">
                    <LayoutDashboard className="h-3.5 w-3.5" />
                    Dashboard
                  </Link>
                </Button>
              </>
            ) : status === 'loading' ? (
              /*
                Held, not guessed.

                The account is fetched after the page arrives, so for a
                moment nobody knows whether there is one. Rendering "Log in"
                through that moment would be wrong for anybody signed in,
                and they would watch it correct itself - which reads as a
                site that forgot them. A space the right size says nothing
                and moves nothing, and resolves within a few hundred
                milliseconds either way.
              */
              <div
                aria-hidden="true"
                className="hidden h-8 w-[9.5rem] animate-pulse rounded-md bg-surface-sunken sm:block"
              />
            ) : (
              <div className="hidden items-center gap-1.5 sm:flex">
                <Button asChild variant="ghost" size="sm">
                  <Link href="/login">Log in</Link>
                </Button>
                <Button asChild variant="accent" size="sm">
                  <Link href="/signup">Get started</Link>
                </Button>
              </div>
            )}

            <Button
              variant="ghost"
              size="icon-sm"
              className="lg:hidden"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((value) => !value)}
            >
              {menuOpen ? <X className="h-4.5 w-4.5" /> : <Menu className="h-4.5 w-4.5" />}
            </Button>
          </div>
        </div>
      </Container>

      {user && searchOpen ? (
        <div className="border-t border-line bg-white">
          <Container size="wide">
            <form onSubmit={submitSearch} className="flex items-center gap-2 py-3" role="search">
              <label htmlFor="header-search" className="sr-only">
                Search the marketplace by niche, keyword or domain
              </label>
              <div className="relative flex-1">
                <Search
                  className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted"
                  aria-hidden="true"
                />
                <input
                  id="header-search"
                  ref={searchRef}
                  type="search"
                  value={term}
                  onChange={(event) => setTerm(event.target.value)}
                  placeholder="Search the marketplace by niche, keyword or domain..."
                  className="h-10 w-full rounded-md border border-line-strong bg-white pr-3 pl-9 text-sm text-ink placeholder:text-muted-soft focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 focus:outline-none"
                />
              </div>
              <Button type="submit" variant="accent">
                Search
              </Button>
            </form>
          </Container>
        </div>
      ) : null}

      {menuOpen ? (
        <div className="max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-line bg-white lg:hidden">
          <Container size="wide">
            <nav aria-label="Mobile" className="flex flex-col py-3">
              {(user ? signedIn : signedOut).map((item, index) => (
                <div key={`${index}-${item.label}`}>
                  {/*
                    Nothing to point at is drawn as a heading rather than as
                    a link to nowhere. That is what a footer-style parent is,
                    and the editor allows one here too - an `<a>` with an
                    empty href reloads the current page, which reads as a
                    menu that does not work.
                  */}
                  {item.href ? (
                    <Link
                      href={item.href}
                      className="block rounded-md px-2 py-2.5 text-sm font-medium text-ink-soft hover:bg-surface-sunken hover:text-ink"
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <p className="px-2 py-2.5 text-sm font-medium text-ink">{item.label}</p>
                  )}
                  {item.children.length > 0 ? (
                    <div className="mb-1 ml-2 flex flex-col border-l border-line pl-3">
                      {item.children.map((child, childIndex) =>
                        child.href ? (
                          <Link
                            key={`${childIndex}-${child.label}`}
                            href={child.href}
                            className="rounded-md px-2 py-2 text-[13px] text-muted hover:bg-surface-sunken hover:text-ink"
                          >
                            {child.label}
                          </Link>
                        ) : (
                          <span
                            key={`${childIndex}-${child.label}`}
                            className="px-2 py-2 text-[13px] text-muted-soft"
                          >
                            {child.label}
                          </span>
                        ),
                      )}
                    </div>
                  ) : null}
                </div>
              ))}

              <div className="mt-3 flex gap-2 border-t border-line pt-3">
                {user ? (
                  <>
                    <Button asChild variant="outline" size="sm" className="flex-1">
                      <Link href="/dashboard/saved">
                        Saved Sites{savedShown ? ` (${favouriteCount})` : ''}
                      </Link>
                    </Button>
                    <Button asChild variant="primary" size="sm" className="flex-1">
                      <Link href="/dashboard">Dashboard</Link>
                    </Button>
                  </>
                ) : (
                  <>
                    <Button asChild variant="outline" size="sm" className="flex-1">
                      <Link href="/login">Log in</Link>
                    </Button>
                    <Button asChild variant="accent" size="sm" className="flex-1">
                      <Link href="/signup">Get started</Link>
                    </Button>
                  </>
                )}
              </div>
            </nav>
          </Container>
        </div>
      ) : null}
    </header>
  );
}

function NavEntry({
  item,
  active,
  open,
  onToggle,
}: {
  item: MenuNode;
  active: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const className = cn(
    'flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium transition-colors',
    active ? 'text-ink' : 'text-ink-soft hover:text-ink',
  );

  /*
    `.length > 0`, not `item.children`. Every node carries an array now, so
    the old truthiness check would be true for all of them and every item in
    the header would render as a dropdown button with nothing in it.
  */
  if (item.children.length === 0) {
    // An item with neither a link nor children is a label. It is a dead end
    // in a header and the editor warns about it, but it is drawn as what it
    // is rather than as a link that reloads the page.
    if (!item.href) {
      return <span className={className}>{item.label}</span>;
    }
    return (
      <Link href={item.href} className={className}>
        {item.label}
      </Link>
    );
  }

  return (
    <div className="relative">
      <button type="button" onClick={onToggle} aria-expanded={open} className={className}>
        {item.label}
        <ChevronDown
          className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div className="absolute top-full left-0 z-50 mt-1 w-72 rounded-xl border border-line bg-white p-2 shadow-[var(--shadow-pop)]">
          {item.children.map((child, index) => {
            const body = (
              <>
                <span className="block text-[13px] font-semibold text-ink">{child.label}</span>
                {child.description ? (
                  <span className="mt-0.5 block text-[12px] leading-snug text-muted">
                    {child.description}
                  </span>
                ) : null}
              </>
            );
            const key = `${index}-${child.label}`;

            // A child with no link is shown and not clickable, rather than
            // being an anchor that reloads whatever page you were on.
            return child.href ? (
              <Link
                key={key}
                href={child.href}
                className="block rounded-lg px-3 py-2.5 transition-colors hover:bg-surface"
              >
                {body}
              </Link>
            ) : (
              <div key={key} className="block px-3 py-2.5">
                {body}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function CountDot({ value, className }: { value: number; className?: string }) {
  return (
    <span
      className={cn(
        'tabular absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-600 px-1 text-[10px] font-semibold text-white',
        className,
      )}
    >
      {value > 99 ? '99+' : value}
    </span>
  );
}
