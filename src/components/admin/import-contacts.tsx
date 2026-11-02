'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { SalesForm } from '@/components/admin/sales-controls';
import { importContactsAction } from '@/app/admin/(protected)/sales/actions';
import { salesSegments } from '@/lib/config/sales-segments';

/**
 * A Hunter export, uploaded.
 *
 * A file input rather than a textarea, which is the opposite of the choice
 * `AddProspects` makes next to it and for the same underlying reason: take
 * what people actually have. A list of domains is a column somebody copied;
 * a Hunter result is a file they downloaded, and a thousand rows of it is
 * not something anybody pastes.
 *
 * The two forms sit together because they are two answers to one question -
 * how do these companies get into the pipeline - and which one to use
 * depends on whether the addresses are already paid for.
 */
export function ImportContacts() {
  return (
    <Card>
      <CardContent className="py-5">
        <SalesForm action={importContactsAction} submitLabel="Import the file">
          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <div>
              <Label htmlFor="file">Hunter CSV</Label>
              <input
                id="file"
                name="file"
                type="file"
                accept=".csv,text/csv"
                className="mt-1.5 w-full rounded-lg border border-line bg-white px-3 py-2 text-[13px] text-ink file:mr-3 file:rounded file:border-0 file:bg-surface-sunken file:px-3 file:py-1 file:text-[12px] file:text-ink hover:file:bg-line focus:border-navy-900 focus:outline-none"
              />
              <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
                A Domain Search or Bulk export, as it downloads. Columns are found by their
                heading, so the order does not matter and extra columns are ignored.
              </p>
              {/*
                The sentence that decides whether somebody uses this form or
                the sweep. Both end with contacts on a prospect; only one of
                them charges for addresses that are already paid for.
              */}
              <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
                <strong className="font-semibold text-ink">No Hunter credits are spent.</strong>{' '}
                The export was already paid for, so nothing here calls the API - which is the
                reason to use it rather than running a contact sweep over the same companies.
              </p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
                Everyone in the file is kept, and the recipient is picked by the same ranking the
                sweep uses - so support, billing and recruitment addresses are never the one
                chosen. Addresses Hunter marks invalid are not imported at all.
              </p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
                Companies already in the pipeline keep their place and gain the contacts; nothing
                is duplicated. Up to about 4MB a file.
              </p>
            </div>

            <div>
              <Label htmlFor="import-segment">They are mostly</Label>
              <select
                id="import-segment"
                name="segment"
                defaultValue="other"
                className="mt-1.5 w-full rounded-lg border border-line bg-white px-3 py-2 text-[13px] text-ink focus:border-navy-900 focus:outline-none"
              >
                {salesSegments.map((segment) => (
                  <option key={segment.slug} value={segment.slug}>
                    {segment.label}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
                Only used for companies this file adds. One already in the pipeline keeps the
                segment it has, and research overwrites a guess nobody has decided.
              </p>
            </div>
          </div>
        </SalesForm>
      </CardContent>
    </Card>
  );
}
