'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, Layers, Quote, Wand2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

import {
  approveDraftAction,
  approveEmailBatchAction,
  rejectDraftAction,
  spreadGeneralPriceAction,
} from '@/app/admin/(protected)/sourcing/actions';
import { acceptedNicheLabel, sensitiveNicheSlugs } from '@/lib/config/accepted-niches';
import { assumedNiches } from '@/lib/sourcing/review';
import { formatDateTime } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import type { ExtractedListing } from '@/lib/sourcing/schema';

type Current = {
  domain: string;
  status: string;
  guest_post_cost: number | null;
  link_insertion_cost: number | null;
  contact_email: string | null;
  contact_name: string | null;
  min_word_count: number;
  max_word_count: number;
  max_links: number;
  accepted: Record<string, boolean>;
} | null;

/**
 * Checking one extraction.
 *
 * Everything is editable, because the reviewer is the authority and the model
 * is a first draft. What the model was unsure about is marked, and what it
 * read each value from is one hover away - the quote is the whole basis for
 * trusting a number, so it must not be buried.
 */
export function DraftReview({
  draftId,
  domain,
  status,
  flags,
  values,
  confidence,
  evidence,
  current,
  email,
  siblingCount,
  extractedBy,
}: {
  draftId: string;
  domain: string;
  status: string;
  flags: string[];
  values: ExtractedListing;
  confidence: Record<string, string>;
  evidence: Record<string, string>;
  current: Current;
  siblingCount: number;
  email: {
    fromAddress: string;
    fromName: string | null;
    subject: string | null;
    sentAt: string | null;
    body: string;
    askedAboutDomain: string | null;
  };
  extractedBy: string;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<ExtractedListing>(values);
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  const reviewed = status !== 'pending';

  function set<K extends keyof ExtractedListing>(key: K, value: ExtractedListing[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function setNiche(slug: string, patch: Partial<ExtractedListing['niches'][string]>) {
    setDraft((current) => ({
      ...current,
      niches: { ...current.niches, [slug]: { ...current.niches[slug]!, ...patch } },
    }));
  }

  const singlePrice = flags.includes('single-price-confirm-niches');
  const assumed = assumedNiches(draft);
  const edited = JSON.stringify(draft) !== JSON.stringify(values);
  const [spreadEdits, setSpreadEdits] = useState(true);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* ------------------------------------------------------- the email */}
      <Card className="lg:sticky lg:top-4 lg:self-start">
        <CardHeader>
          <CardTitle>The reply</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <dl className="space-y-1 text-[12px]">
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 text-muted">From</dt>
              <dd className="text-ink">
                {email.fromName ? `${email.fromName} · ` : ''}
                {email.fromAddress}
              </dd>
            </div>
            {email.subject ? (
              <div className="flex gap-2">
                <dt className="w-16 shrink-0 text-muted">Subject</dt>
                <dd className="text-ink">{email.subject}</dd>
              </div>
            ) : null}
            {email.sentAt ? (
              <div className="flex gap-2">
                <dt className="w-16 shrink-0 text-muted">Received</dt>
                <dd className="tabular text-ink">{formatDateTime(email.sentAt)}</dd>
              </div>
            ) : null}
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 text-muted">We asked</dt>
              <dd className="text-ink">
                {email.askedAboutDomain ?? 'about "your website" - no domain named'}
              </dd>
            </div>
          </dl>

          <pre className="max-h-[32rem] overflow-auto rounded-lg border border-line bg-surface-sunken p-3 text-[12px] leading-relaxed whitespace-pre-wrap text-ink-soft">
            {email.body}
          </pre>
          <p className="text-[11px] text-muted">Read by {extractedBy}.</p>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------ the reading */}
      <div className="space-y-5">
        {flags.length > 0 ? (
          <Card>
            <CardContent className="space-y-3 py-4">
              {singlePrice ? (
                <div className="space-y-2">
                  <p className="flex items-start gap-2 text-[13px] text-ink">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-negative" aria-hidden="true" />
                    This reply gave one price and never mentioned topics. Every niche is left
                    unknown, because a publisher who has not mentioned gambling has not agreed to
                    carry it.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy || reviewed}
                    onClick={() =>
                      startTransition(async () => {
                        const result = await spreadGeneralPriceAction(draft);
                        if (result.ok && result.values) setDraft(result.values);
                      })
                    }
                  >
                    <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Apply general price to all niches
                  </Button>
                </div>
              ) : null}

              {flags.filter((flag) => flag !== 'single-price-confirm-niches').length > 0 ? (
                <ul className="space-y-1 text-[12px] text-muted">
                  {flags
                    .filter((flag) => flag !== 'single-price-confirm-niches')
                    .map((flag) => (
                      <li key={flag}>
                        {flag === 'terms-from-network'
                          ? 'These terms were quoted for the publisher\u2019s network as a whole, not for this domain by name. The prices are the network rate.'
                          : flag === 'different-site-offered'
                          ? `They offered a different site: ${draft.relationship ?? 'see notes'}`
                          : flag === 'price-changes-later'
                            ? 'These rates change on a date given in the email - check the validity fields.'
                            : flag === 'no-contact-email'
                              ? 'No contact address was found in the reply. The sender address is used unless you set one.'
                              : flag}
                      </li>
                    ))}
                </ul>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>What we pay</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Currency"
                field="currency"
                confidence={confidence}
                evidence={evidence}
              >
                <Input
                  value={draft.currency ?? ''}
                  placeholder="EUR"
                  maxLength={3}
                  disabled={reviewed}
                  onChange={(event) => set('currency', event.target.value.toUpperCase() || null)}
                />
              </Field>
              <Money
                label="Guest post (we supply content)"
                field="guest_post_cost"
                value={draft.guest_post_cost}
                was={current?.guest_post_cost ?? null}
                currency={draft.currency}
                confidence={confidence}
                evidence={evidence}
                disabled={reviewed}
                onChange={(value) => set('guest_post_cost', value)}
              />
              <Money
                label="Guest post (they write it)"
                field="guest_post_cost_written_by_publisher"
                value={draft.guest_post_cost_written_by_publisher}
                was={null}
                currency={draft.currency}
                confidence={confidence}
                evidence={evidence}
                disabled={reviewed}
                onChange={(value) => set('guest_post_cost_written_by_publisher', value)}
              />
              <Money
                label="Link insertion"
                field="link_insertion_cost"
                value={draft.link_insertion_cost}
                was={current?.link_insertion_cost ?? null}
                currency={draft.currency}
                confidence={confidence}
                evidence={evidence}
                disabled={reviewed}
                onChange={(value) => set('link_insertion_cost', value)}
              />
            </div>

            {/* Recurring placements. Not sold in the marketplace, but they are
                often the most valuable thing in a reply and were invisible
                here until a publisher quoted both and neither appeared. */}
            <div className="grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
              <Periodic
                label="Homepage link"
                field="homepage_link_cost"
                value={draft.homepage_link_cost}
                period={draft.homepage_link_period}
                currency={draft.currency}
                confidence={confidence}
                evidence={evidence}
                disabled={reviewed}
                onValue={(value) => set('homepage_link_cost', value)}
                onPeriod={(value) => set('homepage_link_period', value)}
              />
              <Periodic
                label="Banner"
                field="banner_cost"
                value={draft.banner_cost}
                period={draft.banner_period}
                currency={draft.currency}
                confidence={confidence}
                evidence={evidence}
                disabled={reviewed}
                onValue={(value) => set('banner_cost', value)}
                onPeriod={(value) => set('banner_period', value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Topics</CardTitle>
            {assumed.length > 0 ? (
              <span className="inline-flex items-center gap-1 rounded bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">
                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                {assumed.length} of {sensitiveNicheSlugs.length} assumed
              </span>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-2">
            {assumed.length > 0 ? (
              <p className="mb-1 rounded-lg border border-line bg-surface-sunken px-3 py-2 text-[12px] leading-relaxed text-ink-soft">
                This reply says nothing about{' '}
                <strong className="font-medium text-ink">
                  {assumed.map((slug) => acceptedNicheLabel(slug)).join(', ')}
                </strong>
                . They will be sold as accepted at the standard rate. Set any of them to Refused if
                you know otherwise, or ask the publisher before pricing them.
              </p>
            ) : null}
            {sensitiveNicheSlugs.map((slug) => {
              const terms = draft.niches[slug];
              if (!terms) return null;
              const wasAccepted = current?.accepted?.[slug];
              return (
                <div
                  key={slug}
                  className="grid items-center gap-2 border-b border-line pb-2 last:border-0 sm:grid-cols-[minmax(0,1fr)_7rem_6rem_6rem]"
                >
                  <span className="text-[13px] text-ink">
                    {acceptedNicheLabel(slug)}
                    {terms.accepted === 'unknown' ? (
                      <span
                        title="The email does not mention this topic. It will be sold as accepted."
                        className="ml-1.5 rounded bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-warning"
                      >
                        assumed
                      </span>
                    ) : null}
                    {wasAccepted !== undefined && wasAccepted !== (terms.accepted !== 'no') ? (
                      <span className="ml-1.5 text-[11px] text-muted">
                        (was {wasAccepted ? 'accepted' : 'not accepted'})
                      </span>
                    ) : null}
                  </span>
                  <Select
                    size="sm"
                    aria-label={`${acceptedNicheLabel(slug)} accepted`}
                    value={terms.accepted}
                    disabled={reviewed}
                    onChange={(event) =>
                      setNiche(slug, { accepted: event.target.value as 'yes' | 'no' | 'unknown' })
                    }
                  >
                    <option value="yes">Accepted - they said so</option>
                    <option value="no">Refused</option>
                    <option value="unknown">Not stated - will be accepted</option>
                  </Select>
                  <Input
                    type="number"
                    aria-label={`${acceptedNicheLabel(slug)} guest post cost`}
                    placeholder="Post"
                    value={terms.guest_post_cost ?? ''}
                    disabled={reviewed}
                    className="h-8 text-[12px]"
                    onChange={(event) =>
                      setNiche(slug, {
                        guest_post_cost: event.target.value ? Number(event.target.value) : null,
                      })
                    }
                  />
                  <Input
                    type="number"
                    aria-label={`${acceptedNicheLabel(slug)} link insertion cost`}
                    placeholder="Insert"
                    value={terms.link_insertion_cost ?? ''}
                    disabled={reviewed}
                    className="h-8 text-[12px]"
                    onChange={(event) =>
                      setNiche(slug, {
                        link_insertion_cost: event.target.value ? Number(event.target.value) : null,
                      })
                    }
                  />
                </div>
              );
            })}
            <p className="pt-1 text-[11px] text-muted">
              A topic the email never mentions is sold as accepted. Only mark one{' '}
              <strong className="font-medium text-ink-soft">Refused</strong> when the publisher
              actually said no - that is the one setting here that stops a sale.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Publishing terms</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Field label="Links" field="dofollow" confidence={confidence} evidence={evidence}>
              <Select
                value={draft.dofollow}
                disabled={reviewed}
                onChange={(event) => set('dofollow', event.target.value as 'yes' | 'no' | 'unknown')}
              >
                <option value="yes">Dofollow</option>
                <option value="no">Nofollow</option>
                <option value="unknown">Not stated</option>
              </Select>
            </Field>
            <Field label="Sponsored tag" field="sponsored_tag" confidence={confidence} evidence={evidence}>
              <Select
                value={draft.sponsored_tag}
                disabled={reviewed}
                onChange={(event) =>
                  set('sponsored_tag', event.target.value as ExtractedListing['sponsored_tag'])
                }
              >
                <option value="yes">Always tagged</option>
                <option value="no">Never tagged</option>
                <option value="depends">Depends</option>
                <option value="unknown">Not stated</option>
              </Select>
            </Field>

            <Field
              label="Dofollow expires after (months)"
              field="dofollow_expires_after_months"
              confidence={confidence}
              evidence={evidence}
            >
              <Input
                type="number"
                value={draft.dofollow_expires_after_months ?? ''}
                disabled={reviewed}
                onChange={(event) =>
                  set('dofollow_expires_after_months', numberOrNull(event.target.value))
                }
              />
            </Field>
            <Field label="Permanence" field="permanence" confidence={confidence} evidence={evidence}>
              <Select
                value={draft.permanence}
                disabled={reviewed}
                onChange={(event) =>
                  set('permanence', event.target.value as ExtractedListing['permanence'])
                }
              >
                <option value="permanent">Permanent</option>
                <option value="fixed-term">Fixed term</option>
                <option value="unknown">Not stated</option>
              </Select>
            </Field>

            <Field label="Minimum months live" field="min_live_months" confidence={confidence} evidence={evidence}>
              <Input
                type="number"
                value={draft.min_live_months ?? ''}
                disabled={reviewed}
                onChange={(event) => set('min_live_months', numberOrNull(event.target.value))}
              />
            </Field>
            <Field label="Max links per article" field="max_links" confidence={confidence} evidence={evidence}>
              <Input
                type="number"
                value={draft.max_links ?? ''}
                disabled={reviewed}
                onChange={(event) => set('max_links', numberOrNull(event.target.value))}
              />
            </Field>

            <Field label="Word count, from" field="min_word_count" confidence={confidence} evidence={evidence}>
              <Input
                type="number"
                value={draft.min_word_count ?? ''}
                disabled={reviewed}
                onChange={(event) => set('min_word_count', numberOrNull(event.target.value))}
              />
            </Field>
            <Field label="Word count, to" field="max_word_count" confidence={confidence} evidence={evidence}>
              <Input
                type="number"
                value={draft.max_word_count ?? ''}
                disabled={reviewed}
                onChange={(event) => set('max_word_count', numberOrNull(event.target.value))}
              />
            </Field>

            <Field label="Turnaround, from (days)" field="turnaround_min_days" confidence={confidence} evidence={evidence}>
              <Input
                type="number"
                value={draft.turnaround_min_days ?? ''}
                disabled={reviewed}
                onChange={(event) => set('turnaround_min_days', numberOrNull(event.target.value))}
              />
            </Field>
            <Field label="Turnaround, to (days)" field="turnaround_max_days" confidence={confidence} evidence={evidence}>
              <Input
                type="number"
                value={draft.turnaround_max_days ?? ''}
                disabled={reviewed}
                onChange={(event) => set('turnaround_max_days', numberOrNull(event.target.value))}
              />
            </Field>

            <Field label="Link insertion offered" field="link_insertion_offered" confidence={confidence} evidence={evidence}>
              <Select
                value={draft.link_insertion_offered}
                disabled={reviewed}
                onChange={(event) =>
                  set('link_insertion_offered', event.target.value as 'yes' | 'no' | 'unknown')
                }
              >
                <option value="yes">Offered</option>
                <option value="no">Not offered</option>
                <option value="unknown">Not stated</option>
              </Select>
            </Field>
            <Field label="Appears on the homepage" field="homepage_placement" confidence={confidence} evidence={evidence}>
              <Select
                value={draft.homepage_placement}
                disabled={reviewed}
                onChange={(event) =>
                  set('homepage_placement', event.target.value as 'yes' | 'no' | 'unknown')
                }
              >
                <option value="yes">Yes</option>
                <option value="no">No</option>
                <option value="unknown">Not stated</option>
              </Select>
            </Field>

            <Field label="Language" field="language" confidence={confidence} evidence={evidence}>
              <Input
                value={draft.language ?? ''}
                placeholder="e.g. cs"
                disabled={reviewed}
                onChange={(event) => set('language', event.target.value || null)}
              />
            </Field>
            <Field label="Topic restriction" field="topic_restriction" confidence={confidence} evidence={evidence}>
              <Input
                value={draft.topic_restriction ?? ''}
                placeholder="e.g. motorsport only"
                disabled={reviewed}
                onChange={(event) => set('topic_restriction', event.target.value || null)}
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Commercial terms</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Field label="Prices exclude VAT" field="prices_exclude_vat" confidence={confidence} evidence={evidence}>
              <Select
                value={draft.prices_exclude_vat === null ? 'unknown' : draft.prices_exclude_vat ? 'yes' : 'no'}
                disabled={reviewed}
                onChange={(event) =>
                  set(
                    'prices_exclude_vat',
                    event.target.value === 'unknown' ? null : event.target.value === 'yes',
                  )
                }
              >
                <option value="yes">Yes, VAT is on top</option>
                <option value="no">No, prices include VAT</option>
                <option value="unknown">Not stated</option>
              </Select>
            </Field>
            <Field label="When they want paying" field="payment_timing" confidence={confidence} evidence={evidence}>
              <Select
                value={draft.payment_timing}
                disabled={reviewed}
                onChange={(event) =>
                  set('payment_timing', event.target.value as ExtractedListing['payment_timing'])
                }
              >
                <option value="prepaid">Up front</option>
                <option value="on-publication">On publication</option>
                <option value="after-live-link">After the link is live</option>
                <option value="unknown">Not stated</option>
              </Select>
            </Field>

            <div className="sm:col-span-2">
              <Field label="Payment methods" field="payment_methods" confidence={confidence} evidence={evidence}>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                  {PAYMENT_METHODS.map((method) => (
                    <label key={method.value} className="flex items-center gap-1.5 text-[13px] text-ink">
                      <input
                        type="checkbox"
                        checked={draft.payment_methods.includes(method.value)}
                        disabled={reviewed}
                        className="h-3.5 w-3.5 accent-[var(--color-accent-600)]"
                        onChange={(event) =>
                          set(
                            'payment_methods',
                            event.target.checked
                              ? [...draft.payment_methods, method.value]
                              : draft.payment_methods.filter((entry) => entry !== method.value),
                          )
                        }
                      />
                      {method.label}
                    </label>
                  ))}
                </div>
              </Field>
            </div>

            <Field label="Minimum order" field="minimum_order" confidence={confidence} evidence={evidence}>
              <Input
                value={draft.minimum_order ?? ''}
                placeholder="e.g. 2 posts minimum"
                disabled={reviewed}
                onChange={(event) => set('minimum_order', event.target.value || null)}
              />
            </Field>
            <Field label="Prices valid until" field="price_valid_until" confidence={confidence} evidence={evidence}>
              <Input
                type="date"
                value={draft.price_valid_until ?? ''}
                disabled={reviewed}
                onChange={(event) => set('price_valid_until', event.target.value || null)}
              />
            </Field>

            <div className="sm:col-span-2">
              <Field label="VAT notes" field="vat_notes" confidence={confidence} evidence={evidence}>
                <Input
                  value={draft.vat_notes ?? ''}
                  disabled={reviewed}
                  onChange={(event) => set('vat_notes', event.target.value || null)}
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Bulk discounts" field="bulk_discount_notes" confidence={confidence} evidence={evidence}>
                <Input
                  value={draft.bulk_discount_notes ?? ''}
                  disabled={reviewed}
                  onChange={(event) => set('bulk_discount_notes', event.target.value || null)}
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Future price changes" field="future_price_notes" confidence={confidence} evidence={evidence}>
                <Input
                  value={draft.future_price_notes ?? ''}
                  disabled={reviewed}
                  onChange={(event) => set('future_price_notes', event.target.value || null)}
                />
              </Field>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contact and notes</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Field label="Contact email" field="contact_email" confidence={confidence} evidence={evidence}>
              <Input
                value={draft.contact_email ?? ''}
                placeholder={email.fromAddress}
                disabled={reviewed}
                onChange={(event) => set('contact_email', event.target.value || null)}
              />
            </Field>
            <Field label="Contact name" field="contact_name" confidence={confidence} evidence={evidence}>
              <Input
                value={draft.contact_name ?? ''}
                disabled={reviewed}
                onChange={(event) => set('contact_name', event.target.value || null)}
              />
            </Field>

            <div className="sm:col-span-2">
              <Field label="Internal contact notes" field="contact_notes" confidence={confidence} evidence={evidence}>
                <Input
                  value={draft.contact_notes ?? ''}
                  placeholder="Never shown to customers"
                  disabled={reviewed}
                  onChange={(event) => set('contact_notes', event.target.value || null)}
                />
              </Field>
            </div>

            <div className="sm:col-span-2">
              <Field label="Notes" field="notes" confidence={confidence} evidence={evidence}>
                <Textarea
                  value={draft.notes ?? ''}
                  disabled={reviewed}
                  className="min-h-24"
                  onChange={(event) => set('notes', event.target.value || null)}
                />
              </Field>
            </div>

            {draft.relationship ? (
              <div className="sm:col-span-2">
                <Field label="Relationship to the site we asked about" field="relationship" confidence={confidence} evidence={evidence}>
                  <Textarea
                    value={draft.relationship}
                    disabled={reviewed}
                    className="min-h-16"
                    onChange={(event) => set('relationship', event.target.value || null)}
                  />
                </Field>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* ------------------------------------------------------- actions */}
        {reviewed ? (
          <Card>
            <CardContent className="py-4 text-[13px] text-muted">
              This draft has already been {status}. Nothing here can change it.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="space-y-3 py-4">
              {error ? (
                <p role="alert" className="text-[13px] text-negative">
                  {error}
                </p>
              ) : null}

              {rejecting ? (
                <div className="space-y-2">
                  <Label htmlFor="reject-reason">Why are you rejecting it?</Label>
                  <Input
                    id="reject-reason"
                    value={reason}
                    placeholder="e.g. rates are for their other site"
                    onChange={(event) => setReason(event.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        startTransition(async () => {
                          await rejectDraftAction(draftId, reason);
                          router.push('/admin/sourcing');
                        })
                      }
                    >
                      Reject {domain}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setRejecting(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="accent"
                      disabled={busy}
                      onClick={() =>
                        startTransition(async () => {
                          setError(null);
                          const result = await approveDraftAction(draftId, draft);
                          if (!result.ok) return setError(result.error ?? 'Could not approve.');
                          router.push('/admin/sourcing');
                        })
                      }
                    >
                      <Check className="h-4 w-4" aria-hidden="true" />
                      {current ? 'Update the listing' : 'Create the listing'}
                    </Button>
                    <Button variant="outline" disabled={busy} onClick={() => setRejecting(true)}>
                      <X className="h-4 w-4" aria-hidden="true" />
                      Reject
                    </Button>
                  </div>

                  {/*
                    The network case. Checking one of sixty portals usually
                    settles all sixty, and clicking through the rest one at a
                    time teaches nobody anything.
                  */}
                  {siblingCount > 0 ? (
                    <div className="space-y-2 border-t border-line pt-3">
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          startTransition(async () => {
                            setError(null);
                            const result = await approveEmailBatchAction(
                              draftId,
                              draft,
                              edited && spreadEdits,
                            );
                            if (!result.ok) return setError(result.error ?? 'Could not approve.');
                            router.push('/admin/sourcing');
                          })
                        }
                      >
                        <Layers className="h-4 w-4" aria-hidden="true" />
                        Approve all {siblingCount + 1} from this email
                      </Button>

                      {edited ? (
                        <label className="flex items-start gap-2 text-[12px] leading-relaxed text-ink-soft">
                          <input
                            type="checkbox"
                            checked={spreadEdits}
                            onChange={(event) => setSpreadEdits(event.target.checked)}
                            className="mt-0.5 h-3.5 w-3.5 accent-[var(--color-accent-600)]"
                          />
                          <span>
                            Apply my changes to the others too, where they currently hold the same
                            value. A site the publisher quoted differently keeps its own.
                          </span>
                        </label>
                      ) : (
                        <p className="text-[12px] leading-relaxed text-muted">
                          Each of the others is approved with its own values, so a site priced
                          differently or refusing a topic stays as the email described it.
                        </p>
                      )}
                    </div>
                  ) : null}
                </div>
              )}

              <p className="text-[12px] text-muted">
                {current
                  ? `Updates ${current.domain}. Fields left blank here are not written, so nothing already on the listing is cleared.`
                  : 'Creates the listing as a draft, unpublished, with no sell price set. It cannot appear in the marketplace until you price it.'}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

/** The payment methods the schema allows, in the words an account manager uses. */
const PAYMENT_METHODS: { value: ExtractedListing['payment_methods'][number]; label: string }[] = [
  { value: 'paypal', label: 'PayPal' },
  { value: 'bank', label: 'Bank transfer' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'crypto', label: 'Crypto' },
  { value: 'pix', label: 'Pix' },
  { value: 'upi', label: 'UPI' },
  { value: 'western_union', label: 'Western Union' },
];

/** An emptied number field means "not stated", never zero. */
function numberOrNull(value: string): number | null {
  return value.trim() === '' ? null : Number(value);
}

/**
 * A price that repeats, with the period it repeats on.
 *
 * A homepage link at 199 a year and one at 199 a month are different
 * businesses, so the period sits beside the number rather than in a note.
 */
function Periodic({
  label,
  field,
  value,
  period,
  currency,
  confidence,
  evidence,
  disabled,
  onValue,
  onPeriod,
}: {
  label: string;
  field: string;
  value: number | null;
  period: ExtractedListing['homepage_link_period'];
  currency: string | null;
  confidence: Record<string, string>;
  evidence: Record<string, string>;
  disabled: boolean;
  onValue: (value: number | null) => void;
  onPeriod: (value: ExtractedListing['homepage_link_period']) => void;
}) {
  return (
    <Field label={label} field={field} confidence={confidence} evidence={evidence}>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={0}
          step="0.01"
          value={value ?? ''}
          disabled={disabled}
          onChange={(event) => onValue(numberOrNull(event.target.value))}
        />
        <span className="shrink-0 text-[12px] text-muted">{currency ?? ''}</span>
        <Select
          size="sm"
          aria-label={`${label} period`}
          value={period ?? ''}
          disabled={disabled}
          className="w-28 shrink-0"
          onChange={(event) =>
            onPeriod((event.target.value || null) as ExtractedListing['homepage_link_period'])
          }
        >
          <option value="">Period?</option>
          <option value="month">per month</option>
          <option value="year">per year</option>
          <option value="one-off">one-off</option>
        </Select>
      </div>
    </Field>
  );
}

/** A labelled field that shows how sure the model was, and why. */
function Field({
  label,
  field,
  confidence,
  evidence,
  children,
}: {
  label: string;
  field: string;
  confidence: Record<string, string>;
  evidence: Record<string, string>;
  children: React.ReactNode;
}) {
  const level = confidence[field];
  const quote = evidence[field];

  return (
    <div>
      <div className="flex items-center gap-1.5">
        <Label>{label}</Label>
        {level === 'low' ? (
          <span className="inline-flex items-center gap-1 rounded bg-negative/10 px-1.5 py-0.5 text-[10px] font-medium text-negative">
            <AlertTriangle className="h-2.5 w-2.5" aria-hidden="true" />
            low
          </span>
        ) : level === 'medium' ? (
          <span className="rounded bg-surface-sunken px-1.5 py-0.5 text-[10px] text-muted">
            inferred
          </span>
        ) : null}
      </div>
      <div className="mt-1.5">{children}</div>
      {quote ? (
        <p
          title={quote}
          className="mt-1 flex items-start gap-1 text-[11px] leading-snug text-muted"
        >
          <Quote className="mt-0.5 h-2.5 w-2.5 shrink-0" aria-hidden="true" />
          <span className="line-clamp-2">{quote}</span>
        </p>
      ) : null}
    </div>
  );
}

/** A price, with what the listing said before it, where that differs. */
function Money({
  label,
  field,
  value,
  was,
  currency,
  confidence,
  evidence,
  disabled,
  onChange,
}: {
  label: string;
  field: string;
  value: number | null;
  was: number | null;
  currency: string | null;
  confidence: Record<string, string>;
  evidence: Record<string, string>;
  disabled: boolean;
  onChange: (value: number | null) => void;
}) {
  const changed = was != null && value != null && was !== value;

  return (
    <Field label={label} field={field} confidence={confidence} evidence={evidence}>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={0}
          step="0.01"
          value={value ?? ''}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)}
        />
        <span className="shrink-0 text-[12px] text-muted">{currency ?? ''}</span>
      </div>
      {changed ? (
        <p
          className={cn(
            'tabular mt-1 text-[11px]',
            value > was ? 'text-negative' : 'text-accent-700',
          )}
        >
          was {was} {currency ?? ''} · {value > was ? 'up' : 'down'}{' '}
          {Math.abs(Math.round(((value - was) / was) * 100))}%
        </p>
      ) : was != null && value == null ? (
        <p className="tabular mt-1 text-[11px] text-muted">
          listing has {was} {currency ?? ''}; not mentioned in this reply, so it stays
        </p>
      ) : null}
    </Field>
  );
}

