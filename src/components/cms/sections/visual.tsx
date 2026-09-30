import Link from 'next/link';
import { Check, Minus, X } from 'lucide-react';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';
import { link, rows, str, type SectionProps } from './shared';

/**
 * Visual sections: numbers, lists, comparisons and process.
 *
 * Each one is a layout the frontend owns. An editor supplies the words and
 * picks between the layouts a component names; there is nowhere to set a
 * colour, a column width or a gap, which is what keeps a page built from
 * these looking like the rest of the site.
 */

/** A heading and a line of copy, above whatever the section is. */
function SectionHeader({ heading, body }: { heading: string; body: string }) {
  if (!heading && !body) return null;
  return (
    <div className="max-w-2xl">
      {heading ? (
        <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-[1.875rem] sm:leading-tight">
          {heading}
        </h2>
      ) : null}
      {body ? <p className="mt-4 text-[15px] leading-relaxed text-muted">{body}</p> : null}
    </div>
  );
}

// -------------------------------------------------------------------- stats

export function StatsSection({ values, variant }: SectionProps) {
  const items = rows<{ value?: string; label?: string }>(values, 'items');
  if (items.length === 0) return null;

  const heading = str(values, 'heading');

  return (
    <section className={cn('border-b border-line', variant === 'panel' ? 'bg-surface' : 'bg-white')}>
      <Container size="wide" className="py-12 lg:py-14">
        <SectionHeader heading={heading} body={str(values, 'body')} />
        <dl
          data-reveal-items=""
          className={cn(
            'grid gap-6 sm:grid-cols-2',
            heading && 'mt-10',
            items.length >= 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3',
          )}
        >
          {items.map((item, index) => (
            <div key={item.label || index}>
              <dt className="sr-only">{item.label}</dt>
              <dd>
                <span className="tabular block text-[2rem] leading-none font-semibold tracking-tight text-ink">
                  {item.value}
                </span>
                <span className="mt-2 block text-[13px] text-muted">{item.label}</span>
              </dd>
            </div>
          ))}
        </dl>
      </Container>
    </section>
  );
}

// ---------------------------------------------------------------- checklist

