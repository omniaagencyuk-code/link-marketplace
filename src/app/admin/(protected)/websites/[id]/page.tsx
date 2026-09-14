import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageTitle } from '@/components/dashboard/page-title';
import { WebsiteEditor } from '@/components/admin/website-editor';
import { Button } from '@/components/ui/button';
import { websiteService } from '@/lib/services';

export const dynamic = 'force-dynamic';

export default async function EditWebsitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const website = await websiteService.getById(id);
  if (!website) notFound();

  return (
    <>
      <PageTitle
        title={website.domain}
        description="Edit the listing. Changes apply to the marketplace immediately."
        action={
          <Button asChild variant="outline">
            <Link href={`/websites/${website.slug}`}>View listing</Link>
          </Button>
        }
      />
      <WebsiteEditor website={website} />
    </>
  );
}
