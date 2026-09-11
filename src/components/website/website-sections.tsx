import { Check, ExternalLink, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { countryName } from '@/lib/data/countries';
import { formatDate, formatNumber, formatTurnaround } from '@/lib/utils/format';
import { languageLabels, linkTypeLabels, sponsoredTagLabels } from '@/lib/utils/labels';
import { steps } from '@/components/home/how-it-works-section';
import type { Website } from '@/lib/types';

export function WebsiteSections({ website }: { website: Website }) {
  const { rules, metrics } = website;
  const available = website.services.filter((service) => service.available);

  const acceptance = [
    { label: 'Gambling content', allowed: rules.acceptsGambling },
    { label: 'Finance content', allowed: rules.acceptsFinance },
    { label: 'Crypto content', allowed: rules.acceptsCrypto },
    { label: 'CBD content', allowed: rules.acceptsCbd },
    { label: 'Adult content', allowed: rules.acceptsAdult },
  ];

  return (
    <div className="space-y-6">
      <Section id="overview" title="Website Overview">
        {website.overview.split('\n\n').map((paragraph) => (
          <p key={paragraph.slice(0, 32)} className="text-[14px] leading-relaxed text-ink-soft">
            {paragraph}
          </p>
        ))}
      </Section>

      <Section id="seo-metrics" title="SEO Metrics">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
          <Row label="Domain Rating" value={String(metrics.domainRating)} />
          <Row label="Organic traffic" value={`${formatNumber(metrics.organicTraffic)} / month`} />
          <Row label="Referring domains" value={formatNumber(metrics.referringDomains)} />
          <Row label="Spam score" value={`${metrics.spamScore}%`} />
          <Row label="6 month trend" value={`${metrics.trafficChangePct > 0 ? '+' : ''}${metrics.trafficChangePct}%`} />
          <Row label="Language" value={languageLabels[website.language] ?? website.language} />
        </dl>
        <p className="mt-4 text-[12px] text-muted">
          Metrics are refreshed monthly from third party SEO data providers and verified against the
          publisher&rsquo;s analytics during vetting.
        </p>
      </Section>

      <Section id="audience" title="Audience and Geography">
        <p className="text-[14px] leading-relaxed text-ink-soft">
          {metrics.topCountryShare}% of the audience is based in {countryName(website.country)}, with
          the remainder spread across the publisher&rsquo;s secondary markets.
        </p>
        <ul className="mt-4 space-y-2.5">
          {metrics.audienceSplit.map((entry) => (
            <li key={entry.country} className="flex items-center gap-3">
              <span className="w-32 shrink-0 text-[13px] text-ink-soft">
                {countryName(entry.country)}
              </span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken">
                <span
                  className="block h-full rounded-full bg-accent-500"
                  style={{ width: `${entry.share}%` }}
                />
              </span>
              <span className="tabular w-10 shrink-0 text-right text-[13px] text-muted">
                {entry.share}%
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="guidelines" title="Publishing Guidelines">
        <ul className="space-y-2.5">
          {rules.guidelines.map((guideline) => (
            <li key={guideline} className="flex gap-2.5 text-[14px] leading-relaxed text-ink-soft">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent-600" aria-hidden="true" />
              {guideline}
            </li>
          ))}
        </ul>
        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-line pt-5 sm:grid-cols-3">
          <Row label="Minimum word count" value={`${formatNumber(rules.minWordCount)} words`} />
          <Row label="Maximum word count" value={`${formatNumber(rules.maxWordCount)} words`} />
          <Row
            label="Content provided by"
            value={
              rules.contentProvidedBy === 'either'
                ? 'You or the publisher'
                : rules.contentProvidedBy === 'buyer'
                  ? 'Buyer supplies content'
                  : 'Publisher writes content'
            }
          />
        </dl>
      </Section>

      <Section id="link-requirements" title="Link Requirements">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
          <Row
            label="Link attribute"
            value={rules.linkAttribute === 'dofollow' ? 'Dofollow' : 'Nofollow'}
          />
          <Row label="Maximum links" value={`${rules.maxLinks} per placement`} />
          <Row label="Sponsored tag" value={sponsoredTagLabels[rules.sponsoredTag]} />
        </dl>

        <div className="mt-5 border-t border-line pt-5">
          <h3 className="text-[13px] font-semibold text-ink">Accepted topics</h3>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {acceptance.map((entry) => (
              <li key={entry.label} className="flex items-center gap-2 text-[13px] text-ink-soft">
                {entry.allowed ? (
                  <Check className="h-4 w-4 shrink-0 text-accent-600" aria-hidden="true" />
                ) : (
                  <X className="h-4 w-4 shrink-0 text-muted-soft" aria-hidden="true" />
                )}
                <span>
                  {entry.allowed ? 'Accepts' : 'Does not accept'} {entry.label.toLowerCase()}
                </span>
              </li>
            ))}
          </ul>
          {rules.restrictedNiches.length ? (
            <p className="mt-4 text-[13px] text-muted">
              Restricted niches: {rules.restrictedNiches.join(', ')}.
            </p>
          ) : null}
        </div>
      </Section>

      <Section id="examples" title="Example Placements">
        <ul className="divide-y divide-line">
          {rules.examplePlacements.map((example) => (
            <li key={example.path} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="truncate text-[14px] font-medium text-ink">{example.title}</p>
                <p className="truncate text-[12px] text-muted">
                  {website.domain}
                  {example.path}
                </p>
              </div>
              <span className="flex shrink-0 items-center gap-1.5 text-[12px] text-muted">
                {formatDate(example.publishedAt)}
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[12px] text-muted">
          Example URLs are illustrative. Live URLs for your own placements are shared in your
          dashboard as soon as an article is published.
        </p>
      </Section>

      <Section id="turnaround" title="Turnaround">
        <ul className="divide-y divide-line">
          {available.map((service) => (
            <li key={service.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
              <span className="text-[14px] font-medium text-ink">
                {linkTypeLabels[service.type]}
              </span>
              <span className="tabular text-[13px] text-ink-soft">
                {formatTurnaround(service.turnaroundMinDays, service.turnaroundMaxDays)}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[12px] text-muted">
          Turnaround is measured in working days from the moment content is approved. Publishers
          confirm a publication date before work starts.
        </p>
      </Section>

      <Section id="order-process" title="Order Process">
        <ol className="grid gap-4 sm:grid-cols-2">
          {steps.map((step) => (
            <li key={step.number} className="rounded-lg border border-line bg-surface/60 p-4">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-navy-900 text-[12px] font-semibold text-white">
                {step.number}
              </span>
              <h3 className="mt-3 text-[14px] font-semibold text-ink">{step.title}</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">{step.description}</p>
            </li>
          ))}
        </ol>
      </Section>
    </div>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card id={id} className="scroll-mt-24">
      <CardHeader>
        <CardTitle className="text-[15px]">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[12px] text-muted">{label}</dt>
      <dd className="tabular mt-0.5 text-[14px] font-medium text-ink">{value}</dd>
    </div>
  );
}
