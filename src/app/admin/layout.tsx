import type { Metadata } from 'next';
import { AdminGuard } from '@/components/admin/admin-guard';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';

export const metadata: Metadata = {
  title: { default: 'Admin', template: '%s | Admin | LinkMarket' },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminGuard>
      <DashboardShell variant="admin" label="Admin">
        {children}
      </DashboardShell>
    </AdminGuard>
  );
}
