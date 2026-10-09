import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { HeroBackdrop, HeroBand } from './hero-backdrop';
import type { ContentAccessors } from '@/lib/cms/resolve';

/**
 * Homepage hero.
 *
 * A photograph across the whole section - coastline on the left, the macaw
 * with its laptop on the right - and the argument set over the quiet half of
 * it. `HeroBackdrop` holds the picture and the scrim that makes the text
 * readable on it; everything here is the words.
 *
 * ## What went, and why it is not a loss
 *
 * It had a drawn mascot in a right-hand column with three cards floating
 * over it, each carrying a counted figure: publishers listed, niches,
 * countries. Both are gone.
 *
 * The mascot, because the photograph has a parrot in it and two parrots side
 * by side is not a design. The cards, because the strip directly below this
 * section already states those same three figures, and a number printed
 * twice on one screen reads as two claims that happen to agree. The strip is
 * the one that stays: it has room for the fourth figure as well, and it is
 * not sitting on top of a photograph.
 *
 * The rule those cards existed for is unchanged and still enforced where the
 * figures now live - they are counted from the marketplace on every render,
 * never typed. The homepage claimed "5,000+ vetted websites" against a real
 * number nearer nine hundred until that rule existed.
 *
 * Below `lg` the columns stack and the picture holds its left edge, so the
 * headline is never over the bird.
 */
export function Hero({ content }: { content: ContentAccessors }) {
  const primaryCta = content.link('hero', 'primaryCta');
  const secondaryCta = content.link('hero', 'secondaryCta');
  const reassurance = content.list<{ label: string }>('hero', 'reassurance');

  return (
    <section className="relative overflow-hidden border-b border-line bg-white">
      <HeroBackdrop />

      <Container size="wide" className="relative py-14 lg:py-24">
        {/*
          The second column is empty on purpose. It is the space the bird
          occupies in the photograph: without it the copy would run the full
          width on a wide screen and finish on top of the laptop.
        */}
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] lg:gap-16">
          <div className="relative z-20 min-w-0">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-accent-700 uppercase">
              {content.text('hero', 'eyebrow')}
            </p>

            {/*
              Three lines by design, and three fields rather than one with
              markup in it: an editor writing a headline should not have to
              know where a line break is allowed. On a phone the breaks are
              dropped and the browser wraps it, because a fixed break at 375px
              leaves one word stranded.
            */}
            <h1 className="mt-5 text-[2.5rem] leading-[1.04] font-semibold tracking-tight text-ink sm:text-5xl lg:text-[3.5rem]">
              {content.text('hero', 'titleLine1')}
              <br className="hidden sm:block" /> {content.text('hero', 'titleLine2')}
              <br className="hidden sm:block" />{' '}
              <span className="text-accent-600">{content.text('hero', 'titleAccent')}</span>
            </h1>

            <p className="mt-6 max-w-xl text-[16px] leading-relaxed text-muted lg:text-[17px]">
              {content.text('hero', 'intro')}
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild variant="accent" size="lg">
                <Link href={primaryCta.href}>
                  {primaryCta.label}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href={secondaryCta.href}>{secondaryCta.label}</Link>
              </Button>
            </div>

            {reassurance.length ? (
              <ul className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2">
                {reassurance.map((item) => (
                  <li
                    key={item.label}
                    className="flex items-center gap-1.5 text-[13px] text-ink-soft"
                  >
                    <Check className="h-3.5 w-3.5 shrink-0 text-accent-600" aria-hidden="true" />
                    {item.label}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

        </div>
      </Container>

      <HeroBand />
    </section>
  );
}
