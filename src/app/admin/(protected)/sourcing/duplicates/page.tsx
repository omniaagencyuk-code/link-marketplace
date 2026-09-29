import Link from 'next/link';
import { PageTitle } from '@/components/dashboard/page-title';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DuplicateGroups } from '@/components/admin/sourcing/duplicate-groups';
import { sourcingService } from '@/lib/services/sourcing-service';
import { isSupabaseEnabled } from '@/lib/supabase/config';

export const dynamic = 'force-dynamic';

/**
 * Domains offered more than once.
 *
 * These used to sit in the main queue behind a note saying four domains
 * appeared twice - true, and no help at all. Worse than no help: approving
 * the queue in bulk walked straight past it, and the last approval of a
 * domain wins, so whichever copy happened to come later overwrote the
 * other's price and contact with nobody looking.
 *
 * Out of the way, then. The plain drafts can be ticked through without
 * reading anything, and these wait here - both prices converted, both
 * senders described - until there is time to choose between them.
 */
export default async function DuplicatesPage() {
  if (!isSupabaseEnabled()) {
    return <PageTitle title="Offered more than once" description="The database is not connected." />;
  }

  const groups = await sourcingService.duplicateGroups().catch(() => []);
  const drafts = groups.reduce((total, group) => total + group.pending, 0);

  return (
    <div className="space-y-5">
      <PageTitle
        title="Offered more than once"
        description="Two replies about the same site. Keep whichever you want to buy from, delete the other, and the domain leaves this list."
        action={
          <Button asChild variant="outline">
            <Link href="/admin/sourcing">Publisher inbox</Link>
          </Button>
        }
      />

      {groups.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-[13px] text-muted">
            Nothing here. A domain appears when a second reply offers it, and leaves when only one
            draft for it is left waiting.
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-[13px] text-ink-soft">
            {groups.length} {groups.length === 1 ? 'domain' : 'domains'}, {drafts}{' '}
            {drafts === 1 ? 'draft' : 'drafts'} still waiting. Prices are converted to compare them;
            the cheapest that could be converted is marked.
          </p>
          <DuplicateGroups groups={groups} />
        </>
      )}
    </div>
  );
}
