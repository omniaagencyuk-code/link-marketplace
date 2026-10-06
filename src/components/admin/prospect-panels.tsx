'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Feedback, SalesForm } from '@/components/admin/sales-controls';
import {
  addContactAction,
  selectContactAction,
  setStageAction,
  type SalesActionResult,
} from '@/app/admin/(protected)/sales/actions';
import type { ProspectContact, ProspectStage } from '@/lib/types/sales';

const STAGES: ProspectStage[] = [
  'new',
  'researching',
  'qualified',
  'disqualified',
  'contacted',
  'replied',
  'in_conversation',
  'won',
  'lost',
  'unsubscribed',
];

/**
 * Move a prospect through the pipeline.
 *
 * `unsubscribed` asks for confirmation and the others do not, because it is
 * the only one that does something irreversible: it suppresses the whole
 * company domain, cancels everything queued for them, and there is no button
 * anywhere that undoes a suppression. That is deliberate - an unsubscribe we
 * can undo by accident is not an unsubscribe - so the warning is here.
 */
export function ProspectStagePicker({
  prospectId,
  stage,
}: {
  prospectId: string;
  stage: ProspectStage;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SalesActionResult | null>(null);

  function change(next: ProspectStage) {
    if (next === stage) return;

    if (
      next === 'unsubscribed' &&
      !window.confirm(
        'Mark them unsubscribed? This suppresses the whole company domain, cancels every email ' +
          'queued for them, and cannot be undone from this page.',
      )
    ) {
      return;
    }

    setResult(null);
    startTransition(async () => {
      setResult(await setStageAction(prospectId, next));
      router.refresh();
    });
  }

  return (
    <div>
      <select
        aria-label="Pipeline stage"
        value={stage}
        disabled={pending}
        onChange={(event) => change(event.target.value as ProspectStage)}
        className="w-full rounded-lg border border-line bg-white px-2.5 py-2 text-[13px] text-ink capitalize focus:border-navy-900 focus:outline-none"
      >
        {STAGES.map((entry) => (
          <option key={entry} value={entry}>
            {entry.replace(/_/g, ' ')}
          </option>
        ))}
      </select>
      {result ? <Feedback result={result} /> : null}
    </div>
  );
}

/**
 * Everyone we know at a company, and which of them we write to.
 *
 * All of them are listed, not just the chosen one: a Hunter credit was spent
 * on the whole set, and keeping one would mean paying again to see the rest
 * when the first choice turns out to be wrong.
 *
 * The ranking reason is shown beside each, so overruling the choice is a
 * judgement about the same evidence rather than a guess.
 */
export function ProspectContacts({
  prospectId,
  contacts,
}: {
  prospectId: string;
  contacts: ProspectContact[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SalesActionResult | null>(null);

  function select(contactId: string) {
    setResult(null);
    startTransition(async () => {
      setResult(await selectContactAction(prospectId, contactId));
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="py-4">
        {contacts.length === 0 ? (
          <p className="mb-4 text-[13px] text-muted">
            Nobody yet. Find contacts spends a Hunter credit; adding one by hand costs nothing.
          </p>
        ) : (
          <ul className="mb-4 space-y-2.5">
            {contacts.map((contact) => (
              <li
                key={contact.id}
                className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-2.5 last:border-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-[13px]">
                    <span className="font-medium text-ink">{contact.email}</span>
                    {contact.selected ? <Badge tone="accent">writing to</Badge> : null}
                    {contact.verification === 'valid' ? (
                      <Badge tone="outline">verified</Badge>
                    ) : contact.verification === 'accept_all' ? (
                      <Badge tone="warning">catch-all</Badge>
                    ) : contact.verification === 'invalid' ? (
                      <Badge tone="negative">invalid</Badge>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-[12px] text-muted">
                    {[contact.fullName, contact.role].filter(Boolean).join(' - ') || 'No name or role'}
                    {contact.emailConfidence !== undefined
                      ? ` - ${contact.emailConfidence}% confidence`
                      : ' - unscored'}
                    {contact.source === 'manual' ? ' - added by hand' : ''}
                  </p>
                </div>

                {!contact.selected ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pending || contact.verification === 'invalid'}
                    title={
                      contact.verification === 'invalid'
                        ? 'Hunter verified this address as invalid. Writing to it would bounce.'
                        : undefined
                    }
                    onClick={() => select(contact.id)}
                  >
                    Write to this one
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {result ? <Feedback result={result} /> : null}

        <div className="border-t border-line pt-4">
          <p className="mb-3 text-[13px] font-semibold text-ink">Add somebody by hand</p>
          <SalesForm action={addContactAction} submitLabel="Add and write to them">
            <input type="hidden" name="prospectId" value={prospectId} />
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="email">Email</Label>
                <div className="mt-1.5">
                  <Input id="email" name="email" type="email" placeholder="maria@example.com" />
                </div>
              </div>
              <div>
                <Label htmlFor="fullName">Name</Label>
                <div className="mt-1.5">
                  <Input id="fullName" name="fullName" placeholder="Maria Ellis" />
                </div>
              </div>
              <div>
                <Label htmlFor="role">Role</Label>
                <div className="mt-1.5">
                  <Input id="role" name="role" placeholder="Head of SEO" />
                </div>
              </div>
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-muted">
              An address added here is recorded as unverified, because nobody has checked it. That
              is the difference between a bounce we chose and one we were surprised by.
            </p>
          </SalesForm>
        </div>
      </CardContent>
    </Card>
  );
}
