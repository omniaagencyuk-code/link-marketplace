import { BadgeCheck, Layers, Globe2, Zap, type LucideIcon } from 'lucide-react';
import type { ContentAccessors } from '@/lib/cms/resolve';

/**
 * The headline numbers under the hero.
 *
 * Values and labels are editable; the icons are fixed and matched by position,
 * so the row keeps its rhythm whatever the copy says.
 */
const icons: LucideIcon[] = [BadgeCheck, Layers, Globe2, Zap];

export function TrustMetrics({ content }: { content: ContentAccessors }) {
  const metrics = content.list<{ value: string; label: string }>('metrics', 'items');
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
