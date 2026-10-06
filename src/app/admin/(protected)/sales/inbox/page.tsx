import { MailOpen } from 'lucide-react';
import { PageTitle } from '@/components/dashboard/page-title';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ReplyList, LogReply } from '@/components/admin/sales-inbox';
import { salesReplyService } from '@/lib/services/sales-reply-service';
import { prospectService } from '@/lib/services/prospect-service';

/**
 * Replies.
 *
 * Classified on arrival, acted on immediately where the action is obvious -
 * an unsubscribe suppresses the whole company before anybody sees this page -
 * and then read by a person regardless. The classification is routing, not a
 * verdict: it decides what happens next, not whether a human bothers.
 *
 * Unhandled first, because the useful question here is "what still needs me".
 */

export const dynamic = 'force-dynamic';

export default async function InboxPage() {
  const [unhandled, handled] = await Promise.all([
    salesReplyService.inbox({ handled: false, limit: 100 }).catch(() => []),
    salesReplyService.inbox({ handled: true, limit: 30 }).catch(() => []),
  ]);

  const all = [...unhandled, ...handled];
  const prospects = await Promise.all(
    [...new Set(all.map((reply) => reply.prospectId).filter(Boolean))].map((id) =>
      prospectService.getById(id as string).catch(() => null),
    ),
  );
  const names = new Map(
    prospects.filter(Boolean).map((prospect) => [prospect!.id, prospect!.companyName]),
  );

  return (
    <>
      <PageTitle
        title="Inbox"
        description="What came back. An unsubscribe is acted on the moment it arrives, before anybody reads this."
      />

      <LogReply />

      <h2 className="mt-8 mb-3 text-[15px] font-semibold text-ink">
        Needs you
        <span className="ml-2 text-[13px] font-normal text-muted">{unhandled.length}</span>
      </h2>

      {unhandled.length === 0 ? (
        <EmptyState
          icon={MailOpen}
          title="Nothing waiting"
          description="Replies land here. Paste one in above if it arrived in your own mail client."
        />
      ) : (
        <ReplyList replies={unhandled} names={Object.fromEntries(names)} />
      )}

      {handled.length > 0 ? (
        <>
          <h2 className="mt-8 mb-3 text-[15px] font-semibold text-ink">Dealt with</h2>
          <Card>
            <CardContent className="py-4">
              <ReplyList replies={handled} names={Object.fromEntries(names)} compact />
            </CardContent>
          </Card>
        </>
      ) : null}
    </>
  );
}
