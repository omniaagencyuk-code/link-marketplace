import Link from 'next/link';
import { ArrowRight, Check, X } from 'lucide-react';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { HandwrittenNote } from '@/components/shared/handwritten';
import { RichText } from '@/lib/cms/rich-text-render';
import type { ContentAccessors } from '@/lib/cms/resolve';

/**
 * The problem, then the alternative.
 *
 * A two-column comparison rather than a wall of prose: the left column is the
 * work a team does today, the right is what replaces it.
 */
export function WhyPressParrot({ content }: { content: ContentAccessors }) {
  const oldWay = content.list<{ label: string }>('why', 'oldWay');
  const newWay = content.list<{ label: string }>('why', 'newWay');
  const cta = content.link('why', 'cta');
  const annotation = content.text('why', 'annotation');

  return (
    <section className="border-b border-line bg-surface" aria-labelledby="why-heading">
      <Container size="wide" className="py-14 lg:py-20">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
          <div className="min-w-0">
            <h2
              id="why-heading"
              className="text-2xl font-semibold tracking-tight text-ink sm:text-[2rem] sm:leading-tight"
            >
              {content.text('why', 'heading')}
            </h2>
            <div className="mt-4">
              <RichText source={content.richText('why', 'body')} />
            </div>

            {annotation ? (
              <HandwrittenNote arrow="down-right" className="mt-7 hidden lg:block">
                {annotation}
              </HandwrittenNote>
            ) : null}

            <Button asChild variant="accent" size="lg" className="mt-6 lg:mt-2">
              <Link href={cta.href}>
                {cta.label}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>

          <div className="grid min-w-0 gap-5 sm:grid-cols-2">
            <div className="rounded-[var(--radius-card)] border border-line bg-white p-6">
              <h3 className="text-[13px] font-semibold tracking-wide text-muted uppercase">
                {content.text('why', 'oldHeading')}
              </h3>
              <ul className="mt-4 space-y-2.5">
                {oldWay.map((item, index) => (
                  <li
                    key={item.label || index}
                    className="flex gap-2.5 text-[13px] leading-relaxed text-muted"
                  >
                    <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-soft" aria-hidden="true" />
                    {item.label}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-[var(--radius-card)] border border-accent-500/30 bg-white p-6 shadow-[var(--shadow-card)]">
              <h3 className="text-[13px] font-semibold tracking-wide text-accent-700 uppercase">
                {content.text('why', 'newHeading')}
              </h3>
              <ul className="mt-4 space-y-2.5">
                {newWay.map((item, index) => (
                  <li
                    key={item.label || index}
                    className="flex gap-2.5 text-[13px] leading-relaxed text-ink-soft"
                  >
                    <Check
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-600"
                      aria-hidden="true"
                    />
                    {item.label}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
