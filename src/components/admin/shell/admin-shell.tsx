'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { LifeBuoy, Menu, X } from 'lucide-react';
import { Logo } from '@/components/layout/logo';
import { cn } from '@/lib/utils/cn';
import { adminNav, type NavItem } from '@/lib/config/navigation';

/**
 * The admin area's own shell.
 *
 * A separate component from `DashboardShell` rather than a third variant of
 * it, and that is the point rather than a convenience. The customer dashboard
 * uses that shell, and the one instruction attached to this redesign that
 * cannot be walked back is that the customer dashboard does not change. A
 * variant flag makes that a promise about every future edit; a separate file
 * makes it true by construction - there is no line in here a customer renders.
 *
 * ## The navigation is the one in `config/navigation.ts`
 *
 * All seventeen items, in the order they were already in, read from the same
 * array the old shell read. Nothing here decides what the admin area contains:
 * a page added to that list appears, and this cannot quietly drop one by being
 * out of date with it.
 *
 * ## The sidebar scrolls, the page does not
 *
 * Seventeen items plus a footer is taller than a laptop at some zoom levels,
 * so the nav is the scrolling part and the logo and the help card stay put.
 * The content column is `min-w-0`, which is what stops a wide table pushing
 * the whole page sideways rather than scrolling inside its own box.
 */
export function AdminShell({
  children,
  account,
  topbar,
}: {
  children: React.ReactNode;
  /** The signed-in admin, rendered server-side so it is never a client guess. */
  account: React.ReactNode;
  /** Search, queues and the profile menu. */
  topbar: React.ReactNode;
}) {
  const pathname = usePathname();

  /*
    The drawer closes when the route changes, and does so by arithmetic.

    Without closing, tapping a link on a phone navigates behind a drawer still
    covering the page it navigated to, which reads as the tap having done
    nothing. The obvious way to do that is an effect on `pathname` that calls
    `setDrawerOpen(false)` - and React's own lint rule refuses it, because
    setting state synchronously in an effect renders twice for every change.
    That rule has now caught three components in this codebase, and the fix is
    the same each time: store what the state is *about* and derive the flag.

    Here that is the route the drawer was opened on. Navigate and it no longer
    matches, so the drawer is shut without anything having to shut it.
  */
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const drawerOpen = openedOn === pathname;
  const setDrawerOpen = (open: boolean) => setOpenedOn(open ? pathname : null);

  return (
    <div className="flex min-h-dvh bg-surface">
      {/*
        Two sidebars, one list.

        The desktop rail is always present from `lg`; the drawer is the same
        nav rendered over the page below it. They share `AdminNav`, so the
        navigation cannot drift between the two - which is how a link ends up
        reachable on a laptop and missing on a phone.
      */}
      <aside className="hidden w-60 shrink-0 flex-col bg-navy-900 lg:sticky lg:top-0 lg:flex lg:h-dvh">
        <AdminBrand />
        <AdminNav pathname={pathname} />
        <AdminSidebarFooter>{account}</AdminSidebarFooter>
      </aside>

      {drawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-navy-950/60"
          />
          <div className="relative flex h-full w-72 max-w-[85vw] flex-col bg-navy-900 shadow-2xl">
            <div className="flex items-center justify-between pr-2">
              <AdminBrand />
              <button
                type="button"
                aria-label="Close navigation"
                onClick={() => setDrawerOpen(false)}
                className="rounded-md p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <AdminNav pathname={pathname} />
            <AdminSidebarFooter>{account}</AdminSidebarFooter>
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-line bg-white/95 px-4 backdrop-blur-sm sm:px-6">
          <button
            type="button"
            aria-label="Open navigation"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
            className="-ml-1 rounded-md p-2 text-ink-soft transition-colors hover:bg-surface-sunken hover:text-ink lg:hidden"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          {topbar}
        </header>

        {/*
          `min-w-0` on the column and nothing wider than it here. A table that
          overflows scrolls inside its own container, which is the behaviour
          the admin tables already have; the page itself never scrolls
          sideways.
        */}
        <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-[90rem]">{children}</div>
        </main>
      </div>
    </div>
  );
}

function AdminBrand() {
  return (
    <div className="flex items-center gap-2 px-5 py-5">
      {/* The brand's own lockup, in its light treatment for a dark rail. */}
      <Logo tone="light" href="/admin" />
      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-white/80 uppercase">
        Admin
      </span>
    </div>
  );
}

function AdminNav({ pathname }: { pathname: string }) {
  const isActive = (item: NavItem) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href);

  return (
    <nav
      aria-label="Admin"
      className="hide-scrollbar min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 pb-3"
    >
      {adminNav.map((item) => {
        const active = isActive(item);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors',
              active
                ? 'bg-accent-600 text-white shadow-sm'
                : 'text-white/65 hover:bg-white/10 hover:text-white',
            )}
          >
            {item.icon ? <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function AdminSidebarFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="shrink-0 border-t border-white/10 p-3">
      <div className="mb-3 rounded-lg bg-white/[0.06] p-3">
        <p className="flex items-center gap-1.5 text-[12px] font-semibold text-white">
          <LifeBuoy className="h-3.5 w-3.5 text-accent-400" aria-hidden="true" />
          Need help?
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-white/55">
          The admin notes live in the repository, beside the code they describe.
        </p>
      </div>
      {children}
    </div>
  );
}
