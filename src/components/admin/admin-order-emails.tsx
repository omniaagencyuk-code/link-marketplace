import { AlertTriangle, Mail } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDateTime } from '@/lib/utils/format';

/** Our words for each message, rather than the slug the code uses. */
const LABELS: Record<string, string> = {
  'placement-delivered': 'Placement delivered',
  'issue-raised': 'Problem reported (to us)',
  'issue-resolved': 'Problem sorted',
  'approval-reminder': 'Review window closing',
};

/**
 * What we told them, and when.
 *
 * Here because a placement approves itself after fourteen days, so if one is
 * ever argued about the question is "did you tell me?" - and the answer needs
 * to be visible next to the order rather than buried in a table only SQL can
 * reach. Failures are listed too: "we tried and it bounced" is a different
 * answer from "we never sent it", and only one of them is our fault.
 */
export function AdminOrderEmails({
  emails,
}: {
  emails: { id: string; template: string; to: string; sentAt: string; error?: string }[];
}) {
  if (emails.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Emails</CardTitle>
        </CardHeader>
        <CardContent className="py-4 text-[13px] text-muted">
          Nothing sent about this order yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Emails</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {emails.map((email) => (
          <div key={email.id} className="flex items-start gap-2 text-[12px]">
            {email.error ? (
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-negative" aria-hidden="true" />
            ) : (
              <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
            )}
            <div className="min-w-0">
              <p className="font-medium text-ink">{LABELS[email.template] ?? email.template}</p>
              <p className="truncate text-muted">
                {email.to} &middot; {formatDateTime(email.sentAt)}
              </p>
              {email.error ? (
                <p className="mt-0.5 text-negative">Not delivered: {email.error}</p>
              ) : null}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
