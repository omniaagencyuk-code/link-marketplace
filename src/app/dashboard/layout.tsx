import type { Metadata } from 'next';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { brand } from '@/lib/config/brand';

export const metadata: Metadata = {
  title: { default: 'Dashboard', template: `%s | Dashboard | ${brand.name}` },
  robots: { index: false, follow: false },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardShell variant="dashboard" label="Dashboard">
      {children}
    </DashboardShell>
  );
}
