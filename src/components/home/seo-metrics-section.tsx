import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import { Container } from '@/components/layout/container';
import { MetricsShowcase } from '@/components/marketing/metrics-showcase';
import type { ContentAccessors } from '@/lib/cms/resolve';

/**
 * The four figures a buyer checks, drawn as the section comes into view.
 *
 * Two columns: the argument on the left, the figures drawing themselves on the
 * right. `MetricsShowcase` is the same component /guest-posts uses, in its
 * `stacked` arrangement - one panel per row, because it has half the page here
 * rather than all of it.
 *
 * Every number in it belongs to the same invented publisher the showcase above
 * opens, which is what keeps the two sections reading as one example instead of
 * two unrelated screenshots.
 */
export function SeoMetricsSection({ content }: { content: ContentAccessors }) {
  const points = content.list<{ label: string }>('seoMetrics', 'items');
  const cta = content.link('seoMetrics', 'cta');

  return (
    <section className="border-b border-line bg-white" aria-labelledby="seo-metrics-heading">
      <Container size="wide" className="py-14 lg:py-20">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:gap-16">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-accent-700 uppercase">
              {content.text('seoMetrics', 'eyebrow')}
            </p>
            <h2
              id="seo-metrics-heading"
              className="mt-4 text-2xl font-semibold tracking-tight text-ink sm:text-[2rem] sm:leading-tight"
            >
              {content.text('seoMetrics', 'heading')}
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-muted">
              {content.text('seoMetrics', 'body')}
            </p>

            {points.length ? (
              <ul className="mt-6 space-y-2.5">
                {points.map((point, index) => (
                  <li
                    key={point.label || index}
                    className="flex gap-2.5 text-[14px] leading-relaxed text-ink-soft"
                  >
                    <Check
                      className="mt-0.5 h-4 w-4 shrink-0 text-accent-600"
                      aria-hidden="true"
                    />
                    {point.label}
                  </li>
                ))}
              </ul>
            ) : null}

            {cta.label && cta.href ? (
              <Link
                href={cta.href}
                className="mt-7 inline-flex items-center gap-1.5 text-[14px] font-medium text-accent-700 hover:underline"
              >
                {cta.label}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            ) : null}
          </div>

          {/*
            Second in the DOM, so a crawler and a screen reader both reach the
            argument before the illustration of it, and so the panels sit under
            the copy on a phone rather than above it.
          */}
          <div className="min-w-0">
            <MetricsShowcase layout="stacked" />
            <p className="mt-4 text-[12px] text-muted">{content.text('seoMetrics', 'caption')}</p>
          </div>
        </div>
      </Container>
    </section>
  );
}
