import { BadgeCheck, Layers, Globe2, Zap, type LucideIcon } from 'lucide-react';
import { formatNumber } from '@/lib/utils/format';
import type { ContentAccessors } from '@/lib/cms/resolve';
import type { MarketplaceStats } from '@/lib/services';

/**
 * The headline numbers under the hero.
 *
 * The first three are counted from the marketplace on every render; only their
 * labels are editable. The row used to be four typed figures, and it claimed
 * "5,000+ vetted websites" against a real number nearer nine hundred - which
 * is what happens to every number somebody types into a heading, eventually
 * and silently.
 *
 * Anything the database cannot measure - average turnaround, say - is still
 * typed, and still carries the warning in the editor that nothing keeps it
 * true.
 *
 * A counted figure of zero is left out rather than shown, so a marketplace
 * that has not loaded is a shorter row rather than a claim of nothing.
 */
const icons: LucideIcon[] = [BadgeCheck, Layers, Globe2, Zap];

export function TrustMetrics({
  content,
  stats,
}: {
  content: ContentAccessors;
  stats: MarketplaceStats;
}) {
  const counted = [
    { value: stats.totalWebsites, label: content.text('metrics', 'websitesLabel') },
    { value: stats.totalNiches, label: content.text('metrics', 'nichesLabel') },
    { value: stats.totalCountries, label: content.text('metrics', 'countriesLabel') },
  ]
    .filter((metric) => metric.value > 0 && metric.label)
    .map((metric) => ({ value: formatNumber(metric.value), label: metric.label }));

  const typed = content.list<{ value: string; label: string }>('metrics', 'items');
  const metrics = [...counted, ...typed];
  if (!metrics.length) return null;

  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-6 lg:grid-cols-4">
      {metrics.map((metric, index) => {
        const Icon = icons[index % icons.length] as LucideIcon;
        return (
          <div key={metric.label || index} className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-600 text-white">
              <Icon className="h-4.5 w-4.5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <dt className="sr-only">{metric.label}</dt>
              <dd>
                <span className="tabular block text-[17px] leading-tight font-semibold text-ink">
                  {metric.value}
                </span>
                <span className="block text-[13px] text-muted">{metric.label}</span>
              </dd>
            </div>
          </div>
        );
      })}
    </dl>
  );
}
