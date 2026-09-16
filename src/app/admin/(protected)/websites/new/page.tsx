import { PageTitle } from '@/components/dashboard/page-title';
import { WebsiteEditor } from '@/components/admin/website-editor';
import { settingsService } from '@/lib/services';

export const dynamic = 'force-dynamic';

export default async function NewWebsitePage() {
  const settings = await settingsService.get();

  return (
    <>
      <PageTitle
        title="Add website"
        description="Create a new listing. Set the status to Active to make it visible in the marketplace."
      />
      <WebsiteEditor currency={settings.currency} />
    </>
  );
}
