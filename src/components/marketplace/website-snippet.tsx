'use client';

import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  CircleAlert,
  ExternalLink,
  FileText,
  Globe,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DomainRating } from '@/components/shared/metric';
import { Flag } from '@/components/shared/flag';
import { AddToOrderButton } from './add-to-order-button';
import {
  formatCompactNumber,
  formatDate,
  formatNumber,
  formatPrice,
  formatTurnaround,
} from '@/lib/utils/format';
import { linkTypeLabels } from '@/lib/utils/labels';
import { acceptedNicheLabel } from '@/lib/config/accepted-niches';
import { countryName } from '@/lib/data/countries';
import { audienceBreakdown } from '@/lib/websites/audience';
import { cn } from '@/lib/utils/cn';
import type { CountryCode, WebsiteListItem } from '@/lib/types';

/**
 * The quick due-diligence panel under an expanded marketplace row.
 *
 * Five cards, because the information is five different questions and reading
 * them as one wall of label-value pairs meant everything had the same weight.
 * A buyer is scanning for one thing at a time - is the traffic in my market,
 * will they take my topic, what does it cost - and the card edges are what let
 * the eye jump to the right one.
 *
 * ## Nothing here costs a request
 *
 * Every field is already on the row the marketplace fetched: the metrics, the
 * audience split, the publishing terms and the example articles all come down
 * with the listing. Expanding is pure rendering - no lazy load, no API call,
 * no N+1 against a page showing fifty sites.
 *
 * ## Absent is not zero
 *
 * Most of these fields are optional because most publishers never state them,
 * and most listings have not been measured for everything. Every row hides or
 * shows a dash rather than guessing. A "Permanent placement: No" on a publisher
 * who never mentioned it is a claim we would be making up.
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
   * so repeating them there reads as a rendering fault.
   */
  variant?: 'row' | 'card';
}) {
  const full = variant === 'row';
  const lead = website.headlineService;
  const rules = website.rules;
  const metrics = website.metrics;
  const audience = audienceBreakdown(metrics.audienceSplit);
  const examples = rules.examplePlacements.slice(0, 3);

  return (
    <div id={id} className={cn('space-y-3', className)}>
      {full ? (
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
          <div className="min-w-0">
            <h3 className="flex flex-wrap items-center gap-1.5">
              {/* The strongest thing in the panel after the price. Breaks
                  anywhere, so a long subdomain cannot push the grid sideways. */}
              <span className="text-[17px] leading-tight font-semibold break-all text-navy-900">
                {website.domain}
              </span>
              <a
                href={`https://${website.domain}`}
                target="_blank"
                rel="noreferrer noopener nofollow"
                className="text-accent-600 hover:text-accent-700"
                aria-label={`Visit ${website.domain} in a new tab`}
                title={`Visit ${website.domain}`}
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </h3>
            {website.description ? (
              <p className="mt-0.5 text-[13px] leading-relaxed text-ink-soft">
                {website.description}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {/* Only for listings the team has actually vetted. The badge means
                something precisely because it is not on everything. */}
            {website.verified ? (
              <span className="inline-flex items-center gap-1.5 rounded-md bg-accent-50 px-2.5 py-1 text-[12px] font-medium text-accent-700">
                <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Vetted by our team
              </span>
            ) : null}

            <HeaderFact
              icon={CalendarDays}
              label="Last updated"
              value={formatDate(website.updatedAt)}
            />
            {/* Placements we delivered, which is the only count we can stand
                behind. Hidden at zero rather than shown as "0", which reads as
                a warning about a site nobody has happened to buy yet. */}
            {website.completedOrders > 0 ? (
              <HeaderFact
                icon={FileText}
                label="Placements delivered"
                value={formatCompactNumber(website.completedOrders)}
              />
            ) : null}
          </div>
        </div>
      ) : null}

      {/*
        Five cards on a wide screen, proportioned to what each one holds rather
        than equal fifths. On mobile the order is reordered rather than the
        markup: price first, because somebody on a phone is deciding whether
        this is affordable before anything else.
      */}
      <div
        className={cn(
          'grid gap-3 sm:grid-cols-2',
          full
            ? 'xl:grid-cols-[19fr_25fr_19fr_20fr_17fr]'
            : 'xl:grid-cols-[24fr_22fr_22fr_18fr]',
        )}
      >
        {full ? (
          <Card title="SEO metrics" className="order-2 xl:order-none">
            <Metric label="Domain Rating">
              <DomainRating value={metrics.domainRating} className="text-[13px]" />
            </Metric>
            <Metric label="Organic traffic">
              <Figure title={formatNumber(metrics.organicTraffic)}>
                {formatCompactNumber(metrics.organicTraffic)}
              </Figure>
            </Metric>
            <Metric label="Organic keywords">
              {typeof metrics.organicKeywords === 'number' ? (
                <Figure title={formatNumber(metrics.organicKeywords)}>
                  {formatCompactNumber(metrics.organicKeywords)}
                </Figure>
              ) : (
                <Unknown />
              )}
            </Metric>
            <Metric label="Referring domains">
              <Figure title={formatNumber(metrics.referringDomains)}>
                {formatCompactNumber(metrics.referringDomains)}
              </Figure>
            </Metric>
            <Metric label="Traffic trend">
              {typeof metrics.trafficChangePct === 'number' ? (
                <Trend value={metrics.trafficChangePct} />
              ) : (
                <Unknown />
              )}
            </Metric>
          </Card>
        ) : null}

        <Card title="Traffic by country" className="order-3 xl:order-none">
          {audience.length === 0 ? (
            <Empty>No country traffic data for this site yet.</Empty>
          ) : (
            <ul className="space-y-2">
              {audience.map((slice, index) => (
                <li key={slice.country} className="flex items-center gap-2">
                  <span className="flex h-[13px] w-[18px] shrink-0 items-center justify-center">
                    {slice.isOther ? (
                      <Globe className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
                    ) : (
                      <Flag country={slice.country} />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12px] text-ink-soft">
                    {slice.isOther ? 'Other' : countryName(slice.country as CountryCode)}
                  </span>
                  <span
                    aria-hidden="true"
                    className="hidden h-1.5 w-10 shrink-0 overflow-hidden rounded-full bg-surface-sunken sm:block"
                  >
                    {/* The leading country carries the brand green; the rest
                        step back so the shape of the distribution reads before
                        any individual number does. */}
                    <span
                      className={cn(
                        'block h-full rounded-full',
                        slice.isOther
                          ? 'bg-muted-soft'
                          : index === 0
                            ? 'bg-accent-600'
                            : 'bg-accent-600/45',
                      )}
                      style={{ width: `${slice.share}%` }}
                    />
                  </span>
                  <span className="tabular w-8 shrink-0 text-right text-[12px] font-semibold text-ink">
                    {slice.share}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Placement details" className="order-4 xl:order-none">
          {lead ? <Detail label="Link type">{linkTypeLabels[lead.type]}</Detail> : null}
          <Detail label="Link attribute">
            {rules.linkAttribute === 'dofollow' ? (
              <Good>DoFollow</Good>
            ) : (
              'NoFollow'
            )}
          </Detail>
          {rules.permanence ? (
            <Detail label="Permanent placement">
              {rules.permanence === 'permanent' ? (
                <Good>Yes</Good>
              ) : rules.minLiveMonths ? (
                `${rules.minLiveMonths} months`
              ) : (
                'Fixed term'
              )}
            </Detail>
          ) : null}
          {typeof rules.dofollowExpiresAfterMonths === 'number' ? (
            <Detail label="DoFollow for">{rules.dofollowExpiresAfterMonths} months</Detail>
          ) : null}
          <Detail label="Content included">
            {rules.contentProvidedBy === 'publisher' ? (
              <Good>Yes</Good>
            ) : rules.contentProvidedBy === 'buyer' ? (
              'You supply it'
            ) : (
              'Optional'
            )}
          </Detail>
          <Detail label="Word count">{formatNumber(rules.minWordCount)}+ words</Detail>
          <Detail label="Max links">{rules.maxLinks}</Detail>
          <Detail label="Turnaround">
            {lead ? formatTurnaround(lead.turnaroundMinDays, lead.turnaroundMaxDays) : '—'}
          </Detail>
          <Detail label="Sponsored tag">
            {rules.sponsoredTag === 'never'
              ? 'No'
              : rules.sponsoredTag === 'always'
                ? 'Yes'
                : 'On request'}
          </Detail>
          {rules.homepagePlacement === true ? (
            <Detail label="Homepage placement">
              <Good>Yes</Good>
            </Detail>
          ) : null}
        </Card>

        <Card title="Accepted topics" className="order-5 xl:order-none">
          {rules.acceptedNiches.length === 0 ? (
            <Empty>Not stated.</Empty>
          ) : (
            <ul className="flex flex-wrap gap-1">
              {rules.acceptedNiches.map((niche) => (
                <li
                  key={niche}
                  className="rounded-full bg-accent-50 px-2 py-0.5 text-[11px] font-medium text-accent-700"
                >
                  {acceptedNicheLabel(niche)}
                </li>
              ))}
            </ul>
          )}

          {rules.restrictedNiches.length > 0 || rules.topicRestriction ? (
            <div className="mt-3 border-t border-line pt-2.5">
              <h5 className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.04em] text-muted uppercase">
                <CircleAlert className="h-3 w-3 text-coral-600" aria-hidden="true" />
                Restrictions
              </h5>

              {rules.restrictedNiches.length > 0 ? (
                <ul className="mt-1.5 flex flex-wrap gap-1">
                  {rules.restrictedNiches.map((niche) => (
                    <li
                      key={niche}
                      className="rounded-full bg-coral-50 px-2 py-0.5 text-[11px] font-medium text-coral-700"
                    >
                      {niche}
                    </li>
                  ))}
                </ul>
              ) : null}

              {/*
                The publisher's own sentence, in a box rather than as another
                line of body text. It is the thing most likely to get an order
                rejected, and it was reading as a footnote.
              */}
              {rules.topicRestriction ? (
                <p className="mt-1.5 rounded-md bg-coral-50/70 px-2.5 py-2 text-[11px] leading-relaxed text-coral-800">
                  {rules.topicRestriction}
                </p>
              ) : null}
            </div>
          ) : null}
        </Card>

        <Card title="Price" className="order-1 xl:order-none">
          <p className="tabular text-[22px] leading-none font-semibold text-navy-900">
            {website.headlinePriceMinor > 0 ? formatPrice(website.headlinePriceMinor) : '—'}
          </p>
          {website.nichePrices.length > 0 ? (
            <p className="mt-1 text-[11px] leading-snug text-muted">
              Some topics priced differently
            </p>
          ) : null}

          <div className="mt-3 flex flex-col gap-2">
            <AddToOrderButton website={website} prominent fullWidth />
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link href={`/websites/${website.slug}`}>
                View full details
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </Card>
      </div>

      {examples.length > 0 ? (
        <div className="rounded-lg border border-line bg-white p-3 shadow-[var(--shadow-card)]">
          <h4 className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.04em] text-muted uppercase">
            <FileText className="h-3 w-3" aria-hidden="true" />
            Example published content
          </h4>
          {/* Titles and nothing else - no thumbnail, no date, no excerpt. The
              question it answers is "what does a post here look like", and a
              row of images answers it slower than a row of headlines. */}
          <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {examples.map((example) => (
              <li key={example.path}>
                <a
                  href={`https://${website.domain}/${example.path.replace(/^\/+/, '')}`}
                  target="_blank"
                  rel="noreferrer noopener nofollow"
                  className="flex items-start justify-between gap-2 rounded-md border border-line px-2.5 py-2 text-[12px] leading-snug text-ink-soft transition-colors hover:border-accent-200 hover:bg-accent-50/40 hover:text-accent-800"
                >
                  <span className="min-w-0">{example.title}</span>
                  <ExternalLink
                    className="mt-0.5 h-3 w-3 shrink-0 text-accent-600"
                    aria-hidden="true"
                  />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Card({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'min-w-0 rounded-lg border border-line bg-white p-3 shadow-[var(--shadow-card)]',
        className,
      )}
    >
      <h4 className="mb-2 text-[10px] font-semibold tracking-[0.04em] text-muted uppercase">
        {title}
      </h4>
      {children}
    </section>
  );
}

/** A label and its figure. The figure is the thing being read. */
function Metric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-[3px]">
      <span className="text-[12px] text-muted">{label}</span>
      {children}
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-[3px]">
      <span className="text-[12px] text-muted">{label}</span>
      <span className="text-right text-[12px] font-medium text-ink">{children}</span>
    </div>
  );
}

/** The exact figure on hover, since the card shows a rounded one. */
function Figure({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <span className="tabular text-[14px] font-semibold text-navy-900" title={title}>
      {children}
    </span>
  );
}

function Unknown() {
  return (
    <span className="text-[13px] text-muted" title="Not measured yet">
      —
    </span>
  );
}

/** Green, sparingly: only where the answer is the one a buyer wants. */
function Good({ children }: { children: React.ReactNode }) {
  return <span className="text-accent-700">{children}</span>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[12px] leading-relaxed text-muted">{children}</p>;
}

/**
 * The six-month change.
 *
 * An arrow as well as a colour, because colour alone is not a signal somebody
 * with a red-green deficiency can read. No sparkline: Ahrefs' batch endpoint
 * returns no series, so there is nothing to draw and a smooth invented curve
 * would be the most convincing lie on the page.
 */
function Trend({ value }: { value: number }) {
  const rounded = Math.round(value);
  const Icon = rounded > 0 ? TrendingUp : rounded < 0 ? TrendingDown : null;

  return (
    <span
      className={cn(
        'tabular inline-flex items-center gap-1 text-[14px] font-semibold',
        rounded > 0 ? 'text-accent-700' : rounded < 0 ? 'text-coral-700' : 'text-ink',
      )}
    >
      {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden="true" /> : null}
      {rounded > 0 ? '+' : ''}
      {rounded}%
    </span>
  );
}

function HeaderFact({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
      <div>
        <p className="text-[10px] leading-none font-medium tracking-[0.03em] text-muted uppercase">
          {label}
        </p>
        <p className="mt-0.5 text-[12px] leading-none font-semibold text-ink">{value}</p>
      </div>
    </div>
  );
}
