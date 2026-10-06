'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';

const TABS = [
  { href: '/admin/sales', label: 'Overview', exact: true },
  { href: '/admin/sales/prospects', label: 'Prospects' },
  { href: '/admin/sales/review', label: 'Review queue' },
  { href: '/admin/sales/inbox', label: 'Inbox' },
  { href: '/admin/sales/suppressions', label: 'Do not contact' },
  { href: '/admin/sales/settings', label: 'Settings' },
];

export function SalesTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Sales Centre"
      className="mb-6 -mx-1 flex gap-1 overflow-x-auto border-b border-line pb-px"
    >
      {TABS.map((tab) => {
        // A prospect detail page is still "Prospects"; only Overview needs an
        // exact match, because every other path starts with it.
        const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'shrink-0 rounded-t-lg px-3 py-2 text-[13px] font-medium whitespace-nowrap',
              active
                ? 'border-b-2 border-navy-900 text-ink'
                : 'border-b-2 border-transparent text-muted hover:text-ink',
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
