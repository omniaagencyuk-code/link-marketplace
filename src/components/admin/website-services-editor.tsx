'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatPrice } from '@/lib/utils/format';
import type { LinkTypeSlug, Website } from '@/lib/types';

/**
 * What a website sells, and what it makes us.
 *
 * The service types are ticked first and everything else follows from them.
 * That ordering matters for more than tidiness: a niche edit is a link added
 * to an article that already exists, so asking for a word count is asking a
 * question with no answer. The word count fields elsewhere in the form appear
 * only when a type that involves writing is selected, which is why this
 * component reports its selection upwards rather than owning it.
 *
 * Cost is our buy price. It is stored in a table no customer can read and is
 * stripped from every customer-facing payload, so it is safe to put beside the
 * sell price where whoever is entering one can see the other.
 */

export const SERVICE_TYPES: { type: LinkTypeSlug; label: string; help: string; writes: boolean }[] =
  [
    {
      type: 'guest-post',
      label: 'Guest post',
      help: 'A new article, written for the publisher and carrying your link.',
      writes: true,
    },
    {
      type: 'niche-edit',
      label: 'Niche edit',
      help: 'A link added to an article the publisher has already published.',
      writes: false,
    },
    {
      type: 'digital-pr',
      label: 'Digital PR',
      help: 'Editorial coverage placed through the publication itself.',
      writes: true,
    },
  ];

/** True when any selected type involves writing an article. */
export function needsWordCount(selected: Set<LinkTypeSlug>): boolean {
  return SERVICE_TYPES.some((entry) => entry.writes && selected.has(entry.type));
}

function majorUnits(minor: number | undefined): string {
  return typeof minor === 'number' ? String(minor / 100) : '';
}

export function WebsiteServicesEditor({
  website,
  selected,
  onToggle,
  currency,
}: {
  website?: Website;
  selected: Set<LinkTypeSlug>;
  onToggle: (type: LinkTypeSlug, on: boolean) => void;
  currency: string;
}) {
  return (
    <div className="space-y-3">
      {SERVICE_TYPES.map((entry) => {
        const existing = website?.services.find((service) => service.type === entry.type);
        const on = selected.has(entry.type);

        return (
          <div
            key={entry.type}
            className={
              on
                ? 'rounded-[var(--radius-card)] border border-accent-300 bg-accent-50/40 p-4'
                : 'rounded-[var(--radius-card)] border border-line bg-white p-4'
            }
          >
            <label className="flex cursor-pointer items-start gap-2.5">
              <span className="mt-0.5">
                <Checkbox
                  name={`service_${entry.type}`}
                  checked={on}
                  onChange={(event) => onToggle(entry.type, event.target.checked)}
                />
              </span>
              <span>
                <span className="block text-[14px] font-semibold text-ink">{entry.label}</span>
                <span className="mt-0.5 block text-[12px] text-muted">{entry.help}</span>
              </span>
            </label>

            {on ? (
              <div className="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-3">
                <div>
                  <Label htmlFor={`price_${entry.type}`}>Sell price</Label>
                  <div className="mt-1.5">
                    <Input
                      id={`price_${entry.type}`}
                      name={`price_${entry.type}`}
                      type="number"
                      min={0}
                      step={5}
                      defaultValue={majorUnits(existing?.priceMinor)}
                      placeholder="0"
                    />
                  </div>
                  <p className="mt-1 text-[12px] text-muted">What the customer pays.</p>
                </div>

                <div>
                  <Label htmlFor={`cost_${entry.type}`}>Cost price</Label>
                  <div className="mt-1.5">
                    <Input
                      id={`cost_${entry.type}`}
                      name={`cost_${entry.type}`}
                      type="number"
                      min={0}
                      step={5}
                      defaultValue={majorUnits(existing?.costPriceMinor)}
                      placeholder="Not recorded"
                    />
                  </div>
                  <p className="mt-1 text-[12px] text-muted">
                    What we pay the publisher. Internal only - never shown to customers.
                  </p>
                </div>

                <div>
                  <Label htmlFor={`note_${entry.type}`}>Note</Label>
                  <div className="mt-1.5">
                    <Input
                      id={`note_${entry.type}`}
                      name={`note_${entry.type}`}
                      defaultValue={existing?.note ?? ''}
                      placeholder="e.g. Includes writing"
                      maxLength={120}
                    />
                  </div>
                  {existing && typeof existing.costPriceMinor === 'number' ? (
                    <p className="mt-1 text-[12px] text-muted">
                      Currently{' '}
                      <span className="font-medium text-ink">
                        {formatPrice(existing.priceMinor - existing.costPriceMinor, { currency })}
                      </span>{' '}
                      profit.
                    </p>
                  ) : (
                    <p className="mt-1 text-[12px] text-muted">Shown on the listing.</p>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        );
      })}

      {selected.size === 0 ? (
        <p className="text-[13px] text-muted">
          Tick at least one. A website with no services cannot be ordered, so it will not appear in
          the marketplace even when active.
        </p>
      ) : null}
    </div>
  );
}
