import {
  BarChart3,
  ClipboardList,
  CreditCard,
  FolderKanban,
  PenLine,
  Receipt,
  ShieldCheck,
  Timer,
  type LucideIcon,
} from 'lucide-react';
import { Container } from '@/components/layout/container';
import { Badge } from '@/components/ui/badge';
import type { ContentAccessors } from '@/lib/cms/resolve';

/**
 * What the platform actually does.
 *
 * Anything not yet built carries a "Coming soon" badge rather than being
 * quietly listed as though it exists - an editor sets that per feature, and
 * the honest default is to keep it until the thing ships.
 */
const icons: LucideIcon[] = [
  ShieldCheck,
  BarChart3,
  Receipt,
  Timer,
  ClipboardList,
  PenLine,
  CreditCard,
  FolderKanban,
];

export function PlatformFeatures({ content }: { content: ContentAccessors }) {
  const features = content.list<{ title: string; body: string; comingSoon?: string }>(
    'features',
    'items',
  );

  return (
    <section className="border-b border-line bg-white" aria-labelledby="platform-heading">
      <Container size="wide" className="py-14 lg:py-20">
        <div className="max-w-2xl">
          <h2
            id="platform-heading"
            className="text-2xl font-semibold tracking-tight text-ink sm:text-[2rem] sm:leading-tight"
          >
            {content.text('features', 'heading')}
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">
            {content.text('features', 'intro')}
          </p>
        </div>

        <ul className="mt-11 grid gap-x-8 gap-y-9 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature, index) => {
            const Icon = icons[index % icons.length] as LucideIcon;
            const comingSoon = (feature.comingSoon ?? '').trim().toLowerCase() === 'yes';
            return (
              <li key={feature.title || index}>
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-sunken text-ink-soft">
                  <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                </span>
                <h3 className="mt-4 flex flex-wrap items-center gap-2 text-[15px] font-semibold text-ink">
                  {feature.title}
                  {comingSoon ? (
                    <Badge tone="outline" size="sm">
                      Coming soon
                    </Badge>
                  ) : null}
                </h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{feature.body}</p>
              </li>
            );
          })}
        </ul>
      </Container>
    </section>
  );
}
