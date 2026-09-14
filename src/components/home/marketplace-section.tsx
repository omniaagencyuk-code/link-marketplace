import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { RedactedPreview } from '@/components/marketplace/redacted-preview';
import { marketingStats } from '@/lib/config/marketing';
import { linkTypeLabels } from '@/lib/utils/labels';
import type { MarketplacePreview } from '@/lib/services/marketplace-preview';

/**
 * The product demonstration.
 *
 * Shows what the marketplace does without showing what is in it. Every number
 * is an aggregate count from the data layer, and the table rows come from
 * `getPublicPreview`, which strips domains, slugs and ids server-side.
 */

const filters = [
  'DR',
  'Organic Traffic',
  'Referring Domains',
  'Country',
  'Niche',
  'Price',
  'Turnaround',
];

export function MarketplaceSection({ preview }: { preview: MarketplacePreview }) {
  const stats = [
    { value: `${marketingStats.inventory.toLocaleString('en-GB')}+`, label: 'vetted websites' },
    { value: `${marketingStats.nicheCount}+`, label: 'niches' },
    { value: `${preview.totalCountries}+`, label: 'countries' },
  ];

  return (
    <section className="border-b border-line bg-surface" aria-labelledby="marketplace-heading">
      <Container size="wide" className="py-14 lg:py-20">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-14">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-accent-700 uppercase">
              The marketplace
            </p>
            <h2
              id="marketplace-heading"
              className="mt-4 text-2xl font-semibold tracking-tight text-ink sm:text-[2rem] sm:leading-tight"
            >
              Thousands of Link Building Opportunities in One Place
            </h2>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted">
              Registered customers search thousands of publishers on the metrics that matter, then
              order guest posts, niche edits and digital PR in a few clicks. No outreach, no
              negotiation and no waiting on a quote.
            </p>

            <dl className="mt-8 grid max-w-md grid-cols-3 gap-4 border-y border-line py-5">
              {stats.map((stat) => (
                <div key={stat.label}>
                  <dt className="sr-only">{stat.label}</dt>
                  <dd>
                    <span className="block text-xl font-semibold tracking-tight text-ink">
                      {stat.value}
                    </span>
                    <span className="mt-0.5 block text-[12px] text-muted">{stat.label}</span>
                  </dd>
                </div>
              ))}
            </dl>

            <div className="mt-7">
              <p className="text-[12px] font-semibold tracking-wide text-muted uppercase">
                Filter by
              </p>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {filters.map((filter) => (
                  <li key={filter} className="flex items-center gap-2 text-[14px] text-ink-soft">
                    <Check className="h-4 w-4 shrink-0 text-accent-600" aria-hidden="true" />
                    {filter}
                  </li>
                ))}
              </ul>
            </div>

            <ul className="mt-6 flex flex-wrap gap-2">
              {(['guest-post', 'niche-edit', 'digital-pr'] as const).map((type) => (
                <li
                  key={type}
                  className="rounded-md border border-line-strong bg-white px-2.5 py-1.5 text-[12px] font-medium text-ink-soft"
                >
                  {linkTypeLabels[type]}
                </li>
              ))}
            </ul>

            <div className="mt-8">
              <Button asChild variant="accent" size="lg">
                <Link href="/marketplace">
                  Unlock the Marketplace
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
              <p className="mt-3 text-[13px] text-muted">
                Create a free account to browse publishers and pricing.
              </p>
            </div>
          </div>

          <div className="min-w-0">
            <RedactedPreview rows={preview.rows} />
          </div>
        </div>
      </Container>
    </section>
  );
}
