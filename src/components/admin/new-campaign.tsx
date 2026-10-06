'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SalesForm } from '@/components/admin/sales-controls';
import { createCampaignAction } from '@/app/admin/(protected)/sales/actions';
import { salesSegments } from '@/lib/config/sales-segments';

/**
 * A new campaign.
 *
 * The angle field is the one that needs explaining: it is guidance for the
 * writer, not copy. Each email is still written from that company's own site
 * and our real inventory, so an angle pasted in as finished prose produces
 * forty emails that read like a template - which is what they would be.
 */
export function NewCampaign() {
  return (
    <Card>
      <CardContent className="py-5">
        <h2 className="mb-3 text-[13px] font-semibold text-ink">New campaign</h2>
        <SalesForm action={createCampaignAction} submitLabel="Create">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="name">Name</Label>
              <div className="mt-1.5">
                <Input id="name" name="name" placeholder="iGaming affiliates, Q1" />
              </div>
            </div>
            <div>
              <Label htmlFor="segment">Aimed at</Label>
              <select
                id="segment"
                name="segment"
                defaultValue=""
                className="mt-1.5 w-full rounded-lg border border-line bg-white px-3 py-2 text-[13px] text-ink focus:border-navy-900 focus:outline-none"
              >
                <option value="">Any segment</option>
                {salesSegments
                  .filter((segment) => segment.slug !== 'publisher_network')
                  .map((segment) => (
                    <option key={segment.slug} value={segment.slug}>
                      {segment.label}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <Label htmlFor="minScore">Minimum score</Label>
              <div className="mt-1.5">
                <Input id="minScore" name="minScore" type="number" min={0} max={100} placeholder="Leave blank for the default" />
              </div>
            </div>
          </div>

          <div className="mt-3">
            <Label htmlFor="angle">Angle</Label>
            <textarea
              id="angle"
              name="angle"
              rows={3}
              placeholder="What tends to matter to this kind of buyer - e.g. they need sites that accept gambling at all, and the price before asking."
              className="mt-1.5 w-full rounded-lg border border-line bg-white px-3 py-2 text-[13px] leading-relaxed text-ink placeholder:text-muted focus:border-navy-900 focus:outline-none"
            />
            <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
              Guidance for the writer, not copy. Each email is written from that company&rsquo;s own
              site and our real listings - an angle pasted in as finished prose produces twenty
              emails that read like a template, because they would be one. Leave it blank to use
              the segment&rsquo;s own.
            </p>
          </div>
        </SalesForm>
      </CardContent>
    </Card>
  );
}
