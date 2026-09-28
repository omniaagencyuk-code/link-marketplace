import Link from 'next/link';
import { PageTitle } from '@/components/dashboard/page-title';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { NoDraftWorklist } from '@/components/admin/sourcing/no-draft-worklist';
import { sourcingService } from '@/lib/services/sourcing-service';
import { isSupabaseEnabled } from '@/lib/supabase/config';

export const dynamic = 'force-dynamic';

/**
 * Every reply that produced no draft.
 *
 * Extraction is right about these - there were no prices it could read. That
 * is not the same as there being nothing there: the rates are in a PDF, or
 * the reply is prose, or nobody could tell which site it was about. A
 * publisher who answered at all is worth a minute, and this is where that
 * minute gets spent.
 */
export default async function NoDraftsPage() {
  if (!isSupabaseEnabled()) {
    return <PageTitle title="Replies with no draft" description="The database is not connected." />;
  }

  const emails = await sourcingService.noDraftEmails(200).catch(() => []);
  const withRateCard = emails.filter((email) => email.hasRateCard).length;

  return (
    <div className="space-y-5">
      <PageTitle
        title="Replies with no draft"
        description="They answered, but nothing priceable could be read. Open the original, add the site by hand if it is worth having, then tick it off."
        action={
          <Button asChild variant="outline">
            <Link href="/admin/sourcing">Publisher inbox</Link>
          </Button>
        }
      />

      {emails.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-[13px] text-muted">
            Nothing waiting. Replies that produce no draft appear here until you tick or remove
            them.
          </CardContent>
        </Card>
      ) : (
        <NoDraftWorklist emails={emails} withRateCard={withRateCard} />
      )}
    </div>
  );
}
