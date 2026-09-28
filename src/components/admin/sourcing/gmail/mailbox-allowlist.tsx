'use client';

import { useState, useTransition } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  addMailboxAction,
  removeMailboxAction,
  setMailboxEnabledAction,
} from '@/app/admin/(protected)/sourcing/gmail/actions';
import type { Mailbox } from '@/lib/services/gmail-import-service';

/**
 * Which mailboxes may be read.
 *
 * This list is the security boundary, not a convenience. The service account
 * can open any mailbox in the workspace, and the only reason it does not is
 * that every address is checked against this table server side before a token
 * is minted. The wording says so, because somebody will one day wonder why
 * they cannot just type an address into the import form.
 */
export function MailboxAllowlist({ mailboxes }: { mailboxes: Mailbox[] }) {
  const [busy, startTransition] = useTransition();
  const [address, setAddress] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mailboxes we may read</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-[12px] leading-relaxed text-muted">
          Only these addresses can be imported from. The service account could technically open any
          mailbox in the workspace, so this list is what stops it - an address that is not here is
          refused by the server, not just hidden from this page.
        </p>

        {mailboxes.length > 0 ? (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {mailboxes.map((mailbox) => (
              <li key={mailbox.address} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <span className="flex-1 text-[13px] text-ink">
                  {mailbox.address}
                  {mailbox.label ? (
                    <span className="ml-1.5 text-[12px] text-muted">{mailbox.label}</span>
                  ) : null}
                </span>
                <label className="flex items-center gap-1.5 text-[12px] text-muted">
                  <input
                    type="checkbox"
                    checked={mailbox.enabled}
                    disabled={busy}
                    onChange={(event) =>
                      startTransition(async () => {
                        await setMailboxEnabledAction(mailbox.address, event.target.checked);
                      })
                    }
                    className="h-3.5 w-3.5 accent-[var(--color-accent-600)]"
                  />
                  enabled
                </label>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    startTransition(async () => {
                      await removeMailboxAction(mailbox.address);
                    })
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border border-line bg-surface-sunken px-3 py-2 text-[12px] text-muted">
            No mailboxes yet. Add the addresses you send outreach from.
          </p>
        )}

        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[220px] flex-1">
            <Label htmlFor="mailbox-address">Address</Label>
            <Input
              id="mailbox-address"
              value={address}
              placeholder="info@omniaagency.uk"
              disabled={busy}
              className="mt-1.5 h-8 text-[13px]"
              onChange={(event) => setAddress(event.target.value)}
            />
          </div>
          <div className="min-w-[140px] flex-1">
            <Label htmlFor="mailbox-label">Label (optional)</Label>
            <Input
              id="mailbox-label"
              value={label}
              placeholder="Outreach"
              disabled={busy}
              className="mt-1.5 h-8 text-[13px]"
              onChange={(event) => setLabel(event.target.value)}
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={busy || !address.trim()}
            onClick={() =>
              startTransition(async () => {
                const result = await addMailboxAction({ address, label });
                setError(result.ok ? null : (result.error ?? 'That mailbox could not be saved.'));
                if (result.ok) {
                  setAddress('');
                  setLabel('');
                }
              })
            }
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Add
          </Button>
        </div>
        {error ? <p className="text-[12px] text-negative">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
