import type { Metadata } from 'next';
import { AdminShell } from '@/components/admin/shell/admin-shell';
import { AdminTopbar } from '@/components/admin/shell/admin-topbar';
import { AdminAccount } from '@/components/admin/shell/admin-account';
import { requireAdminSession } from '@/lib/auth/admin-access';
import { brand } from '@/lib/config/brand';

export const metadata: Metadata = {
  title: { default: 'Admin', template: `%s | Admin | ${brand.name}` },
  robots: { index: false, follow: false },
};

/**
 * The admin area's layout.
 *
 * `AdminShell` rather than `DashboardShell`, which the customer dashboard
 * still uses untouched. Two shells rather than a third variant of one: the
 * instruction that cannot be walked back is that the customer dashboard does
 * not change, and separate files make that true by construction rather than a
 * promise about every future edit.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // proxy.ts already blocked unauthenticated requests; this is the second
  // check, and it gives the shell the signed-in admin's address.
  const session = await requireAdminSession();

  return (
    <AdminShell
      account={<AdminAccount email={session.email} />}
      topbar={<AdminTopbar email={session.email} />}
    >
      {children}
    </AdminShell>
  );
}
