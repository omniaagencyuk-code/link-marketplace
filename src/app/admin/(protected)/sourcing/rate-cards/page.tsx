import Link from 'next/link';
import { PageTitle } from '@/components/dashboard/page-title';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { RateCardWorklist } from '@/components/admin/sourcing/rate-card-worklist';
import { sourcingService } from '@/lib/services/sourcing-service';
import { isSupabaseEnabled } from '@/lib/supabase/config';

export const dynamic = 'force-dynamic';

/**
 * Replies that sent a rate card instead of a price.
 *
 * These produced no draft, and the reason was accurate: the numbers are in a
 * PDF or a Google Sheet we never opened. A publisher who sends a full rate
 * card is the opposite of a dead lead, so this is the list where somebody
 * opens the file, copies the rates in, and lets the ordinary pipeline take
 * over from there.
 */
export default async function RateCardsPage() {
  if (!isSupabaseEnabled()) {
    return <PageTitle title="Rate cards" description="The database is not connected." />;
  }

  const leads = await sourcingService.rateCardLeads(100).catch(() => []);

  return (
    <div className="space-y-5">
      <PageTitle
        title="Rate cards to read"
        description="Replies that pointed at a file or a link instead of quoting a price. Open it, copy the rates in, and it rejoins the queue."
        action={
          <Button asChild variant="outline">
            <Link href="/admin/sourcing">Publisher inbox</Link>
          </Button>
        }
      />

      {leads.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-[13px] text-muted">
            Nothing waiting. Replies that carry an attachment or a link but no prices show up here.
          </CardContent>
        </Card>
      ) : (
        <RateCardWorklist leads={leads} />
      )}
    </div>
  );
}
