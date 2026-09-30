import Link from 'next/link';
import Image from 'next/image';
import { Check } from 'lucide-react';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { formatNumber } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import { link, rows, str, type SectionProps } from './shared';

/**
 * The Press Parrot components.
 *
 * Editorial furniture with the mascot attached: an aside in the middle of a
 * long read, a set of criteria, a figure worth stopping on, a sign-off.
 *
 * Used sparingly, and that is a rule about pages rather than about code. A
 * parrot in every section is a page nobody takes seriously, so these are
 * worth reaching for once or twice on a page and not more - the brief says as
 * much and it is right.
 *
 * The mascot is decorative in all of them: `alt` is empty, because the words
 * beside it say everything it says, and a screen reader announcing a parrot
 * before the tip is noise.
 */

const MASCOT = '/images/parrots/gambling-parrot.webp';

function Mascot({ className }: { className?: string }) {
  return (
    <Image
      src={MASCOT}
      alt=""
      width={160}
      height={160}
      aria-hidden="true"
      className={cn('h-16 w-16 shrink-0 object-contain', className)}
    />
  );
}

// -------------------------------------------------------------- parrot says

/**
 * An aside in the middle of a long read.
 *
 * The one component designed to interrupt: a panel, a mascot and two or three
 * sentences of opinion. It breaks up a wall of text and gives the page a
 * voice, which is most of what stops a long SEO page reading like a document.
 */
export function ParrotSaysSection({ values, variant }: SectionProps) {
  const body = str(values, 'body');
  if (!body) return null;

  return (
    <section className="border-b border-line bg-white">
      <Container size="wide" className="py-10 lg:py-12">
        <aside
          className={cn(
            'mx-auto flex max-w-2xl gap-5 rounded-[var(--radius-card)] border p-5 sm:p-6',
            variant === 'accent' ? 'border-accent-200 bg-accent-50' : 'border-line bg-surface',
          )}
        >
          <Mascot />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-[0.12em] text-accent-700 uppercase">
              {str(values, 'label') || 'Parrot says'}
            </p>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{body}</p>
          </div>
        </aside>
      </Container>
    </section>
  );
}

// --------------------------------------------------------- parrot checklist

export function ParrotChecklistSection({ values }: SectionProps) {
  const items = rows<{ text?: string }>(values, 'items');
  if (items.length === 0) return null;

  return (
    <section className="border-b border-line bg-surface">
      <Container size="wide" className="py-14 lg:py-16">
        <div className="mx-auto flex max-w-3xl flex-col gap-6 sm:flex-row sm:gap-8">
          <Mascot className="h-20 w-20" />
          <div className="min-w-0 flex-1">
            {str(values, 'heading') ? (
              <h2 className="text-[1.375rem] font-semibold tracking-tight text-ink sm:text-2xl">
                {str(values, 'heading')}
              </h2>
            ) : null}
            {str(values, 'body') ? (
              <p className="mt-3 text-[15px] leading-relaxed text-muted">{str(values, 'body')}</p>
            ) : null}

            <ul data-reveal-items="" className="mt-6 space-y-3">
              {items.map((item, index) => (
                <li key={index} className="flex gap-3">
                  <Check
                    className="mt-0.5 h-4 w-4 shrink-0 text-accent-600"
                    aria-hidden="true"
                  />
                  <span className="text-[15px] leading-relaxed text-ink-soft">{item.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Container>
    </section>
  );
}

// -------------------------------------------------------------- parrot view

/**
 * A figure worth stopping on, with the live number behind it.
 *
 * The number is counted rather than typed. A statistic in editorial copy is
 * true on the day it is written and quietly wrong for years afterwards, and
 * this is the one place on a marketing page where being wrong is expensive.
 */
export function ParrotViewSection({ values, data }: SectionProps) {
  const body = str(values, 'body');
  const figure = data.totals?.websites ?? 0;
  if (!body && figure === 0) return null;

  return (
    <section className="border-b border-line bg-navy-950 text-white">
      <Container size="wide" className="py-14 lg:py-16">
        <div className="mx-auto flex max-w-3xl flex-col items-start gap-6 sm:flex-row sm:items-center sm:gap-10">
          <Mascot className="h-20 w-20" />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-[0.12em] text-accent-400 uppercase">
              {str(values, 'label') || "Parrot's view"}
            </p>
            {figure > 0 ? (
              <p className="tabular mt-3 text-[2.5rem] leading-none font-semibold tracking-tight">
                {formatNumber(figure)}
              </p>
            ) : null}
            {body ? (
              <p className="mt-3 text-[15px] leading-relaxed text-white/70">{body}</p>
            ) : null}
          </div>
        </div>
      </Container>
    </section>
  );
}

// --------------------------------------------------------------- parrot cta

export function ParrotCtaSection({ values }: SectionProps) {
  const heading = str(values, 'heading');
  if (!heading) return null;

  const primary = link(values, 'primaryCta');
  const secondary = link(values, 'secondaryCta');

  return (
    <section className="border-b border-line bg-accent-50">
      <Container size="wide" className="py-14 lg:py-16">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center sm:flex-row sm:text-left">
          <Mascot className="h-24 w-24" />
          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-semibold tracking-tight text-ink">{heading}</h2>
            {str(values, 'body') ? (
              <p className="mt-2.5 text-[15px] leading-relaxed text-muted">{str(values, 'body')}</p>
            ) : null}

            <div className="mt-5 flex flex-wrap items-center justify-center gap-3 sm:justify-start">
              {primary.label && primary.href ? (
                <Button asChild variant="accent" size="lg">
                  <Link href={primary.href}>{primary.label}</Link>
                </Button>
              ) : null}
              {secondary.label && secondary.href ? (
                <Button asChild variant="outline" size="lg">
                  <Link href={secondary.href}>{secondary.label}</Link>
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

// -------------------------------------------------------- parrot flight path

/**
 * A process, with a dotted line through it.
 *
 * The line is drawn once across the row on a desktop and absent on a phone,
 * where the steps stack and a line between them would point sideways at
 * nothing. Purely decorative: the steps are numbered, and the numbers are
 * what carries the order to anyone not looking at it.
 */
export function ParrotFlightPathSection({ values }: SectionProps) {
  const items = rows<{ title?: string; body?: string }>(values, 'items');
  if (items.length === 0) return null;

  return (
    <section className="border-b border-line bg-white">
      <Container size="wide" className="py-14 lg:py-16">
        {str(values, 'heading') ? (
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-[1.875rem] sm:leading-tight">
              {str(values, 'heading')}
            </h2>
            {str(values, 'body') ? (
              <p className="mt-4 text-[15px] leading-relaxed text-muted">{str(values, 'body')}</p>
            ) : null}
          </div>
        ) : null}

        <div className="relative mt-12">
          {/* Behind the numbers, between the first and last, desktop only. */}
          <div
            aria-hidden="true"
            className="absolute top-4 right-[12%] left-[12%] hidden border-t-2 border-dashed border-accent-200 lg:block"
          />

          <ol
            data-reveal-items=""
            className="relative grid gap-8 sm:grid-cols-2 lg:grid-cols-4"
          >
            {items.map((item, index) => (
              <li key={item.title || index} className="text-center">
                <span className="tabular mx-auto flex h-8 w-8 items-center justify-center rounded-full border-2 border-accent-200 bg-white text-[14px] font-semibold text-accent-700">
                  {index + 1}
                </span>
                <h3 className="mt-4 text-[15px] font-semibold text-ink">{item.title}</h3>
                {item.body ? (
                  <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{item.body}</p>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      </Container>
    </section>
  );
}
