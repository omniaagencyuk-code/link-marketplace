import type { Metadata } from 'next';
import { PageTitle } from '@/components/dashboard/page-title';
import { SavedWebsites } from '@/components/dashboard/saved-websites';
import { websiteService } from '@/lib/services';
import { requireCustomerSession } from '@/lib/auth/customer-access';

export const metadata: Metadata = { title: 'Saved websites' };

export default async function SavedWebsitesPage() {
  // Renders full listing data, so it needs the same gate as the marketplace.
  await requireCustomerSession('/dashboard/saved');
  const websites = await websiteService.getAll();

  return (
    <>
      <PageTitle
        title="Saved websites"
        description="Your shortlist. Saved sites are stored on this device until accounts are connected to the database."
      />
      <SavedWebsites websites={websites} />
    </>
  );
}
