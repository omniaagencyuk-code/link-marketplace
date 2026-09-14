'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Bookmark, ChevronDown, LayoutDashboard, Menu, Search, ShoppingBag, X } from 'lucide-react';
import { Logo } from './logo';
import { Container } from './container';
import { Button } from '@/components/ui/button';
import { mainNav, type NavGroup } from '@/lib/config/navigation';
import { useAuth } from '@/lib/providers/auth-provider';
import { useFavourites } from '@/lib/providers/favourites-provider';
import { useOrderDraft } from '@/lib/providers/order-draft-provider';
import { useContentDraft } from '@/lib/providers/content-draft-provider';
import { cn } from '@/lib/utils/cn';

/** Signed-in shortcuts, replacing the marketing nav once there is an account. */
const memberNav = [
  { label: 'Marketplace', href: '/marketplace' },
  { label: 'Content', href: '/dashboard/content' },
  { label: 'Orders', href: '/dashboard/orders' },
  { label: 'Projects', href: '/dashboard/saved' },
];

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const { count: favouriteCount } = useFavourites();
  const { count: draftCount } = useOrderDraft();
  const { count: contentCount } = useContentDraft();
  const [menuOpen, setMenuOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
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
    if (!openGroup) return;
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

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

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
              {user
                ? memberNav.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        'rounded-md px-3 py-2 text-sm font-medium transition-colors',
                        isActive(item.href) ? 'text-ink' : 'text-ink-soft hover:text-ink',
                      )}
                    >
                      {item.label}
                    </Link>
                  ))
                : mainNav.map((item) => (
                    <NavEntry
                      key={item.href}
                      item={item}
                      active={isActive(item.href)}
                      open={openGroup === item.label}
                      onToggle={() =>
                        setOpenGroup((current) => (current === item.label ? null : item.label))
                      }
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
                <Link
                  href="/dashboard/saved"
                  aria-label={`Saved websites (${favouriteCount})`}
                  className="relative hidden h-8 w-8 items-center justify-center rounded-md text-ink-soft transition-colors hover:bg-surface-sunken hover:text-ink sm:inline-flex"
                >
                  <Bookmark className="h-4 w-4" />
                  {favouriteCount > 0 ? <CountDot value={favouriteCount} /> : null}
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
              {user
                ? memberNav.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="rounded-md px-2 py-2.5 text-sm font-medium text-ink-soft hover:bg-surface-sunken hover:text-ink"
                    >
                      {item.label}
                    </Link>
                  ))
                : mainNav.map((item) => (
                    <div key={item.href}>
                      <Link
                        href={item.href}
                        className="block rounded-md px-2 py-2.5 text-sm font-medium text-ink-soft hover:bg-surface-sunken hover:text-ink"
                      >
                        {item.label}
                      </Link>
                      {item.children ? (
                        <div className="mb-1 ml-2 flex flex-col border-l border-line pl-3">
                          {item.children.map((child) => (
                            <Link
                              key={child.href}
                              href={child.href}
                              className="rounded-md px-2 py-2 text-[13px] text-muted hover:bg-surface-sunken hover:text-ink"
                            >
                              {child.label}
                            </Link>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}

              <div className="mt-3 flex gap-2 border-t border-line pt-3">
                {user ? (
                  <>
                    <Button asChild variant="outline" size="sm" className="flex-1">
                      <Link href="/dashboard/saved">Saved ({favouriteCount})</Link>
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
  item: NavGroup;
  active: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const className = cn(
    'flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium transition-colors',
    active ? 'text-ink' : 'text-ink-soft hover:text-ink',
  );

  if (!item.children) {
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
          {item.children.map((child) => (
            <Link
              key={child.href}
              href={child.href}
              className="block rounded-lg px-3 py-2.5 transition-colors hover:bg-surface"
            >
              <span className="block text-[13px] font-semibold text-ink">{child.label}</span>
              {child.description ? (
                <span className="mt-0.5 block text-[12px] leading-snug text-muted">
                  {child.description}
                </span>
              ) : null}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CountDot({ value }: { value: number }) {
  return (
    <span className="tabular absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-600 px-1 text-[10px] font-semibold text-white">
      {value > 99 ? '99+' : value}
    </span>
  );
}
