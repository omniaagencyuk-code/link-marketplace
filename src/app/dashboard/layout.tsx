import type { Metadata } from 'next';
import { CustomerShell } from '@/components/dashboard/shell/customer-shell';
import { CustomerTopbar } from '@/components/dashboard/shell/customer-topbar';
import { brand } from '@/lib/config/brand';

export const metadata: Metadata = {
  title: { default: 'Dashboard', template: `%s | Dashboard | ${brand.name}` },
  robots: { index: false, follow: false },
};

/**
 * The customer dashboard's layout.
 *
 * `CustomerShell` rather than `DashboardShell`, which is now unused by either
 * area and kept only until the last page that referenced it is gone. Two
 * shells rather than one with variants: the admin redesign rests on those
 * areas not sharing a shell, and `verify:admin` enforces it.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <CustomerShell topbar={<CustomerTopbar />}>{children}</CustomerShell>;
}
