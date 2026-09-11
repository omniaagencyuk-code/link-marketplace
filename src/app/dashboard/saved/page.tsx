import type { Metadata } from 'next';
import { PageTitle } from '@/components/dashboard/page-title';
import { SavedWebsites } from '@/components/dashboard/saved-websites';
import { websiteService } from '@/lib/services';

export const metadata: Metadata = { title: 'Saved websites' };

export default async function SavedWebsitesPage() {
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
