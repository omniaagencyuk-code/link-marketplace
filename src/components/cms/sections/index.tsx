import Link from 'next/link';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { RichText, type RichTextValue } from '@/lib/cms/rich-text-render';
import { Faq, type FaqItem } from '@/components/shared/faq';
import { cn } from '@/lib/utils/cn';
import type { SectionValues } from '@/lib/cms/sections';

/**
 * The frontend half of the component registry.
 *
 * Every section on a built page is one of these. They are ordinary server
 * components: no state, no effects, no client JavaScript of their own, and
 * nothing here imports a field definition or an editor. That is what keeps
 * the admin's bundle out of a public page.
 *
 * Each takes a `values` object shaped by its schema entry and a `variant`
 * string the schema named. **The variant chooses between layouts written
 * here** - it is never a class name from the database, which is the line
 * between a page builder that keeps a design system and one that dissolves
 * it.
 */

export interface SectionProps {
  values: SectionValues;
  variant: string;
  /** The row's id, for anything that needs to be unique on the page. */
  sectionId: string;
}

/** Reading a value that came out of jsonb, with the type it should have. */
const str = (values: SectionValues, key: string): string =>
  typeof values[key] === 'string' ? (values[key] as string) : '';

const rows = <T,>(values: SectionValues, key: string): T[] =>
  Array.isArray(values[key]) ? (values[key] as T[]) : [];

const linkOf = (values: SectionValues, key: string): { label: string; href: string } => {
  const raw = values[key];
  if (typeof raw !== 'object' || raw === null) return { label: '', href: '' };
  const entry = raw as { label?: unknown; href?: unknown };
  return {
    label: typeof entry.label === 'string' ? entry.label : '',
    href: typeof entry.href === 'string' ? entry.href : '',
  };
};

// --------------------------------------------------------------- rich text

const RICH_TEXT_WIDTH: Record<string, string> = {
  default: 'max-w-2xl',
  narrow: 'max-w-xl',
  wide: 'max-w-none',
};

export function RichTextSection({ values, variant }: SectionProps) {
  const heading = str(values, 'heading');
  const body = values.body as RichTextValue | undefined;
  if (!heading && !body) return null;

  return (
    <section className="border-b border-line bg-white">
      <Container size="wide" className="py-12 lg:py-16">
        <div className={cn('mx-auto', RICH_TEXT_WIDTH[variant] ?? RICH_TEXT_WIDTH.default)}>
          {heading ? (
            <h2 className="text-[1.375rem] font-semibold tracking-tight text-ink sm:text-2xl">
              {heading}
            </h2>
          ) : null}
          {body ? (
            <div className={heading ? 'mt-5' : undefined}>
              <RichText source={body} variant="article" />
            </div>
          ) : null}
        </div>
      </Container>
    </section>
  );
}

// --------------------------------------------------------- call to action

export function CtaSection({ values, variant }: SectionProps) {
  const heading = str(values, 'heading');
  if (!heading) return null;

  const body = str(values, 'body');
  const primary = linkOf(values, 'primaryCta');
  const secondary = linkOf(values, 'secondaryCta');
  const dark = variant === 'dark';

  return (
    <section className={dark ? 'bg-navy-950 text-white' : 'border-b border-line bg-surface'}>
      <Container size="wide" className="py-14 text-center lg:py-20">
        <h2
          className={cn(
            'mx-auto max-w-2xl text-2xl font-semibold tracking-tight sm:text-3xl',
            !dark && 'text-ink',
          )}
        >
          {heading}
        </h2>

        {body ? (
          <p
            className={cn(
              'mx-auto mt-3 max-w-xl text-[15px] leading-relaxed',
              dark ? 'text-white/70' : 'text-muted',
            )}
          >
            {body}
          </p>
        ) : null}

        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          {primary.label && primary.href ? (
            <Button asChild variant="accent" size="lg">
              <Link href={primary.href}>{primary.label}</Link>
            </Button>
          ) : null}

          {/* A button with no label is a box with nothing in it. */}
          {secondary.label && secondary.href ? (
            <Button
              asChild
              variant="outline"
              size="lg"
              className={dark ? 'border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white' : undefined}
            >
              <Link href={secondary.href}>{secondary.label}</Link>
            </Button>
          ) : null}
        </div>
      </Container>
    </section>
  );
}

// ----------------------------------------------------------- feature cards

export function FeatureCardsSection({ values, variant }: SectionProps) {
  const items = rows<{ title?: string; body?: string }>(values, 'items');
  if (items.length === 0) return null;

  const heading = str(values, 'heading');
  const body = str(values, 'body');

  return (
    <section className="border-b border-line bg-white">
      <Container size="wide" className="py-14 lg:py-16">
        {heading ? (
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-[2rem] sm:leading-tight">
              {heading}
            </h2>
            {body ? <p className="mt-4 text-[15px] leading-relaxed text-muted">{body}</p> : null}
          </div>
        ) : null}

        {/* The section names its own repeating group. A stylesheet that
            guessed at the shape got it wrong in both directions: the cards
            are four levels down, so every stagger delay resolved to zero. */}
        <div
          data-reveal-items=""
          className={cn(
            'grid gap-5 sm:grid-cols-2',
            heading && 'mt-10',
            variant === 'four' ? 'lg:grid-cols-4' : 'lg:grid-cols-3',
          )}
        >
          {items.map((item, index) => (
            <div
              key={item.title || index}
              className="rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)]"
            >
              <h3 className="text-[15px] font-semibold text-ink">{item.title}</h3>
              {item.body ? (
                <p className="mt-2 text-[14px] leading-relaxed text-muted">{item.body}</p>
              ) : null}
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

// -------------------------------------------------------------------- FAQ

export function FaqSection({ values, sectionId }: SectionProps) {
  const items = rows<{ question?: string; answer?: string }>(values, 'items')
    // Both halves, because the pair becomes a FAQPage entry and a question
    // with an empty answer makes Google distrust the markup on the whole page.
    .filter((item): item is FaqItem => Boolean(item.question && item.answer));

  if (items.length === 0) return null;

  return (
    <section className="border-b border-line bg-surface">
      <Container size="wide" className="py-14 lg:py-16">
        <div className="mx-auto max-w-2xl">
          {/* Faq brings its own heading and its own accordion markup - a
              second <h2> around it would announce the section twice. */}
          <Faq
            items={items}
            title={str(values, 'heading') || 'Frequently asked questions'}
            id={`faq-${sectionId}`}
          />
        </div>
      </Container>
    </section>
  );
}
