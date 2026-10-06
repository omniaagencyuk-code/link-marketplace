'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Feedback } from '@/components/admin/sales-controls';
import {
  approveEmailAction,
  cancelEmailAction,
  editEmailAction,
  type SalesActionResult,
} from '@/app/admin/(protected)/sales/actions';
import type { OutboundEmail } from '@/lib/types/sales';

/**
 * One email, ready to be read, changed or refused.
 *
 * The body is editable in place, because the alternative is a reviewer who
 * either approves something slightly wrong or throws it away and starts again.
 * An edit is recorded as an edit - if the emails people rewrite all change the
 * same thing, the prompt is wrong and the edits are the evidence.
 *
 * The listings the email cites are shown beside it with the prices they were
 * drawn from, so "is that figure right" is answerable without opening the
 * marketplace in another tab. That is the check that matters: a price in an
 * outbound email is a price we have to honour.
 */
export function EmailReview({
  email,
  companyName,
  domain,
}: {
  email: OutboundEmail;
  companyName: string;
  domain: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SalesActionResult | null>(null);
  const [subject, setSubject] = useState(email.subject);
  const [body, setBody] = useState(email.bodyText);

  const changed = subject !== email.subject || body !== email.bodyText;

  function run(action: () => Promise<SalesActionResult>, confirm?: string) {
    if (confirm && !window.confirm(confirm)) return;

    setResult(null);
    startTransition(async () => {
      setResult(await action());
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="py-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[14px] font-semibold text-ink">
              <Link href={`/admin/sales/prospects/${email.prospectId}`} className="hover:underline">
                {companyName}
              </Link>
            </p>
            <p className="text-[12px] text-muted">
              {domain} - to {email.toAddress} - step {email.stepNumber}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {email.edited ? <Badge tone="outline">edited</Badge> : null}
            {email.promptVersion ? <Badge tone="neutral">{email.promptVersion}</Badge> : null}
          </div>
        </div>

        {/*
          What the checker found, at the top and in red.

          Not a footnote: the whole reason it is checked before a human reads
          it is that a queue of drafts which all look fine is a queue nobody
          reads carefully.
        */}
        {email.statusReason ? (
          <p className="mb-3 flex gap-2 rounded-lg border border-coral-300 bg-coral-50 p-2.5 text-[13px] leading-relaxed text-coral-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{email.statusReason}</span>
          </p>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <div>
            <Input
              aria-label="Subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              className="font-medium"
            />
            <textarea
              aria-label="Body"
              rows={14}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              className="mt-2 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-[13px] leading-relaxed text-ink focus:border-navy-900 focus:outline-none"
            />
            <p className="mt-1.5 text-[12px] text-muted">
              The unsubscribe line and the sign-off are already in the body - they are added when
              the email is written rather than at send time, so what you see here is what goes.
            </p>
          </div>

          <div>
            <p className="mb-1.5 text-[12px] font-semibold text-ink">Listings this email cites</p>
            {email.matchedInventory.length === 0 ? (
              <p className="text-[12px] text-muted">
                None. The email should not name a site or quote a price.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {email.matchedInventory.map((listing) => (
                  <li key={listing.websiteId} className="text-[12px]">
                    <span className="font-medium text-ink">{listing.domain}</span>
                    <span className="text-muted">
                      {' '}
                      - DR {listing.domainRating}, {listing.organicTraffic.toLocaleString('en-GB')}{' '}
                      visits, £{(listing.priceMinor / 100).toLocaleString('en-GB')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[12px] leading-relaxed text-muted">
              These are the only figures the writer was given. Any other number in the email is one
              it made up.
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={pending || changed}
            title={changed ? 'Save your changes first.' : undefined}
            onClick={() =>
              run(
                () => approveEmailAction(email.id),
                `Approve this email to ${email.toAddress}? It goes out on the next send and cannot be recalled.`,
              )
            }
          >
            {pending ? 'Working...' : 'Approve'}
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending || !changed}
            onClick={() => {
              const formData = new FormData();
              formData.set('emailId', email.id);
              formData.set('subject', subject);
              formData.set('bodyText', body);
              run(() => editEmailAction(formData));
            }}
          >
            Save changes
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => run(() => cancelEmailAction(email.id), 'Throw this draft away?')}
          >
            Discard
          </Button>

          {changed ? (
            <span className="text-[12px] text-muted">
              Save first - approving sends what is stored, not what is on screen.
            </span>
          ) : null}
        </div>

        {result ? <Feedback result={result} /> : null}
      </CardContent>
    </Card>
  );
}
