import Link from 'next/link';
import { ArrowRight, BadgeCheck, Check, Coins, Gauge, Lock, ShoppingBag } from 'lucide-react';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { RedactedPreview } from '@/components/marketplace/redacted-preview';
import { MonsteraLeaf } from '@/components/shared/foliage';
import { NicheMascot } from '@/components/marketing/niche-mascot';
import { NicheBanner } from '@/components/marketing/niche-banner';
import { RichText, type RichTextValue } from '@/lib/cms/rich-text-render';
import { journeySteps } from '@/lib/config/how-it-works';
import { formatNumber } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import { image, link as linkOf, rows, str, type SectionProps } from './shared';

/**
 * The blocks a niche landing page is made of.
 *
 * These are `NicheLandingPage` taken apart. The markup in each one is the
 * markup that file rendered - the same classes, the same order, the same
 * conditionals - because the point of this was never to redesign the gambling
 * page. It was to stop the page's *shape* being source code, so that the nine
 * bands somebody sees can be reordered, hidden or added to from the admin
 * rather than from a deploy.
 *
 * Two things are deliberately not editable, and both were not editable before
 * either: the four icons on the value cards, and the steps in "How it works".
 * The icons are positional decoration the headings beside them already say,
 * and an editor picking icons is how a consistent page becomes a jumble. The
 * steps are the shared journey config, so this page cannot describe a process
 * the rest of the site contradicts.
 *
 * Nothing here holds a number. The live count, the preview rows and the
 * category all arrive as `data`, from the page's marketplace configuration -
 * a section carries the wording around the figure and never the figure.
 */

/**
 * Rounded down to a round number, so the page understates rather than
 * overstates: "240+" with 243 listed is true tomorrow as well as today. Small
 * inventories are reported exactly, because rounding 8 down to 0 would be
 * worse than useless.
 */
function describeCount(total: number): string {
  if (total < 25) return formatNumber(total);
  const step = total < 100 ? 10 : total < 1000 ? 20 : 100;
  return `${formatNumber(Math.floor(total / step) * step)}+`;
}

// -------------------------------------------------------------------- hero

/**
 * The first screen of a niche page.
 *
 * Structural, so it arrives locked: it holds the page's only `h1` and the
 * breadcrumb, and a hero dragged into the middle of a page is a mistake
 * waiting to be made. Everything about it stays editable - the headline, the
 * copy, the buttons, the reassurance ticks and both pieces of artwork.
 *
 * It is not animatable, for the same reason the generic hero is not: the
 * headline or the banner is almost always the Largest Contentful Paint, and
 * an element at `opacity: 0` counts as unpainted.
 */
