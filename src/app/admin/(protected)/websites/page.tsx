import Link from 'next/link';
import { Plus, Upload } from 'lucide-react';
import { PageTitle } from '@/components/dashboard/page-title';
import { AdminWebsitesTable } from '@/components/admin/admin-websites-table';
import { ImportHistory } from '@/components/admin/import/import-history';
import { Button } from '@/components/ui/button';
import { importHistoryService } from '@/lib/services';

export const dynamic = 'force-dynamic';

export default async function AdminWebsitesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  /*
    A term the admin search bar arrived with.

    Passed as a prop *and* as the key, so navigating here again with a
    different term remounts the table rather than leaving it showing the
    previous search. The table holds its own query state - that is what makes
    typing in it cheap - and state does not re-seed on a prop it was only
    given once.
  */
  const query = (await searchParams)?.q;
  const search = (Array.isArray(query) ? query[0] : query) ?? '';

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
      <AdminWebsitesTable key={search} initialSearch={search} />
      <ImportHistory runs={imports} />
    </>
  );
}
