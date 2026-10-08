'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { ArrowRight, LifeBuoy, Menu, ShieldCheck, ShoppingBag, X } from 'lucide-react';
import { Logo } from '@/components/layout/logo';
import { useAuth } from '@/lib/providers/auth-provider';
import { useOrderDraft } from '@/lib/providers/order-draft-provider';
import { brand } from '@/lib/config/brand';
import { formatPrice } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import { dashboardNav, type NavItem } from '@/lib/config/navigation';

/**
 * The customer dashboard's shell.
 *
 * A file of its own, like `AdminShell`, rather than another variant of
 * `DashboardShell`. The admin redesign rests on those two areas not sharing a
 * shell, and `verify:admin` fails if an admin file imports the customer one -
 * a third variant would put both back in one place and make that check a
 * formality.
 *
 * ## The rail is navy, which the brief changed its mind about
 *
 * The written spec asked for white and the final line asked for the admin's
 * dark rail. The later instruction wins. It is the same `navy-900`, so the two
 * areas read as one product; what separates them is the badge, the navigation
 * and what is at the foot of it.
 *
 * ## Everything the old shell did, it still does
 *
 * The count on Orders, the basket summary, the route into the admin area for
 * an administrator and the account block are all here. None of them is
 * decoration - the basket total is what somebody adding a fourth site is
 * watching, and the admin link is the only way to discover that area from
 * here.
 */
export function CustomerShell({
  children,
  topbar,
}: {
  children: React.ReactNode;
  topbar: React.ReactNode;
}) {
  const pathname = usePathname();

  /*
    Derived, not set in an effect.

    The drawer closes when the route changes, and the obvious way to do that
    is an effect calling `setDrawerOpen(false)` - which React's lint rule
    refuses, because setting state synchronously in one renders twice. Storing
    the route the drawer was opened on answers the same question by
    arithmetic. This is the fourth component in this codebase to need it.
  */
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const drawerOpen = openedOn === pathname;
  const setDrawerOpen = (open: boolean) => setOpenedOn(open ? pathname : null);

  return (
    <div className="flex min-h-dvh bg-surface">
      <aside className="hidden w-60 shrink-0 flex-col bg-navy-900 lg:sticky lg:top-0 lg:flex lg:h-dvh">
        <CustomerBrand />
        <CustomerNav pathname={pathname} />
        <CustomerSidebarFooter />
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
              <CustomerBrand />
              <button
                type="button"
                aria-label="Close navigation"
                onClick={() => setDrawerOpen(false)}
                className="rounded-md p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <CustomerNav pathname={pathname} />
            <CustomerSidebarFooter />
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

        <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-[84rem]">{children}</div>
        </main>
      </div>
    </div>
  );
}

function CustomerBrand() {
  return (
    <div className="flex items-center px-5 py-5">
      <Logo tone="light" href="/dashboard" />
    </div>
  );
}

function CustomerNav({ pathname }: { pathname: string }) {
  const { isAdmin } = useAuth();
  const { count: draftCount } = useOrderDraft();

  const isActive = (item: NavItem) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href);

  return (
    <nav
      aria-label="Dashboard"
      className="hide-scrollbar min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 pb-3"
    >
      {dashboardNav.map((item) => {
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
            {item.badge === 'order-draft' && draftCount > 0 ? (
              <span
                className={cn(
                  'tabular ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold',
                  active ? 'bg-white text-accent-700' : 'bg-accent-600 text-white',
                )}
              >
                {draftCount > 99 ? '99+' : draftCount}
              </span>
            ) : null}
          </Link>
        );
      })}

      {/*
        The admin area has its own sign-in and is not linked from anywhere
        else, so without this an administrator signing in here lands with no
        route onward.

        Shown from the client's copy of the profile, which is a hint about
        what to draw and nothing more: /admin is gated by the proxy and
        re-checked by `requireAdminSession` on every page and action, so a
        forged value here changes a link and grants nothing.
      */}
      {isAdmin ? (
        <Link
          href="/admin"
          className="mt-3 flex items-center gap-3 rounded-lg border-t border-white/10 px-3 pt-4 pb-2 text-[13px] font-medium text-accent-400 transition-colors hover:text-accent-300"
        >
          <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
          Admin
        </Link>
      ) : null}
    </nav>
  );
}

function CustomerSidebarFooter() {
  const { count: draftCount, totalMinor } = useOrderDraft();

  return (
    <div className="shrink-0 space-y-3 border-t border-white/10 p-3">
      {/*
        What is in the basket, in money. The count on the nav item says
        something was added; this says what it will cost, which is the figure
        somebody adding a fourth site is actually watching.
      */}
      {draftCount > 0 ? (
        <Link
          href="/dashboard/orders"
          className="block rounded-lg bg-white/[0.06] p-3 transition-colors hover:bg-white/10"
        >
          <span className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-white/60 uppercase">
            <ShoppingBag className="h-3.5 w-3.5" aria-hidden="true" />
            Your order
          </span>
          <span className="tabular mt-1 block text-[18px] font-semibold text-white">
            {formatPrice(totalMinor)}
          </span>
          <span className="mt-0.5 flex items-center gap-1 text-[12px] text-white/55">
            {draftCount} {draftCount === 1 ? 'placement' : 'placements'}
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </span>
        </Link>
      ) : null}

      <div className="rounded-lg bg-white/[0.06] p-3">
        <p className="flex items-center gap-1.5 text-[12px] font-semibold text-white">
          <LifeBuoy className="h-3.5 w-3.5 text-accent-400" aria-hidden="true" />
          Need help?
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-white/55">
          Read the guides, or email us and a person will answer.
        </p>
        {/*
          A real address rather than a route that does not exist. The brief
          asked for a support button and asked for it not to be a dead one;
          `brand.supportEmail` is the address the rest of the site already
          gives out.
        */}
        <a
          href={`mailto:${brand.supportEmail}`}
          className="mt-2.5 block rounded-md bg-white px-3 py-2 text-center text-[12px] font-semibold text-navy-900 transition-colors hover:bg-white/90"
        >
          Contact support
        </a>
      </div>
    </div>
  );
}
