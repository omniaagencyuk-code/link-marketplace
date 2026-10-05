'use client';

import Link from 'next/link';
import { ArrowRight, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DomainRating } from '@/components/shared/metric';
import { AddToOrderButton } from './add-to-order-button';
import {
  formatCompactNumber,
  formatNumber,
  formatPrice,
  formatTurnaround,
} from '@/lib/utils/format';
import { linkTypeLabels } from '@/lib/utils/labels';
import { acceptedNicheLabel } from '@/lib/config/accepted-niches';
import { countryName } from '@/lib/data/countries';
import { flagEmoji } from '@/lib/data/flags';
import { audienceBreakdown } from '@/lib/websites/audience';
import { cn } from '@/lib/utils/cn';
import type { CountryCode, WebsiteListItem } from '@/lib/types';

/**
 * The quick due-diligence panel under an expanded marketplace row.
 *
 * It used to repeat the row: the same four metrics, the same price, an inch
 * lower down. The point of expanding a row is to answer the questions the
 * table has no column for - who actually reads this site, how the placement
 * behaves, what the publisher will and will not cover - so that a buyer can
 * reject a site without opening it, which is most of what they are doing.
 *
 * ## Nothing here costs a request
 *
 * Every field is already on the row the marketplace fetched. The audience
 * split, the publishing terms and the example placements all come down with
 * the listing, so expanding is pure rendering: no lazy load, no API call, and
 * no N+1 against a page showing fifty sites.
 *
 * ## Absent is not zero
 *
 * Most of these fields are optional because most publishers never state them.
 * Every row below hides rather than guesses. A "Permanent placement: No" on a
 * publisher who simply never mentioned it is a claim we would be making up,
 * and it is the kind that loses a sale honestly made.
 */