export function NicheHeroSection({ values, data }: SectionProps) {
  const trust = rows<{ label?: string }>(values, 'trust');
  const mascot = image(values, 'mascot');
  /*
    Wide artwork behind the whole first screen, when the page has any. It
    replaces the mascot column on a desktop rather than joining it - two
    parrots on one screen is one parrot too many - but only from `lg` up,
    which is where a 2.8:1 picture has room to be itself.
  */
  const banner = image(values, 'banner');
  const hasBanner = Boolean(banner.src);
  const primaryCta = linkOf(values, 'primaryCta');
  const secondaryCta = linkOf(values, 'secondaryCta');

  const { label: breadcrumbLabel, breadcrumbParent } = data.page;

  return (
    <section className="tropical-wash relative overflow-hidden border-b border-line bg-white">
      {hasBanner ? (
        <NicheBanner src={banner.src} />
      ) : (
        <MonsteraLeaf className="pointer-events-none absolute -top-20 -right-24 hidden w-80 rotate-[18deg] opacity-20 lg:block" />
      )}
      <Container size="wide" className="relative py-12 lg:py-16">
        {breadcrumbLabel ? (
          <nav aria-label="Breadcrumb" className="mb-6">
            <ol className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
              <li>
                <Link href="/" className="hover:text-ink">
                  Home
                </Link>
              </li>
              {breadcrumbParent ? (
                <>
                  <li aria-hidden="true">/</li>
                  <li>
                    <Link href={breadcrumbParent.href} className="hover:text-ink">
                      {breadcrumbParent.label}
                    </Link>
                  </li>
                </>
              ) : null}
              <li aria-hidden="true">/</li>
              <li className="text-ink-soft">{breadcrumbLabel}</li>
            </ol>
          </nav>
        ) : null}

        <div
          className={cn(
            'grid items-center gap-10 lg:gap-14',
            hasBanner
              ? 'lg:grid-cols-1'
              : 'lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.75fr)]',
          )}
        >
          {/* Held well clear of the artwork's right-hand third, so the
              headline never lands on the parrot at any desktop width. */}
          <div className={cn('min-w-0', hasBanner && 'lg:max-w-xl xl:max-w-2xl')}>
            <p className="text-[11px] font-semibold tracking-[0.12em] text-accent-700 uppercase">
              {str(values, 'eyebrow')}
            </p>
            <h1 className="mt-4 text-[2.25rem] leading-[1.06] font-semibold tracking-tight text-ink sm:text-5xl">
              {str(values, 'heading')}
            </h1>
            <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-muted lg:text-[17px]">
              {str(values, 'intro')}
            </p>

            {trust.length ? (
              <ul className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2">
                {trust.map((item, index) => (
                  <li
                    key={item.label || index}
                    className="flex items-center gap-2 text-[13px] font-medium text-ink-soft"
                  >
                    <Check className="h-4 w-4 shrink-0 text-accent-600" aria-hidden="true" />
                    {item.label}
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Button asChild variant="accent" size="lg">
                <Link href={primaryCta.href || '/'}>
                  {primaryCta.label}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href={secondaryCta.href || '/'}>{secondaryCta.label}</Link>
              </Button>
            </div>

            <p className="mt-4 text-[13px] text-muted">{str(values, 'microcopy')}</p>
          </div>

          {/* After the copy in the source, which is where it belongs on a
              phone: the headline is what a visitor from Google came for,
              and on desktop the grid puts this column on the right anyway. */}
          <div className={cn('min-w-0', hasBanner && 'lg:hidden')}>
            {/* Capped: left to fill the column the artwork sets the height
                of the whole hero and opens a hole above the headline. */}
            <NicheMascot src={mascot.src} alt={mascot.alt} className="lg:max-w-sm lg:ml-auto" />
          </div>
        </div>
      </Container>
    </section>
  );
}

// ------------------------------------------------------- marketplace preview

/**
 * Copy and a live count beside the redacted table, scoped to this page's
 * category.
 *
 * The rows and the figure both come from the page's marketplace
 * configuration, fetched once for the page. Nothing identifying reaches here:
 * the rows were redacted in the service layer and never carried a domain, a
 * price or an id.
 */
export function NichePreviewSection({ values, data }: SectionProps) {
  const preview = data.preview ?? [];
  const listingCount = data.listingCount ?? 0;
  const cta = linkOf(values, 'cta');
  const label = data.page.label || 'Marketplace';

  return (
    <section className="border-b border-line bg-surface">
      <Container size="wide" className="py-14 lg:py-20">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-14">
          <div className="min-w-0">
            <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-[2rem] sm:leading-tight">
              {str(values, 'heading')}
            </h2>

            {/* Counted from the live marketplace. Hidden at zero rather than
                announcing an empty shelf to a stranger. */}
            {listingCount > 0 ? (
              <p className="mt-4 flex flex-wrap items-baseline gap-2">
                <span className="tabular text-3xl font-semibold tracking-tight text-ink">
                  {describeCount(listingCount)}
                </span>
                <span className="text-[15px] text-muted">{str(values, 'countSuffix')}</span>
              </p>
            ) : null}

            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted">
              {str(values, 'body')}
            </p>

            <p className="mt-5 flex items-start gap-2 text-[13px] leading-relaxed text-ink-soft">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
              {str(values, 'lockNote')}
            </p>

            <Button asChild variant="accent" size="lg" className="mt-6">
              <Link href={cta.href || '/marketplace'}>
                {cta.label}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>

          <div className="min-w-0">
            {/* The same redacted table the service pages use. It is handed
                rows that never carried a domain, slug or id. */}
            <RedactedPreview
              rows={preview}
              title={`${label} listings`}
              note="Website names and prices are shown to members"
              lockPrice
            />
          </div>
        </div>
      </Container>
    </section>
  );
}

// -------------------------------------------------------------- topic pills

/**
 * "What publishers cover": a row of shortcuts into the marketplace.
 *
 * Every one of these is a real marketplace query. A shortcut that filtered
 * nothing would be decoration pretending to be a feature, and a shortcut that
 * returns no rows teaches a visitor the marketplace is empty.
 */
export function TopicPillsSection({ values }: SectionProps) {
  const items = rows<{ label?: string; href?: string }>(values, 'items').filter(
    (item) => item.label && item.href,
  );
  if (items.length === 0) return null;

  return (
    <section className="border-b border-line bg-white">
      <Container size="wide" className="py-12 lg:py-16">
        <h2 className="text-2xl font-semibold tracking-tight text-ink">{str(values, 'heading')}</h2>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">
          {str(values, 'body')}
        </p>

        <ul data-reveal-items="" className="mt-6 flex flex-wrap gap-2.5">
          {items.map((item, index) => (
            <li key={item.label || index}>
              <Link
                href={item.href as string}
                className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-white px-3.5 py-2 text-[13px] font-medium text-ink-soft transition-colors hover:border-accent-500 hover:text-accent-700"
              >
                {item.label}
                <ArrowRight className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

// ------------------------------------------------------------ benefit cards

/**
 * The four "why us" cards.
 *
 * The icons are fixed in code and matched by position, exactly as they were
 * when the route passed them in as a prop. That is the same rule the icon
 * grid follows: an editor writes the claim, the design system draws the mark
 * beside it.
 */
const BENEFIT_ICONS = [BadgeCheck, Gauge, Coins, ShoppingBag];

const ARTWORK_WIDTH: Record<string, string> = {
  default: '',
  small: 'lg:max-w-[14rem]',
  medium: 'lg:max-w-[20rem]',
  large: 'lg:max-w-none',
};

export function BenefitCardsSection({ values, variant, style }: SectionProps) {
  const items = rows<{ title?: string; body?: string }>(values, 'items');
  if (items.length === 0) return null;

  const artwork = image(values, 'image');
  // Artwork beside the cards rather than above them, when the page has any.
  // Two columns of two, so the cards stay readable next to a picture.
  const withArt = variant === 'with-art' && Boolean(artwork.src);
  // Which side it sits on and how much room it takes. Both come from a fixed
  // set - there is no pixel here, and the grid stays the component's.
  const artFirst = style.artworkPosition === 'left';

  const cards = (
    <div
      data-reveal-items=""
      className={cn('grid gap-5 sm:grid-cols-2', !withArt && 'lg:grid-cols-4')}
    >
      {items.map((item, index) => {
        const Icon = BENEFIT_ICONS[index % BENEFIT_ICONS.length];
        return (
          <div
            key={item.title || index}
            className="rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)]"
          >
            {Icon ? (
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-50 text-[var(--section-accent,var(--color-accent-700))]">
                <Icon className="h-4.5 w-4.5" aria-hidden="true" />
              </span>
            ) : null}
            <h3 className="mt-4 text-[15px] font-semibold text-ink">{item.title}</h3>
            <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{item.body}</p>
          </div>
        );
      })}
    </div>
  );

  return (
    <section className="border-b border-line bg-surface">
      <Container size="wide" className="py-14 lg:py-20">
        <div className="max-w-2xl">
          {str(values, 'eyebrow') ? (
            <p className="text-[11px] font-semibold tracking-[0.14em] text-accent-700 uppercase">
              {str(values, 'eyebrow')}
            </p>
          ) : null}
          {/* The gap belongs to the eyebrow, not to the heading: without one
              the heading is the top of the section and a margin above it
              moves the whole band down by 16px. */}
          <h2
            className={cn(
              'text-2xl font-semibold tracking-tight text-ink sm:text-[2rem] sm:leading-tight',
              str(values, 'eyebrow') && 'mt-4',
            )}
          >
            {str(values, 'heading')}
          </h2>
          {str(values, 'body') ? (
            <p className="mt-3 text-[15px] leading-relaxed text-muted">{str(values, 'body')}</p>
          ) : null}
        </div>

        {withArt ? (
          <div
            className={cn(
              'mt-8 grid items-center gap-10 lg:gap-14',
              artFirst
                ? 'lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]'
                : 'lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]',
            )}
          >
            {/* Source order puts the cards first whichever side the picture
                is on: on a phone the grid is one column, and the argument
                should be read before the decoration. */}
            <div className={cn('min-w-0', artFirst ? 'lg:order-1' : 'lg:order-2')}>
              <NicheMascot
                src={artwork.src}
                alt={artwork.alt}
                className={cn(
                  ARTWORK_WIDTH[style.artworkSize] ?? '',
                  artFirst ? 'lg:mr-auto' : 'lg:ml-auto',
                )}
              />
            </div>
            <div className={cn('min-w-0', artFirst ? 'lg:order-2' : 'lg:order-1')}>{cards}</div>
          </div>
        ) : (
          <div className="mt-8">{cards}</div>
        )}
      </Container>
    </section>
  );
}

// ------------------------------------------------------------ journey steps

/**
 * "How it works", drawn from the shared journey config.
 *
 * The heading is editable and the steps are not, which is the whole point of
 * the component: this page cannot describe a process the rest of the site
 * contradicts. Changing the steps is changing how Press Parrot works, and
 * that belongs in `@/lib/config/how-it-works` where every page reads it.
 */
export function JourneyStepsSection({ values }: SectionProps) {
  return (
    <section className="border-b border-line bg-white">
      <Container size="wide" className="py-14 lg:py-20">
        <h2 className="text-2xl font-semibold tracking-tight text-ink">
          {str(values, 'heading') || 'How it works'}
        </h2>
        <ol data-reveal-items="" className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {journeySteps.map((step) => (
            <li key={step.number}>
              <span className="tabular text-[13px] font-semibold text-[var(--section-accent,var(--color-accent-700))]">
                {step.number}
              </span>
              <h3 className="mt-2 text-[15px] font-semibold text-ink">{step.title}</h3>
              <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{step.description}</p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}

// ------------------------------------------------------------- article body

/**
 * The editorial body, and the related links beside it.
 *
 * The sidebar is part of this section rather than a section of its own, and
 * that is a decision worth stating: it is a sticky column inside the body's
 * grid, so splitting it out would turn it into a full-width band and change
 * the page. The `full-width` variant is there for a page that wants the body
 * without a sidebar.
 */
export function ArticleBodySection({ values, variant }: SectionProps) {
  const sections = rows<{ heading?: string; content?: RichTextValue }>(values, 'sections');
  const related = rows<{ label?: string; href?: string; description?: string }>(values, 'related');
  const withSidebar = variant !== 'full-width' && related.length > 0;

  if (sections.length === 0 && !withSidebar) return null;

  return (
    <section className="border-b border-line bg-white">
      <Container size="wide" className="py-14 lg:py-20">
        <div
          className={cn(
            'grid gap-10',
            withSidebar && 'lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] lg:gap-16',
          )}
        >
          <div className="min-w-0 max-w-2xl space-y-12">
            {sections.map((bodySection, index) => (
              <article key={bodySection.heading || index}>
                <h2 className="text-[1.375rem] font-semibold tracking-tight text-ink sm:text-2xl">
                  {bodySection.heading}
                </h2>
                <div className="mt-4">
                  <RichText source={bodySection.content ?? ''} />
                </div>
              </article>
            ))}
          </div>

          {withSidebar ? (
            <aside className="lg:sticky lg:top-24 lg:self-start">
              <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
                <h2 className="text-[13px] font-semibold tracking-wide text-ink uppercase">
                  {str(values, 'relatedHeading') || 'Related'}
                </h2>
                <ul className="mt-4 space-y-3">
                  {related.map((item, index) => (
                    <li key={item.href || item.label || index}>
                      <Link href={item.href || '/'} className="group block">
                        <span className="block text-[14px] font-semibold text-ink group-hover:text-accent-700">
                          {item.label}
                        </span>
                        <span className="mt-0.5 block text-[13px] leading-snug text-muted">
                          {item.description}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </aside>
          ) : null}
        </div>
      </Container>
    </section>
  );
}

// ------------------------------------------------------------ content upsell

/** The small band pointing at content ordering, with the mascot beside it. */
export function ContentUpsellSection({ values, style }: SectionProps) {
  const heading = str(values, 'heading');
  if (!heading) return null;

  const cta = linkOf(values, 'cta');
  const mascot = image(values, 'mascot');
  // Left is where this band has always drawn it, so that is what `default`
  // means here rather than whichever value the list happens to start with.
  const artFirst = style.artworkPosition !== 'right';
  const mascotWidth =
    style.artworkSize === 'small' ? 'w-20' : style.artworkSize === 'large' ? 'w-36' : 'w-28';

  return (
    <section className="border-b border-line bg-surface">
      <Container size="wide" className="py-12 lg:py-16">
        <div className="rounded-[var(--radius-card)] border border-line bg-white p-6 shadow-[var(--shadow-card)] lg:p-8">
          <div
            className={cn(
              'grid items-center gap-6 sm:gap-8',
              artFirst
                ? 'sm:grid-cols-[7rem_minmax(0,1fr)_auto]'
                : 'sm:grid-cols-[minmax(0,1fr)_7rem_auto]',
            )}
          >
            {/* Decorative here: the same bird a screen reader already met in
                the hero, so it is announced once rather than twice. */}
            <NicheMascot
              src={mascot.src}
              alt=""
              className={cn('mx-auto sm:mx-0', mascotWidth, !artFirst && 'sm:order-2')}
            />
            <div className="min-w-0 text-center sm:text-left">
              <h2 className="text-[1.25rem] font-semibold tracking-tight text-ink">{heading}</h2>
              <p className="mt-2 text-[14px] leading-relaxed text-muted">{str(values, 'body')}</p>
            </div>
            <div className="text-center sm:text-right">
              <Button asChild variant="outline" size="lg">
                <Link href={cta.href || '/'}>
                  {cta.label}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

