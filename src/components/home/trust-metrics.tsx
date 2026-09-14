import { BadgeCheck, Layers, Star, Zap } from 'lucide-react';
import { marketingStats } from '@/lib/config/marketing';

/**
 * Four headline numbers. Inventory and niche counts come from the data layer,
 * so they stay honest as the marketplace grows.
 */
const metrics = [
  {
    icon: BadgeCheck,
    value: `${marketingStats.inventory.toLocaleString('en-GB')}+`,
    label: 'vetted websites',
  },
  { icon: Layers, value: `${marketingStats.nicheCount}+`, label: 'niches' },
  { icon: Star, value: marketingStats.customerRating, label: 'customer rating' },
  { icon: Zap, value: marketingStats.averageTurnaround, label: 'average turnaround' },
];

export function TrustMetrics() {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-6 lg:grid-cols-4">
      {metrics.map((metric) => (
        <div key={metric.label} className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-600 text-white">
            <metric.icon className="h-4.5 w-4.5" aria-hidden="true" />
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
      ))}
    </dl>
  );
}
