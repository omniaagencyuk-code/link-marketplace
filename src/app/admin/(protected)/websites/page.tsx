import Link from 'next/link';
import { Plus, Upload } from 'lucide-react';
import { PageTitle } from '@/components/dashboard/page-title';
import { AdminWebsitesTable } from '@/components/admin/admin-websites-table';
import { ImportHistory } from '@/components/admin/import/import-history';
import { Button } from '@/components/ui/button';
import { importHistoryService } from '@/lib/services';

export const dynamic = 'force-dynamic';

export default async function AdminWebsitesPage() {
  /*
    Five recent imports, and nothing else.

    This used to read every non-archived listing with costs, contacts and
    commercials joined on, and price all of them, to render fifty rows - about
    a minute to open. Both of those now happen per page, inside the table.
  */
  const imports = await importHistoryService.getRecent(5);

  return (
    <>
      <PageTitle
        title="Websites"
        description="The marketplace inventory database. Edit metrics, pricing and availability."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline">
              <Link href="/admin/websites/import">
                <Upload className="h-4 w-4" />
                Import CSV
              </Link>
            </Button>
            <Button asChild variant="accent">
              <Link href="/admin/websites/new">
                <Plus className="h-4 w-4" />
                Add website
              </Link>
            </Button>
          </div>
        }
      />
      <AdminWebsitesTable />
      <ImportHistory runs={imports} />
    </>
  );
}
