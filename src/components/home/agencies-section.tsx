import Link from 'next/link';
import {
  ArrowRight,
  Building2,
  FileSpreadsheet,
  Layers,
  PenLine,
  Receipt,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import type { ContentAccessors } from '@/lib/cms/resolve';

const icons: LucideIcon[] = [Layers, Wallet, FileSpreadsheet, Building2, PenLine, Receipt];

export function AgenciesSection({ content }: { content: ContentAccessors }) {
  const points = content.list<{ label: string }>('agencies', 'items');
  const primaryCta = content.link('agencies', 'primaryCta');
  const secondaryCta = content.link('agencies', 'secondaryCta');

  return (
    <section className="border-b border-line bg-white" aria-labelledby="agencies-heading">
      <Container size="wide" className="py-14 lg:py-20">
        <div className="rounded-[var(--radius-card)] border border-line bg-surface p-7 shadow-[var(--shadow-card)] lg:p-12">
          <div className="grid gap-9 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-14">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold tracking-[0.14em] text-accent-700 uppercase">
                {content.text('agencies', 'eyebrow')}
              </p>
              <h2
                id="agencies-heading"
                className="mt-4 text-2xl font-semibold tracking-tight text-ink sm:text-[2rem] sm:leading-tight"
              >
                {content.text('agencies', 'heading')}
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-muted">
                {content.text('agencies', 'body')}
              </p>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Button asChild variant="primary" size="lg">
                  <Link href={primaryCta.href}>
                    {primaryCta.label}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link href={secondaryCta.href}>{secondaryCta.label}</Link>
                </Button>
              </div>
            </div>

            <ul className="grid min-w-0 gap-3 sm:grid-cols-2">
              {points.map((point, index) => {
                const Icon = icons[index % icons.length] as LucideIcon;
                return (
                  <li
                    key={point.label || index}
                    className="flex items-start gap-3 rounded-lg border border-line bg-white p-4"
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-accent-600" aria-hidden="true" />
                    <span className="text-[13px] leading-snug text-ink-soft">{point.label}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </Container>
    </section>
  );
}