export function WebsiteSnippet({
  website,
  className,
  id,
  variant = 'row',
}: {
  website: WebsiteListItem;
  className?: string;
  id?: string;
  /**
   * What the surrounding element already shows.
   *
   * A table row truncates the domain and the description to one line each, so
   * the panel carries both. A card already shows them in full an inch higher,
   * and the SEO metrics with them, so repeating them there reads as a
   * rendering fault.
   */
  variant?: 'row' | 'card';
}) {
  const full = variant === 'row';
  const lead = website.headlineService;
  const rules = website.rules;
  const audience = audienceBreakdown(website.metrics.audienceSplit);
  const examples = rules.examplePlacements.slice(0, 3);

  return (
    <div id={id} className={cn('space-y-4', className)}>
      {full ? (
        <div>
          <h3 className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-ink">
            {/* Breaks anywhere: a sixty-character subdomain must not push the
                grid sideways. */}
            <span className="break-all">{website.domain}</span>
            <a
              href={`https://${website.domain}`}
              target="_blank"
              rel="noreferrer noopener nofollow"
              className="text-accent-700 hover:text-accent-800"
              aria-label={`Open ${website.domain} in a new tab`}
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </h3>
          {website.description ? (
            <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{website.description}</p>
          ) : null}
        </div>
      ) : null}

      {/*
        Five columns on a wide screen, roughly the proportions the sections
        need rather than equal fifths: the traffic bars want room and the price
        column is a number and two buttons.

        On mobile the order is reordered rather than the markup: price first,
        because somebody on a phone is deciding whether this is affordable
        before anything else, then the audience, then the rest. Source order
        stays logical for a screen reader on desktop.
      */}
      <div
        className={cn(
          'grid gap-x-5 gap-y-4 sm:grid-cols-2',
          full
            ? 'lg:grid-cols-[20fr_26fr_22fr_18fr_17fr]'
            : 'lg:grid-cols-[26fr_24fr_20fr_18fr]',
        )}
      >
        {full ? (
          <Section title="SEO metrics" className="order-3 lg:order-none">
            <Row label="Domain Rating">
              <DomainRating value={website.metrics.domainRating} className="text-[13px]" />
            </Row>
            <Row label="Organic traffic">
              <Figure>{formatCompactNumber(website.metrics.organicTraffic)}</Figure>
            </Row>
            <Row label="Referring domains">
              <Figure>{formatCompactNumber(website.metrics.referringDomains)}</Figure>
            </Row>
            {/*
              A dash, never a zero. A listing the refresh has not reached yet
              has no reading, and "ranks for 0 keywords" is a claim about the
              publisher rather than about our data.
            */}
            <Row label="Organic keywords">
              {typeof website.metrics.organicKeywords === 'number' ? (
                <Figure>{formatCompactNumber(website.metrics.organicKeywords)}</Figure>
              ) : (
                <span className="text-[13px] text-muted">—</span>
              )}
            </Row>
            {/* Only when measured. A trend of zero and a trend nobody has
                measured look identical as a number and mean opposite things. */}
            {typeof website.metrics.trafficChangePct === 'number' ? (
              <Row label="Traffic trend">
                <Trend value={website.metrics.trafficChangePct} />
              </Row>
            ) : (
              <Row label="Traffic trend">
                <span className="text-[13px] text-muted">—</span>
              </Row>
            )}
          </Section>
        ) : null}

        <Section title="Traffic by country" className="order-2 lg:order-none">
          {audience.length === 0 ? (
            <p className="text-[12px] leading-relaxed text-muted">
              No country traffic data for this site yet.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {audience.map((slice) => (
                <li key={slice.country} className="flex items-center gap-2">
                  <span className="w-4 shrink-0 text-[13px]" aria-hidden="true">
                    {slice.isOther ? '🌐' : flagEmoji(slice.country)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12px] text-ink-soft">
                    {slice.isOther ? 'Other' : countryName(slice.country as CountryCode)}
                  </span>
                  <span
                    aria-hidden="true"
                    className="hidden h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-surface-sunken sm:block"
                  >
                    <span
                      className={cn(
                        'block h-full rounded-full',
                        slice.isOther ? 'bg-muted-soft' : 'bg-accent-600',
                      )}
                      style={{ width: `${slice.share}%` }}
                    />
                  </span>
                  <span className="tabular w-8 shrink-0 text-right text-[12px] font-medium text-ink">
                    {slice.share}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Placement details" className="order-4 lg:order-none">
          {lead ? <Row label="Link type">{linkTypeLabels[lead.type]}</Row> : null}
          <Row label="Link attribute">
            <span className={rules.linkAttribute === 'dofollow' ? 'text-accent-700' : undefined}>
              {rules.linkAttribute === 'dofollow' ? 'DoFollow' : 'NoFollow'}
            </span>
          </Row>
          {/* Written down by the publisher or not shown at all - see the note
              at the top about what a guessed "No" would be worth. */}
          {rules.permanence ? (
            <Row label="Permanent placement">
              <span className={rules.permanence === 'permanent' ? 'text-accent-700' : undefined}>
                {rules.permanence === 'permanent'
                  ? 'Yes'
                  : rules.minLiveMonths
                    ? `${rules.minLiveMonths} months`
                    : 'Fixed term'}
              </span>
            </Row>
          ) : null}
          {typeof rules.dofollowExpiresAfterMonths === 'number' ? (
            <Row label="DoFollow for">{rules.dofollowExpiresAfterMonths} months</Row>
          ) : null}
          <Row label="Content included">
            <ContentIncluded by={rules.contentProvidedBy} />
          </Row>
          <Row label="Word count">{formatNumber(rules.minWordCount)}+ words</Row>
          <Row label="Max links">{rules.maxLinks}</Row>
          <Row label="Turnaround">
            {lead ? formatTurnaround(lead.turnaroundMinDays, lead.turnaroundMaxDays) : '—'}
          </Row>
          <Row label="Sponsored tag">
            {rules.sponsoredTag === 'never'
              ? 'No'
              : rules.sponsoredTag === 'always'
                ? 'Yes'
                : 'On request'}
          </Row>
          {rules.homepagePlacement === true ? <Row label="Homepage placement">Yes</Row> : null}
        </Section>

        <Section title="Accepted topics" className="order-5 lg:order-none">
          {rules.acceptedNiches.length === 0 ? (
            <p className="text-[12px] text-muted">Not stated.</p>
          ) : (
            <ul className="flex flex-wrap gap-1">
              {rules.acceptedNiches.map((niche) => (
                <Pill key={niche} tone="accepted">
                  {acceptedNicheLabel(niche)}
                </Pill>
              ))}
            </ul>
          )}

          {rules.restrictedNiches.length > 0 ? (
            <div className="mt-3">
              <h5 className="text-[10px] font-semibold tracking-[0.04em] text-muted uppercase">
                Restricted
              </h5>
              <ul className="mt-1.5 flex flex-wrap gap-1">
                {rules.restrictedNiches.map((niche) => (
                  <Pill key={niche} tone="restricted">
                    {niche}
                  </Pill>
                ))}
              </ul>
            </div>
          ) : null}

          {/* A sentence, not a tag, so it is quoted rather than made a pill. */}
          {rules.topicRestriction ? (
            <p className="mt-2 text-[11px] leading-relaxed text-muted">
              Only covers: {rules.topicRestriction}
            </p>
          ) : null}
        </Section>

        <Section title="Price" className="order-1 lg:order-none">
          <p className="tabular text-[20px] leading-tight font-semibold text-ink">
            {website.headlinePriceMinor > 0 ? formatPrice(website.headlinePriceMinor) : '—'}
          </p>
          {/*
            Named only when there is more than one price to confuse it with.
            The per-niche rates live on the full listing page; repeating the
            whole rate card here was what made the old panel long.
          */}
          {website.nichePrices.length > 0 ? (
            <p className="mt-0.5 text-[11px] text-muted">Some topics priced differently</p>
          ) : null}

          <div className="mt-2.5 flex flex-col gap-2">
            <AddToOrderButton website={website} prominent fullWidth />
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link href={`/websites/${website.slug}`}>
                View full details
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </Section>
      </div>

      {examples.length > 0 || website.completedOrders > 0 ? (
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-t border-line pt-3">
          {examples.length > 0 ? (
            <div className="min-w-0">
              <h5 className="text-[10px] font-semibold tracking-[0.04em] text-muted uppercase">
                Example content
              </h5>
              <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                {examples.map((example) => (
                  <li key={example.path} className="min-w-0">
                    <a
                      href={`https://${website.domain}/${example.path.replace(/^\//, '')}`}
                      target="_blank"
                      rel="noreferrer noopener nofollow"
                      className="inline-flex max-w-[22rem] items-center gap-1 truncate text-[12px] text-accent-700 hover:underline"
                    >
                      <span className="truncate">{example.title}</span>
                      <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/*
            Placements we have actually delivered on this site, which is the
            only count we can stand behind. Hidden at zero rather than shown as
            "0 placements", which reads as a warning about a site nobody has
            happened to buy yet.
          */}
          {website.completedOrders > 0 ? (
            <div>
              <h5 className="text-[10px] font-semibold tracking-[0.04em] text-muted uppercase">
                Placements delivered
              </h5>
              <p className="tabular mt-1.5 text-[13px] font-semibold text-ink">
                {formatCompactNumber(website.completedOrders)}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Section({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('min-w-0', className)}>
      <h4 className="mb-2 text-[10px] font-semibold tracking-[0.04em] text-muted uppercase">
        {title}
      </h4>
      {children}
    </section>
  );
}

/** A label and its value, on one line, the way an SEO tool prints a figure. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-[3px]">
      <span className="text-[12px] text-muted">{label}</span>
      <span className="text-right text-[12px] font-medium text-ink">{children}</span>
    </div>
  );
}

function Figure({ children }: { children: React.ReactNode }) {
  return <span className="tabular text-[13px] font-semibold text-ink">{children}</span>;
}

function Trend({ value }: { value: number }) {
  const rounded = Math.round(value);
  return (
    <span
      className={cn(
        'tabular text-[13px] font-semibold',
        rounded > 0 ? 'text-accent-700' : rounded < 0 ? 'text-coral-700' : 'text-ink',
      )}
    >
      {rounded > 0 ? '+' : ''}
      {rounded}%
    </span>
  );
}

function ContentIncluded({ by }: { by: 'buyer' | 'publisher' | 'either' }) {
  if (by === 'publisher') return <span className="text-accent-700">Yes</span>;
  if (by === 'buyer') return <>No, you supply it</>;
  return <>Optional</>;
}

function Pill({ tone, children }: { tone: 'accepted' | 'restricted'; children: React.ReactNode }) {
  return (
    <li
      className={cn(
        'rounded-full px-2 py-0.5 text-[11px] font-medium',
        tone === 'accepted' ? 'bg-accent-50 text-accent-700' : 'bg-coral-50 text-coral-700',
      )}
    >
      {children}
    </li>
  );
}
