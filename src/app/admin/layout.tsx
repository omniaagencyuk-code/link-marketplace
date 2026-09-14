import type { Metadata } from 'next';

/**
 * Applies to every /admin route, including the sign-in page. The authenticated
 * shell lives in the (protected) route group instead, so the sign-in page
 * renders without the admin sidebar.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
