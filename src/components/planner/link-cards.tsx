'use client';

import Link from 'next/link';
import { ChevronDown, ExternalLink, ShoppingBag } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { TextCell, SelectCell, DateCell, PriceCell } from './cell';
import { cn } from '@/lib/utils/cn';
import {
  ANCHOR_TYPES,
  DEFAULT_LINK_TYPES,
  type PlannerLink,
  type PlannerLinkPatch,
  type PlannerStatus,
} from '@/lib/types/planner';

/**
 * The same plan, on a phone.
 *
 * ## Why not the table
 *
 * Seventeen columns on a 390px screen is a table that scrolls sideways
 * under a thumb, and every cell a customer wants is off the right edge.
 * The brief asks for cards, and the reason is that a planner is edited on
 * the way to a meeting as often as at a desk.
 *
 * ## It edits, it does not summarise
 *
 * Every field on the card is the same editable cell the table uses -
 * literally the same components, saving the same way, failing the same
 * way. A read-only mobile view that sends somebody to a laptop to change
 * an anchor is the thing that keeps them in Excel.
 *
 * The six fields somebody actually changes are open; the rest are behind
 * "More", because a card showing seventeen fields is a form, and a list of
 * forms does not scroll.
 *
 * ## Both are rendered, and CSS picks
 *
 * The table and these cards are both in the DOM, one of them `display:
 * none`. A width measured in JavaScript cannot be known while the server
 * renders, so it either flashes the wrong one or renders nothing until the
 * browser has caught up - and a hidden element is not focusable, so the
 * duplicate inputs are not in the tab order or the accessibility tree.
 */
