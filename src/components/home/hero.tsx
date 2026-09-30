import Link from 'next/link';
import { ArrowRight, Check, Globe, Layers, LineChart } from 'lucide-react';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { ParrotHero } from './parrot-hero';
import { formatNumber } from '@/lib/utils/format';
import type { ContentAccessors } from '@/lib/cms/resolve';
import type { MarketplaceStats } from '@/lib/services';

/**
 * Homepage hero.
 *
 * Two columns: the argument on the left, the mascot on the right with three
 * cards floating over it. Below 1024px it stacks in reading order - headline,
 * copy, buttons, reassurance, then the artwork, which is decoration and goes
 * last.
 *
 * ## The cards say true things
 *
 * The design they come from had "+237% Higher Rankings", "+180% More Traffic",
 * "+197% More Visibility". Those are the right shape and the wrong content:
 * they are performance claims about other people's SEO that nobody here can
 * substantiate, on the page a first-time visitor judges the business by.
 *
 * So the cards keep the device and carry facts instead - how many publishers
 * are listed, how many niches, how many countries - counted from the
 * marketplace on every render. The labels are editable; the figures are not,
 * because a figure somebody types is a figure that is wrong within the year
 * and wrong silently. The homepage claimed "5,000+ vetted websites" against a
 * real number closer to nine hundred until this.
 *
 * A card whose figure is zero does not render, so the row is never padded
 * with a claim of nothing.
 */
export function Hero({ content, stats }: { content: ContentAccessors; stats: MarketplaceStats }) {
  const primaryCta = content.link('hero', 'primaryCta');
  const secondaryCta = content.link('hero', 'secondaryCta');
  const reassurance = content.list<{ label: string }>('hero', 'reassurance');

  const cards = [
    { icon: LineChart, value: stats.totalWebsites, label: content.text('hero', 'cardWebsites') },
    { icon: Layers, value: stats.totalNiches, label: content.text('hero', 'cardNiches') },
    { icon: Globe, value: stats.totalCountries, label: content.text('hero', 'cardCountries') },
  ].filter((card) => card.value > 0 && card.label);

  return (
    <section className="tropical-wash relative overflow-hidden border-b border-line bg-white">
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent-400/40 to-transparent"
      />

      <Container size="wide" className="relative py-12 lg:py-20">
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-16">
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

          <div className="relative z-10 min-w-0">
            <ParrotHero annotation={content.text('hero', 'annotation')} />

            {/*
              Floated over the artwork from `sm` up, and stacked underneath it
              below that. Absolute positioning at 375px would put three cards
              on top of a parrot and make both unreadable, and the cards are
              the half carrying information.
            */}
            <ul className="mt-5 grid gap-3 sm:absolute sm:inset-y-0 sm:left-0 sm:mt-0 sm:flex sm:flex-col sm:justify-center sm:gap-4">
              {cards.map((card) => (
                <li
                  key={card.label}
                  className="flex items-center gap-3 rounded-[var(--radius-card)] border border-line bg-white/95 px-3.5 py-2.5 shadow-[var(--shadow-raised)] backdrop-blur-sm sm:max-w-[13rem]"
                >
                  <span
                    aria-hidden="true"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent-50 text-accent-700"
                  >
                    <card.icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="tabular block text-[15px] leading-tight font-semibold text-ink">
                      {formatNumber(card.value)}
                    </span>
                    <span className="block text-[12px] leading-tight text-muted">{card.label}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Container>
    </section>
  );
}
