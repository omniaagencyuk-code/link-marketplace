import Link from 'next/link';
import { Plus } from 'lucide-react';
import { PageTitle } from '@/components/dashboard/page-title';
import { AdminWebsitesTable } from '@/components/admin/admin-websites-table';
import { Button } from '@/components/ui/button';
import { websiteService } from '@/lib/services';

export const dynamic = 'force-dynamic';

export default async function AdminWebsitesPage() {
  const websites = await websiteService.getAllForAdmin();

  return (
    <>
      <PageTitle
        title="Websites"
        description="The marketplace inventory database. Edit metrics, pricing and availability."
        action={
          <Button asChild variant="accent">
            <Link href="/admin/websites/new">
              <Plus className="h-4 w-4" />
              Add website
            </Link>
          </Button>
        }
      />
      <AdminWebsitesTable websites={websites} />
    </>
  );
}
