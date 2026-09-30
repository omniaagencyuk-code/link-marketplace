import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Container } from '@/components/layout/container';
import type { ContentAccessors } from '@/lib/cms/resolve';

/**
 * The metric cards, above the FAQ.
 *
 * Each card links to its own section of /link-building-metrics rather than to
 * the top of it. Somebody who wants to know what Domain Rating actually
 * measures should land on the paragraph that says so, not on a three-thousand
 * word page with a contents list.
 *
 * Its own component rather than the library's icon grid because the cards are
 * links, and a grid of static points is a different thing from a grid of
 * places to go.
 */
export function MetricCards({ content }: { content: ContentAccessors }) {
  const items = content.list<{ title: string; body: string; href: string }>('metricCards', 'items');
  if (!items.length) return null;

  const cta = content.link('metricCards', 'cta');

  return (
    <section className="border-b border-line bg-white" aria-labelledby="metrics-heading">
      <Container size="wide" className="py-14 lg:py-16">
        <div className="max-w-2xl">
          <h2
            id="metrics-heading"
            className="text-2xl font-semibold tracking-tight text-ink sm:text-[1.875rem] sm:leading-tight"
          >
            {content.text('metricCards', 'heading')}
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-muted">
            {content.text('metricCards', 'body')}
          </p>
        </div>

        <ul data-reveal-items="" className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <li key={item.title}>
              <Link
                href={item.href}
                className="flex h-full flex-col rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)] transition-colors hover:border-accent-500"
              >
                <span className="text-[15px] font-semibold text-ink">{item.title}</span>
                <span className="mt-2 flex-1 text-[14px] leading-relaxed text-muted">
                  {item.body}
                </span>
                <span className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-accent-700">
                  What it measures
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              </Link>
            </li>
          ))}
        </ul>

        {cta.label && cta.href ? (
          <Link
            href={cta.href}
            className="mt-8 inline-flex items-center gap-1.5 text-[14px] font-medium text-accent-700 hover:underline"
          >
            {cta.label}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        ) : null}
      </Container>
    </section>
  );
}
