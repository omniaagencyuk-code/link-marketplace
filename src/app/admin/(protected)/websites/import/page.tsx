import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PageTitle } from '@/components/dashboard/page-title';
import { ImportWizard } from '@/components/admin/import/import-wizard';
import { Button } from '@/components/ui/button';
import { settingsService } from '@/lib/services';
import { currencySymbol } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'Import websites' };
export const dynamic = 'force-dynamic';

export default async function ImportWebsitesPage() {
  const settings = await settingsService.get();

  return (
    <>
      <PageTitle
        title="Import websites from CSV"
        description="Upload a publisher list, check how it maps onto the marketplace, then import in bulk."
        action={
          <Button asChild variant="outline">
            <Link href="/admin/websites">
              <ArrowLeft className="h-4 w-4" />
              Back to websites
            </Link>
          </Button>
        }
      />
      <ImportWizard currencySymbol={currencySymbol(settings.currency)} />
    </>
  );
}
