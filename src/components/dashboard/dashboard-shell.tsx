'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { Logo } from '@/components/layout/logo';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/providers/auth-provider';
import { cn } from '@/lib/utils/cn';
import { adminNav, dashboardNav, type NavItem } from '@/lib/config/navigation';

/** Sidebar shell shared by the customer dashboard and the admin area. */
export function DashboardShell({
  variant,
  label,
  children,
  footer,
}: {
  variant: 'dashboard' | 'admin';
  label: string;
  children: React.ReactNode;
  /** Replaces the default account block, e.g. the server-verified admin. */
  footer?: React.ReactNode;
}) {
  const pathname = usePathname();
  const { user, signOut, signingOut } = useAuth();
  // Nav items carry icon components, so they are resolved inside this client
  // component rather than passed across the server/client boundary.
  const nav = variant === 'admin' ? adminNav : dashboardNav;

  const isActive = (item: NavItem) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href);

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <aside className="flex shrink-0 flex-col border-b border-line bg-white lg:h-dvh lg:w-60 lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between px-5 py-4 lg:py-5">
          <Logo />
          {label !== 'Dashboard' ? (
            <span className="rounded-full bg-navy-900 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white uppercase">
              {label}
            </span>
          ) : null}
        </div>

        <nav aria-label={label} className="hide-scrollbar flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible lg:px-3 lg:pb-0">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item) ? 'page' : undefined}
              className={cn(
                'flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium whitespace-nowrap transition-colors',
                isActive(item)
                  ? 'bg-navy-900 text-white'
                  : 'text-ink-soft hover:bg-surface-sunken hover:text-ink',
              )}
            >
              {item.icon ? <item.icon className="h-4 w-4" aria-hidden="true" /> : null}
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="mt-auto hidden border-t border-line p-3 lg:block">
          {footer ?? (user ? (
            <div className="flex items-center gap-2.5 rounded-md px-2 py-2">
              <Avatar initials={user.avatarInitials} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-ink">{user.fullName}</p>
                <p className="truncate text-[11px] text-muted">{user.company}</p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Sign out"
                disabled={signingOut}
                onClick={signOut}
              >
                <LogOut className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link href="/login">Log in</Link>
            </Button>
          ))}
        </div>
      </aside>

      <main id="main" className="min-w-0 flex-1 bg-surface">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
      </main>
    </div>
  );
}