export function ChecklistSection({ values, variant }: SectionProps) {
  const items = rows<{ text?: string }>(values, 'items');
  if (items.length === 0) return null;

  return (
    <section className={cn('border-b border-line', variant === 'panel' ? 'bg-surface' : 'bg-white')}>
      <Container size="wide" className="py-12 lg:py-16">
        <div className="mx-auto max-w-2xl">
          <SectionHeader heading={str(values, 'heading')} body={str(values, 'body')} />
          <ul data-reveal-items="" className="mt-7 space-y-3">
            {items.map((item, index) => (
              <li key={index} className="flex gap-3">
                <Check className="mt-0.5 h-4.5 w-4.5 shrink-0 text-accent-600" aria-hidden="true" />
                <span className="text-[15px] leading-relaxed text-ink-soft">{item.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </section>
  );
}

// --------------------------------------------------------------- comparison

/**
 * Two columns: what a good opportunity looks like, and what to walk away from.
 *
 * A table would be the obvious shape and is the wrong one - the two sides are
 * not the same rows with different values, they are two lists that happen to
 * be opposites, and pairing them row by row forces false symmetry. Two lists
 * side by side say the same thing and reflow onto a phone without losing it.
 */
export function ComparisonSection({ values }: SectionProps) {
  const good = rows<{ text?: string }>(values, 'good');
  const bad = rows<{ text?: string }>(values, 'bad');
  if (good.length === 0 && bad.length === 0) return null;

  return (
    <section className="border-b border-line bg-surface">
      <Container size="wide" className="py-14 lg:py-16">
        <SectionHeader heading={str(values, 'heading')} body={str(values, 'body')} />

        <div className="mt-9 grid gap-5 lg:grid-cols-2">
          <Column
            title={str(values, 'goodTitle') || 'A good opportunity'}
            items={good}
            tone="good"
          />
          <Column title={str(values, 'badTitle') || 'A site to avoid'} items={bad} tone="bad" />
        </div>
      </Container>
    </section>
  );
}

function Column({
  title,
  items,
  tone,
}: {
  title: string;
  items: { text?: string }[];
  tone: 'good' | 'bad';
}) {
  const Icon = tone === 'good' ? Check : X;
  return (
    <div
      className={cn(
        'rounded-[var(--radius-card)] border bg-white p-6 shadow-[var(--shadow-card)]',
        tone === 'good' ? 'border-accent-200' : 'border-line',
      )}
    >
      <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      <ul className="mt-4 space-y-2.5">
        {items.map((item, index) => (
          <li key={index} className="flex gap-2.5">
            <Icon
              aria-hidden="true"
              className={cn(
                'mt-0.5 h-4 w-4 shrink-0',
                tone === 'good' ? 'text-accent-600' : 'text-muted',
              )}
            />
            <span className="text-[14px] leading-relaxed text-ink-soft">{item.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ----------------------------------------------------------------- icon grid

export function IconGridSection({ values, variant }: SectionProps) {
  const items = rows<{ title?: string; body?: string }>(values, 'items');
  if (items.length === 0) return null;

  return (
    <section className="border-b border-line bg-white">
      <Container size="wide" className="py-14 lg:py-16">
        <SectionHeader heading={str(values, 'heading')} body={str(values, 'body')} />
        <div
          data-reveal-items=""
          className={cn(
            'mt-10 grid gap-x-8 gap-y-8 sm:grid-cols-2',
            variant === 'four' ? 'lg:grid-cols-4' : 'lg:grid-cols-3',
          )}
        >
          {items.map((item, index) => (
            <div key={item.title || index} className="flex gap-3.5">
              {/* A mark rather than a chosen icon. An editor picking icons is
                  how a consistent page becomes a jumble, and the icon carries
                  nothing the heading beside it does not. */}
              <span
                aria-hidden="true"
                className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent-50 text-accent-700"
              >
                <Check className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h3 className="text-[15px] font-semibold text-ink">{item.title}</h3>
                {item.body ? (
                  <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{item.body}</p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

// ------------------------------------------------------------------ trust bar

export function TrustBarSection({ values }: SectionProps) {
  const items = rows<{ label?: string }>(values, 'items');
  if (items.length === 0) return null;

  return (
    <section className="border-b border-line bg-surface">
      <Container size="wide" className="py-8">
        {str(values, 'heading') ? (
          <p className="text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">
            {str(values, 'heading')}
          </p>
        ) : null}
        <ul
          data-reveal-items=""
          className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-3"
        >
          {items.map((item, index) => (
            <li key={item.label || index} className="text-[15px] font-medium text-muted">
              {item.label}
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

// --------------------------------------------------------------------- steps

export function StepsSection({ values, variant }: SectionProps) {
  const items = rows<{ title?: string; body?: string }>(values, 'items');
  if (items.length === 0) return null;

  const cta = link(values, 'cta');
  const timeline = variant === 'timeline';

  return (
    <section className="border-b border-line bg-surface">
      <Container size="wide" className="py-14 lg:py-16">
        <SectionHeader heading={str(values, 'heading')} body={str(values, 'body')} />

        <ol
          data-reveal-items=""
          className={cn(
            'mt-10 gap-8',
            timeline ? 'space-y-8' : 'grid sm:grid-cols-2 lg:grid-cols-4',
          )}
        >
          {items.map((item, index) => (
            <li key={item.title || index} className={cn(timeline && 'flex gap-4')}>
              <span className="tabular flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-50 text-[14px] font-semibold text-accent-700">
                {index + 1}
              </span>
              <div className={cn('min-w-0', !timeline && 'mt-4')}>
                <h3 className="text-[15px] font-semibold text-ink">{item.title}</h3>
                {item.body ? (
                  <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{item.body}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>

        {cta.label && cta.href ? (
          <Button asChild variant="accent" size="lg" className="mt-9">
            <Link href={cta.href}>{cta.label}</Link>
          </Button>
        ) : null}
      </Container>
    </section>
  );
}

// ------------------------------------------------------------ related pages

export function RelatedPagesSection({ values }: SectionProps) {
  const items = rows<{ label?: string; description?: string; href?: string }>(values, 'items')
    .filter((item) => item.label && item.href);
  if (items.length === 0) return null;

  return (
    <section className="border-b border-line bg-white">
      <Container size="wide" className="py-12 lg:py-14">
        <SectionHeader heading={str(values, 'heading')} body={str(values, 'body')} />
        <ul
          data-reveal-items=""
          className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {items.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href as string}
                className="block h-full rounded-[var(--radius-card)] border border-line bg-white p-4 shadow-[var(--shadow-card)] transition-colors hover:border-accent-500"
              >
                <span className="block text-[14px] font-medium text-ink">{item.label}</span>
                {item.description ? (
                  <span className="mt-1 block text-[13px] leading-relaxed text-muted">
                    {item.description}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

/** Shared by the parrot components, which are these with a mascot beside them. */
export { SectionHeader, Minus };
