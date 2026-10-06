import Link from 'next/link';
import { MailCheck } from 'lucide-react';
import { PageTitle } from '@/components/dashboard/page-title';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { EmailReview } from '@/components/admin/email-review';
import { salesEmailService } from '@/lib/services/sales-email-service';
import { prospectService } from '@/lib/services/prospect-service';

/**
 * The review queue.
 *
 * Every email that has been written and not yet approved. Nothing leaves this
 * page without somebody pressing Approve - not because the code is careful
 * but because the database refuses the transition without a named approver, so
 * there is no path around this screen.
 *
 * Oldest first. A draft nobody has read is not improving while it waits, and
 * the facts in it - prices, a company's own words - go stale.
 *
 * What `checkDraft` found wrong is printed above the email in red rather than
 * left to be noticed. Forty drafts that all look fine is a queue nobody reads
 * carefully, and the one with a price we never set looks exactly like the
 * other thirty-nine.
 */

export const dynamic = 'force-dynamic';

export default async function ReviewPage() {
  const emails = await salesEmailService.awaitingReview(60).catch(() => []);

  const prospects = await Promise.all(
    [...new Set(emails.map((email) => email.prospectId))].map((id) =>
      prospectService.getById(id).catch(() => null),
    ),
  );
  const byId = new Map(prospects.filter(Boolean).map((prospect) => [prospect!.id, prospect!]));

  const flagged = emails.filter((email) => email.statusReason).length;

  return (
    <>
      <PageTitle
        title="Review queue"
        description="Nothing is sent until somebody here approves it. The database enforces that, not just this page."
      />

      {emails.length === 0 ? (
        <EmptyState
          icon={MailCheck}
          title="Nothing waiting"
          description="Draft an email from a prospect, or run the follow-up sweep."
          action={
            <Link
              href="/admin/sales/prospects"
              className="rounded-lg border border-line bg-white px-3 py-2 text-[13px] font-medium text-ink"
            >
              Open prospects
            </Link>
          }
        />
      ) : (
        <>
          <Card className="mb-6">
            <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 py-4 text-[13px]">
              <span className="text-ink">
                <strong>{emails.length}</strong> waiting
              </span>
              {flagged > 0 ? (
                <span className="text-coral-900">
                  <strong>{flagged}</strong> with something to check before{' '}
                  {flagged === 1 ? 'it goes' : 'they go'}
                </span>
              ) : (
                <span className="text-muted">Nothing flagged</span>
              )}
            </CardContent>
          </Card>

          <ul className="space-y-6">
            {emails.map((email) => {
              const prospect = byId.get(email.prospectId);
              return (
                <li key={email.id}>
                  <EmailReview
                    email={email}
                    companyName={prospect?.companyName ?? 'Unknown company'}
                    domain={prospect?.domain ?? ''}
                  />
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}
