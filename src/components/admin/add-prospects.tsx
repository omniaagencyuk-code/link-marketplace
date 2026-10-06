'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { SalesForm } from '@/components/admin/sales-controls';
import { addProspectsAction } from '@/app/admin/(protected)/sales/actions';
import { salesSegments } from '@/lib/config/sales-segments';

/**
 * Paste a list of companies.
 *
 * A textarea rather than a file upload, deliberately: what people actually
 * have is a column copied out of a spreadsheet or a browser tab, and asking
 * them to save a CSV first asks them to do a conversion so this form does not
 * have to.
 *
 * A segment can be set for the whole paste because lists usually arrive
 * sorted - "here are forty iGaming affiliates". Where it is wrong, research
 * overwrites it: the guess only moves a segment nobody has decided.
 */
export function AddProspects() {
  return (
    <Card>
      <CardContent className="py-5">
        <SalesForm action={addProspectsAction} submitLabel="Add them">
          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <div>
              <Label htmlFor="domains">Domains</Label>
              <textarea
                id="domains"
                name="domains"
                rows={6}
                placeholder={'northfieldseo.com\nAcme Affiliates, acmeaffiliates.co.uk\nhttps://www.example.com/about'}
                className="mt-1.5 w-full rounded-lg border border-line bg-white px-3 py-2 font-mono text-[13px] text-ink placeholder:text-muted focus:border-navy-900 focus:outline-none"
              />
              <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
                One per line. Either a domain on its own, or{' '}
                <code className="rounded bg-surface-sunken px-1">Company Name, domain.com</code>. A
                full URL is fine - the protocol, www and path are stripped, the same way the
                publisher importer strips them, so the same company pasted twice in two spellings
                is one prospect.
              </p>
            </div>

            <div>
              <Label htmlFor="segment">They are mostly</Label>
              <select
                id="segment"
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
                Leave it on Other if the list is mixed. Research works the segment out from their
                own copy and only fills in one nobody has set.
              </p>
            </div>
          </div>
        </SalesForm>
      </CardContent>
    </Card>
  );
}
