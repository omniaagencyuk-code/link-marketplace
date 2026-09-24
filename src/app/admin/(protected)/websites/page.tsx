import Link from 'next/link';
import { Plus, Upload } from 'lucide-react';
import { PageTitle } from '@/components/dashboard/page-title';
import { AdminWebsitesTable } from '@/components/admin/admin-websites-table';
import { ImportHistory } from '@/components/admin/import/import-history';
import { Button } from '@/components/ui/button';
import { importHistoryService, websiteService } from '@/lib/services';
import { pricingService } from '@/lib/services/pricing-service';

export const dynamic = 'force-dynamic';

export default async function AdminWebsitesPage() {
  const [websites, imports, trueCosts] = await Promise.all([
    websiteService.getAllForAdmin(),
    importHistoryService.getRecent(5),
    // What each listing costs us in GBP. Without it a dollar publisher shows
    // no cost and no profit at all, which is honest but not much use in a
    // table somebody scans.
    pricingService.trueCostsByWebsite().catch(() => ({})),
  ]);

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
      <AdminWebsitesTable websites={websites} trueCosts={trueCosts} />
      <ImportHistory runs={imports} />
    </>
  );
}
