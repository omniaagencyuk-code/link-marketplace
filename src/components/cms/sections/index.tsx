import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { RichText, type RichTextValue } from '@/lib/cms/rich-text-render';
import { Faq, type FaqItem } from '@/components/shared/faq';
import { MonsteraLeaf, PalmFrond } from '@/components/shared/foliage';
import { cn } from '@/lib/utils/cn';
import { link as linkOf, rows, str, type SectionProps } from './shared';

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
 *
 * The rest of the library is in the files beside this one, grouped the way
 * the admin's section picker groups them.
 */

export * from './shared';
export * from './content';
export * from './visual';
export * from './marketplace';
export * from './parrot';
export * from './hero';
export * from './niche';
export * from './home';

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

  /*
    The closing panel: a dark green card inside the page rather than a band
    across it, with foliage kept to one side. Left-aligned on purpose - it is
    the end of an argument, not a poster.
  */
  if (variant === 'panel') {
    const annotation = str(values, 'annotation');
    return (
      <section className="bg-white py-16 lg:py-20">
        <Container size="wide">
          <div className="relative overflow-hidden rounded-2xl bg-[#08301F] px-6 py-12 shadow-[var(--shadow-pop)] sm:px-10 lg:px-14 lg:py-16">
            <div
              aria-hidden="true"
              className="absolute inset-0 opacity-[0.35]"
              style={{
                backgroundImage:
                  'radial-gradient(38rem 24rem at 100% 0%, rgba(16,185,129,0.35) 0%, transparent 62%)',
              }}
            />
            <PalmFrond
              aria-hidden="true"
              className="pointer-events-none absolute -right-6 -bottom-10 hidden h-auto w-64 rotate-[195deg] text-accent-300 opacity-25 sm:block"
            />
            <MonsteraLeaf
              aria-hidden="true"
              className="pointer-events-none absolute -top-8 right-24 hidden h-auto w-28 rotate-12 text-accent-300 opacity-20 lg:block"
            />

            <div className="relative max-w-2xl">
              <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                {heading}
              </h2>
              {body ? (
                <p className="mt-4 text-[16px] leading-relaxed text-white/70">{body}</p>
              ) : null}
              <div className="mt-8 flex flex-wrap gap-3">
                {primary.label && primary.href ? (
                  <Button asChild size="lg" variant="accent">
                    <Link href={primary.href}>
                      {primary.label}
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </Button>
                ) : null}
                {secondary.label && secondary.href ? (
                  <Button
                    asChild
                    size="lg"
                    variant="outline"
                    className="border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white"
                  >
                    <Link href={secondary.href}>{secondary.label}</Link>
                  </Button>
                ) : null}
              </div>
              {annotation ? (
                <p className="font-handwritten mt-8 text-[20px] text-accent-300">{annotation}</p>
              ) : null}
            </div>
          </div>
        </Container>
      </section>
    );
  }

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
              <Link href={primary.href}>
                {primary.label}
                {/* The same arrow every primary call to action on the site
                    carries. It was missing here only because this component
                    predates any page rendering it. */}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
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

export function FaqSection({ values, variant, sectionId }: SectionProps) {
  const items = rows<{ question?: string; answer?: string }>(values, 'items')
    // Both halves, because the pair becomes a FAQPage entry and a question
    // with an empty answer makes Google distrust the markup on the whole page.
    .filter((item): item is FaqItem => Boolean(item.question && item.answer));

  if (items.length === 0) return null;

  /*
    Three bands, because three pages drew three. The niche template's is white
    and deep; the homepage's is on the page background and just as deep; the
    library's own is tighter. They exist so a converted page keeps the
    questions it had rather than gaining a differently-sized version of them.
  */
  const wide = variant === 'wide' || variant === 'wide-muted';
  const muted = variant !== 'wide';

  return (
    <section className={cn('border-b border-line', muted ? 'bg-surface' : 'bg-white')}>
      <Container size="wide" className={wide ? 'py-14 lg:py-20' : 'py-14 lg:py-16'}>
        <div className={cn('mx-auto', wide ? 'max-w-3xl' : 'max-w-2xl')}>
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
