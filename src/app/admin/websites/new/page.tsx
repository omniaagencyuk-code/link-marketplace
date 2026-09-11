import { PageTitle } from '@/components/dashboard/page-title';
import { WebsiteEditor } from '@/components/admin/website-editor';

export const dynamic = 'force-dynamic';

export default function NewWebsitePage() {
  return (
    <>
      <PageTitle
        title="Add website"
        description="Create a new listing. Set the status to Active to make it visible in the marketplace."
      />
      <WebsiteEditor />
    </>
  );
}