export function LinkCards({
  links,
  statuses,
  sources,
  currency,
  listings,
  selected,
  expanded,
  onToggleSelect,
  onToggleExpand,
  save,
}: {
  links: PlannerLink[];
  statuses: PlannerStatus[];
  sources: { value: string; label: string }[];
  currency: string;
  listings: Record<string, string>;
  selected: string[];
  expanded: string | null;
  onToggleSelect: (id: string) => void;
  onToggleExpand: (id: string) => void;
  save: (id: string) => (patch: PlannerLinkPatch) => Promise<string | null>;
}) {
  const statusOptions = (current: string) =>
    statuses
      .filter((status) => !status.archivedAt || status.id === current)
      .map((status) => ({ value: status.id, label: status.name }));

  const byId = new Map(statuses.map((status) => [status.id, status]));

  return (
    <ul aria-label="Your planned links" className="space-y-2.5">
      {links.map((link) => {
        const status = byId.get(link.statusId);
        const isSelected = selected.includes(link.id);
        const open = expanded === link.id;

        return (
          <li
            key={link.id}
            className={cn(
              'rounded-[var(--radius-card)] border border-line bg-white p-3 shadow-[var(--shadow-card)]',
              isSelected && 'border-accent-300 bg-accent-50/40',
            )}
          >
            <div className="flex items-start gap-2.5">
              <Checkbox
                checked={isSelected}
                onChange={() => onToggleSelect(link.id)}
                aria-label={`Select ${link.domain}`}
                className="mt-2"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <TextCell
                    value={link.domain}
                    ariaLabel="Domain"
                    placeholder="forbes.com"
                    className="font-semibold"
                    onSave={(domain) => save(link.id)({ domain })}
                  />
                  {listings[link.domainKey] ? (
                    <Link
                      href={`/websites/${listings[link.domainKey]}`}
                      target="_blank"
                      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent-50 px-1.5 py-0.5 text-[10px] font-semibold text-accent-700 ring-1 ring-accent-200 ring-inset"
                      title={`${link.domain} is available on the Press Parrot marketplace`}
                    >
                      <ShoppingBag className="h-2.5 w-2.5" aria-hidden="true" />
                      <span className="sr-only">Available on Press Parrot: </span>
                      PP
                    </Link>
                  ) : null}
                </div>

                <div className="mt-1.5 flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: status?.colour ?? '#cbd5e1' }}
                  />
                  <SelectCell
                    value={link.statusId}
                    options={statusOptions(link.statusId)}
                    placeholder="Status"
                    ariaLabel="Status"
                    onSave={(statusId) => save(link.id)({ statusId })}
                  />
                </div>
              </div>
            </div>

            {/* The four metrics, read-only-looking but editable, in the one
                place they fit: a row of small figures under the domain.
                A dash rather than a zero, because nobody has looked. */}
            {/* Two across on a phone, four once there is room. Four
                columns at 390px truncates "6,810,000" to "681000", and a
                traffic figure that reads as a tenth of itself is worse
                than one that wraps. */}
            <dl className="mt-2.5 grid grid-cols-2 gap-2 border-t border-line pt-2.5 sm:grid-cols-4">
              <Metric
                label="DR"
                value={link.domainRating}
                max={100}
                ariaLabel="Domain rating"
                onSave={(value) =>
                  save(link.id)({ domainRating: value, metricsSource: 'manual' })
                }
              />
              <Metric
                label="Traffic"
                value={link.organicTraffic}
                ariaLabel="Organic traffic"
                onSave={(value) =>
                  save(link.id)({ organicTraffic: value, metricsSource: 'manual' })
                }
              />
              <Metric
                label="Keywords"
                value={link.organicKeywords}
                ariaLabel="Organic keywords"
                onSave={(value) =>
                  save(link.id)({ organicKeywords: value, metricsSource: 'manual' })
                }
              />
              <Metric
                label="Ref. dom."
                value={link.referringDomains}
                ariaLabel="Referring domains"
                onSave={(value) =>
                  save(link.id)({ referringDomains: value, metricsSource: 'manual' })
                }
              />
            </dl>

            <div className="mt-2.5 grid grid-cols-2 gap-2.5">
              <Field label="Price">
                <PriceCell
                  minor={link.priceMinor}
                  currency={link.currency ?? currency}
                  ariaLabel="Price"
                  onSave={(priceMinor) =>
                    save(link.id)({ priceMinor, currency: link.currency ?? currency })
                  }
                />
              </Field>
              <Field label="Planned">
                <DateCell
                  value={link.plannedDate}
                  ariaLabel="Planned date"
                  onSave={(plannedDate) => save(link.id)({ plannedDate })}
                />
              </Field>
            </div>

            <button
              type="button"
              onClick={() => onToggleExpand(link.id)}
              aria-expanded={open}
              className="mt-2.5 flex w-full items-center justify-center gap-1 rounded-md border border-line py-1.5 text-[12px] font-medium text-muted hover:text-ink"
            >
              {open ? 'Less' : 'More'}
              <ChevronDown
                className={cn('h-3 w-3 transition-transform', open && 'rotate-180')}
                aria-hidden="true"
              />
            </button>

            {open ? (
              <div className="mt-2.5 space-y-2.5 border-t border-line pt-2.5">
                <div className="grid grid-cols-2 gap-2.5">
                  <Field label="Source">
                    <SelectCell
                      value={link.source}
                      options={sources}
                      ariaLabel="Where this link came from"
                      onSave={(source) => save(link.id)({ source })}
                    />
                  </Field>
                  <Field label="Link type">
                    <SelectCell
                      value={link.linkType}
                      options={DEFAULT_LINK_TYPES.map((type) => ({ value: type, label: type }))}
                      ariaLabel="Link type"
                      onSave={(linkType) => save(link.id)({ linkType })}
                    />
                  </Field>
                </div>

                <Field label="Target page">
                  <TextCell
                    value={link.targetUrl ?? ''}
                    type="url"
                    placeholder="https://example.com/page"
                    ariaLabel="The page receiving the link"
                    onSave={(targetUrl) => save(link.id)({ targetUrl })}
                  />
                </Field>

                <div className="grid grid-cols-2 gap-2.5">
                  <Field label="Anchor text">
                    <TextCell
                      value={link.anchorText}
                      placeholder="anchor text"
                      ariaLabel="Anchor text"
                      onSave={(anchorText) => save(link.id)({ anchorText })}
                    />
                  </Field>
                  <Field label="Anchor type">
                    <SelectCell
                      value={link.anchorType}
                      options={ANCHOR_TYPES.map((type) => ({ value: type, label: type }))}
                      ariaLabel="Anchor type"
                      onSave={(anchorType) => save(link.id)({ anchorType })}
                    />
                  </Field>
                </div>

                <Field label="Live date">
                  <DateCell
                    value={link.liveDate}
                    ariaLabel="Date it went live"
                    onSave={(liveDate) => save(link.id)({ liveDate })}
                  />
                </Field>

                <Field label="Live link">
                  <div className="flex items-center gap-1">
                    <TextCell
                      value={link.liveUrl ?? ''}
                      type="url"
                      placeholder="Enter live link..."
                      ariaLabel="The published article"
                      onSave={(liveUrl) => save(link.id)({ liveUrl })}
                    />
                    {link.liveUrl ? (
                      <a
                        href={link.liveUrl}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="shrink-0 text-muted hover:text-accent-700"
                        aria-label={`Open ${link.domain}'s live link in a new tab`}
                      >
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                    ) : null}
                  </div>
                </Field>

                <Field label="Notes">
                  <TextCell
                    value={link.notes}
                    placeholder="Publisher wants 800 words."
                    ariaLabel={`Notes for ${link.domain}`}
                    onSave={(notes) => save(link.id)({ notes })}
                  />
                </Field>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[11px] font-semibold tracking-[0.04em] text-muted uppercase">
        {label}
      </span>
      {children}
    </label>
  );
}

function Metric({
  label,
  value,
  max = 2_000_000_000,
  ariaLabel,
  onSave,
}: {
  label: string;
  value: number | null;
  max?: number;
  ariaLabel: string;
  onSave: (value: number | null) => Promise<string | null>;
}) {
  return (
    <div>
      <dt className="text-[10px] tracking-[0.04em] text-muted uppercase">{label}</dt>
      <dd>
        <TextCell
          value={value === null ? '' : String(value)}
          type="number"
          placeholder="—"
          ariaLabel={ariaLabel}
          onSave={(next) => {
            if (next === '') return onSave(null);
            const parsed = Number(next);
            if (!Number.isFinite(parsed) || parsed < 0) return Promise.resolve('Enter a number.');
            return onSave(Math.min(Math.round(parsed), max));
          }}
        />
      </dd>
    </div>
  );
}
