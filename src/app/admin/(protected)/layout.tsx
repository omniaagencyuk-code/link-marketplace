import type { Metadata } from 'next';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { AdminAccountFooter } from '@/components/admin/admin-account-footer';
import { requireAdminSession } from '@/lib/auth/admin-access';
import { brand } from '@/lib/config/brand';

export const metadata: Metadata = {
  title: { default: 'Admin', template: `%s | Admin | ${brand.name}` },
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // proxy.ts already blocked unauthenticated requests; this is the second
  // check, and it gives the shell the signed-in admin's address.
  const session = await requireAdminSession();

  return (
    <DashboardShell
      variant="admin"
      label="Admin"
      footer={<AdminAccountFooter email={session.email} />}
    >
      {children}
    </DashboardShell>
  );
}
