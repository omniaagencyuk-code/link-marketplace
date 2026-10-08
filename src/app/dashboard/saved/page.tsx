import type { Metadata } from 'next';
import { PageTitle } from '@/components/dashboard/page-title';
import { SavedWebsites } from '@/components/dashboard/saved-websites';
import { requireCustomerSession } from '@/lib/auth/customer-access';

export const metadata: Metadata = { title: 'Saved websites' };

export default async function SavedWebsitesPage() {
  // Renders full listing data, so it needs the same gate as the marketplace.
  // The listings themselves are fetched by the browser from the saved ids,
  // which only it knows - see `useListings`.
  await requireCustomerSession('/dashboard/saved');

  return (
    <>
      <PageTitle
        title="Saved websites"
        description="Your shortlist. Save websites while browsing and they appear here."
      />
      <SavedWebsites />
    </>
  );
}
