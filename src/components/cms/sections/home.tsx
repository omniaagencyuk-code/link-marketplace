import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Building2,
  Check,
  ClipboardList,
  CreditCard,
  FileEdit,
  FileSpreadsheet,
  FolderKanban,
  Globe,
  Globe2,
  Layers,
  LineChart,
  Lock,
  Megaphone,
  Newspaper,
  PenLine,
  Receipt,
  ShieldCheck,
  Star,
  Timer,
  Wallet,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { RedactedPreview } from '@/components/marketplace/redacted-preview';
import { ParrotHero } from '@/components/home/parrot-hero';
import { HandwrittenNote } from '@/components/shared/handwritten';
import { Feather } from '@/components/shared/foliage';
import { RichText, type RichTextValue } from '@/lib/cms/rich-text-render';
import { linkTypeLabels } from '@/lib/utils/labels';
import { formatNumber, initialsFromName } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import { image, link as linkOf, rows, str, type SectionProps } from './shared';

/**
 * The bands the homepage is made of.
 *
 * Same discipline as the niche blocks: this is the existing homepage taken
 * apart, not redrawn. Each component holds the markup that band already had,
 * so the page's shape becomes data without its design becoming a negotiation.
 *
 * They are registered as ordinary components rather than as "homepage
 * sections", because the point of doing this is that the next paid landing
 * page is assembled rather than written. A marketplace demo, a trust row, a
 * set of service cards and an editorial column are useful anywhere.
 *
 * ## No component here holds a number
 *
 * Every figure - websites listed, niches, countries, the preview rows -
 * arrives in `data`, counted on the render that draws it. The homepage
 * claimed "5,000+ vetted websites" against a real number nearer nine hundred
 * until that rule existed, so a component can carry the words around a figure
 * and never the figure.
 */

// -------------------------------------------------------------------- hero

/**
 * The first screen: the argument on the left, the mascot on the right with
 * cards floating over it.
 *
 * Structural, so it arrives locked - it holds the page's only `h1`. It is not
 * animatable, because the headline and the artwork are the Largest
 * Contentful Paint and an element at `opacity: 0` counts as unpainted.
 *
 * The three cards carry counted facts rather than performance claims. The
 * design they come from had "+237% Higher Rankings"; those are the right
 * shape and the wrong content, because nobody here can substantiate somebody
 * else's SEO on the page a first-time visitor judges the business by. A card
 * whose figure is zero does not render, so the row is never padded with a
 * claim of nothing.
 */
const HERO_CARD_ICONS: LucideIcon[] = [LineChart, Layers, Globe];

export function HomeHeroSection({ values, data }: SectionProps) {
  const primaryCta = linkOf(values, 'primaryCta');
  const secondaryCta = linkOf(values, 'secondaryCta');
  const reassurance = rows<{ label?: string }>(values, 'reassurance');
  const artwork = image(values, 'image');
  const totals = data.totals;

  const cards = [
    { value: totals?.websites ?? 0, label: str(values, 'cardWebsites') },
    { value: totals?.niches ?? 0, label: str(values, 'cardNiches') },
    { value: totals?.countries ?? 0, label: str(values, 'cardCountries') },
  ]
    .map((card, index) => ({ ...card, icon: HERO_CARD_ICONS[index] as LucideIcon }))
    .filter((card) => card.value > 0 && card.label);

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
              {str(values, 'eyebrow')}
            </p>

            {/*
              Three lines by design, and three fields rather than one with
              markup in it: an editor writing a headline should not have to
              know where a line break is allowed. On a phone the breaks are
              dropped and the browser wraps it, because a fixed break at 375px
              leaves one word stranded.
            */}
            <h1 className="mt-5 text-[2.5rem] leading-[1.04] font-semibold tracking-tight text-ink sm:text-5xl lg:text-[3.5rem]">
              {str(values, 'titleLine1')}
              <br className="hidden sm:block" /> {str(values, 'titleLine2')}
              <br className="hidden sm:block" />{' '}
              <span className="text-accent-600">{str(values, 'titleAccent')}</span>
            </h1>

            <p className="mt-6 max-w-xl text-[16px] leading-relaxed text-muted lg:text-[17px]">
              {str(values, 'intro')}
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild variant="accent" size="lg">
                <Link href={primaryCta.href || '/signup'}>
                  {primaryCta.label}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href={secondaryCta.href || '/how-it-works'}>{secondaryCta.label}</Link>
              </Button>
            </div>

            {reassurance.length ? (
              <ul className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2">
                {reassurance.map((item, index) => (
                  <li
                    key={item.label || index}
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
            <ParrotHero annotation={str(values, 'annotation')} src={artwork.src} />

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

// ------------------------------------------------------------- trust stats

/**
 * The headline figures under the hero.
 *
 * The first three are counted from the marketplace on every render; only
 * their labels are editable. Anything the database cannot measure - average
 * turnaround, say - is still typed, and the editor says plainly that nothing
 * keeps a typed figure true.
 *
 * A counted figure of zero is left out rather than shown, so a marketplace
 * that has not loaded is a shorter row rather than a claim of nothing.
 */
const TRUST_ICONS: LucideIcon[] = [BadgeCheck, Layers, Globe2, Zap];

export function TrustStatsSection({ values, data }: SectionProps) {
  const totals = data.totals;
  const counted = [
    { value: totals?.websites ?? 0, label: str(values, 'websitesLabel') },
    { value: totals?.niches ?? 0, label: str(values, 'nichesLabel') },
    { value: totals?.countries ?? 0, label: str(values, 'countriesLabel') },
  ]
    .filter((metric) => metric.value > 0 && metric.label)
    .map((metric) => ({ value: formatNumber(metric.value), label: metric.label }));

  const typed = rows<{ value?: string; label?: string }>(values, 'items').map((item) => ({
    value: item.value ?? '',
    label: item.label ?? '',
  }));

  const metrics = [...counted, ...typed];
  if (metrics.length === 0) return null;

  return (
    <section className="border-b border-line bg-surface">
      <Container size="wide" className="py-10">
        <dl data-reveal-items="" className="grid grid-cols-2 gap-x-6 gap-y-6 lg:grid-cols-4">
          {metrics.map((metric, index) => {
            const Icon = TRUST_ICONS[index % TRUST_ICONS.length] as LucideIcon;
            return (
              /*
                This <div> holds a <dt> and a <dd> and nothing else. The icon
                lives inside the <dd>, where it is decoration beside the value
                rather than a third child of a description group, which is not
                something a description list may have.
              */
              <div key={metric.label || index}>
                <dt className="sr-only">{metric.label}</dt>
                <dd className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-700 text-white">
                    <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="tabular block text-[17px] leading-tight font-semibold text-ink">
                      {metric.value}
                    </span>
                    <span className="block text-[13px] text-muted">{metric.label}</span>
                  </span>
                </dd>
              </div>
            );
          })}
        </dl>
      </Container>
    </section>
  );
}

// ------------------------------------------------------------- testimonials

/**
 * What customers say, when there are customers who have said it.
 *
 * Renders nothing with no quotes, and that absence is the feature. A
 * placeholder testimonial on the homepage of a live business says the product
 * has no customers *and* looks unfinished, and an invented one is a lie on
 * the page a stranger judges the business by. The section ships empty and
 * hidden, and becomes visible when somebody types a real, attributable quote
 * into it.
 *
 * The rating is drawn only when a quote carries one, for the same reason.
 */
export function TestimonialsSection({ values }: SectionProps) {
  const items = rows<{
    quote?: string;
    name?: string;
    role?: string;
    company?: string;
    avatar?: unknown;
    rating?: string;
  }>(values, 'items').filter((item) => item.quote && item.name);

  if (items.length === 0) return null;

  return (
    <section className="border-b border-line bg-surface">
      <Container size="wide" className="py-14 lg:py-20">
        <div className="mx-auto max-w-2xl text-center">
          {str(values, 'eyebrow') ? (
            <p className="text-[11px] font-semibold tracking-[0.14em] text-accent-700 uppercase">
              {str(values, 'eyebrow')}
            </p>
          ) : null}
          <h2 className="mt-4 text-2xl font-semibold tracking-tight text-ink sm:text-[2rem] sm:leading-tight">
            {str(values, 'heading')}
          </h2>
          {str(values, 'body') ? (
            <p className="mt-3 text-[15px] leading-relaxed text-muted">{str(values, 'body')}</p>
          ) : null}
        </div>

        <ul data-reveal-items="" className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, index) => {
            const stars = Number.parseInt(item.rating ?? '', 10);
            const photo =
              typeof item.avatar === 'object' && item.avatar !== null
                ? ((item.avatar as { src?: string }).src ?? '')
                : '';
            return (
              <li
                key={item.name || index}
                className="flex h-full flex-col rounded-[var(--radius-card)] border border-line bg-white p-6 shadow-[var(--shadow-card)]"
              >
                {stars >= 1 && stars <= 5 ? (
                  <span className="flex gap-0.5" aria-label={`${stars} out of 5`}>
                    {Array.from({ length: stars }).map((_, star) => (
                      <Star
                        key={star}
                        className="h-4 w-4 fill-amber-400 text-amber-400"
                        aria-hidden="true"
                      />
                    ))}
                  </span>
                ) : null}
                <blockquote className="mt-4 flex-1 text-[14px] leading-relaxed text-ink-soft">
                  {item.quote}
                </blockquote>
                <div className="mt-5 flex items-center gap-3">
                  {photo ? (
                    // Decorative: the name is beside it in text, so a screen
                    // reader announcing the face as well says it twice.
                    <Image
                      src={photo}
                      alt=""
                      width={32}
                      height={32}
                      className="h-8 w-8 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <Avatar initials={initialsFromName(item.name ?? '')} />
                  )}
                  <span className="min-w-0">
                    <span className="block text-[14px] font-semibold text-ink">{item.name}</span>
                    <span className="block text-[13px] text-muted">
                      {[item.role, item.company].filter(Boolean).join(', ')}
                    </span>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </Container>
    </section>
  );
}

// -------------------------------------------------------- marketplace demo

/**
 * The filters the marketplace actually offers.
 *
 * Fixed in code rather than typed, because this is a statement about what the
 * product does: a list somebody edits is a list that promises a filter the
 * marketplace does not have.
 */
const MARKETPLACE_FILTERS = [
  'DR',
  'Organic Traffic',
  'Referring Domains',
  'Country',
  'Niche',
  'Price',
  'Turnaround',
];

/**
 * Showing the marketplace without giving it away.
 *
 * The rows arrive already redacted from the service layer - banded metrics
 * and masked domains, never a real domain, price, slug or id - so nothing
 * identifying exists in the HTML, in the RSC payload or in the structured
 * data. That is a property of the data rather than of this file remembering
 * to leave it out.
 *
 * Two layouts. `metrics` puts the argument beside the table: what can be
 * filtered, what can be bought, and the counted totals. `unlock` puts the
 * table first and the reason to register beside it, which is the version that
 * converts paid traffic - a visitor sees what they get before being asked for
 * an email address.
 */
export function MarketplaceDemoSection({ values, variant, data }: SectionProps) {
  const preview = data.preview ?? [];
  if (preview.length === 0) return null;

  const cta = linkOf(values, 'cta');
  const totals = data.totals;
  const benefits = rows<{ text?: string }>(values, 'benefits').filter((item) => item.text);
  const secondary = linkOf(values, 'secondaryCta');

  const heading = (
    <>
      {str(values, 'eyebrow') ? (
        <p className="text-[11px] font-semibold tracking-[0.14em] text-accent-700 uppercase">
          {str(values, 'eyebrow')}
        </p>
      ) : null}
      <h2 className="mt-4 text-2xl font-semibold tracking-tight text-ink sm:text-[2rem] sm:leading-tight">
        {str(values, 'heading')}
      </h2>
      <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted">
        {str(values, 'body')}
      </p>
    </>
  );

  if (variant === 'unlock') {
    return (
      <section className="border-b border-line bg-surface">
        <Container size="wide" className="py-14 lg:py-20">
          <div className="mx-auto max-w-2xl text-center">
            {str(values, 'eyebrow') ? (
              <p className="text-[11px] font-semibold tracking-[0.14em] text-accent-700 uppercase">
                {str(values, 'eyebrow')}
              </p>
            ) : null}
            <h2 className="mt-4 text-2xl font-semibold tracking-tight text-ink sm:text-[2rem] sm:leading-tight">
              {str(values, 'heading')}
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">{str(values, 'body')}</p>
          </div>

          <div className="mt-10 grid items-start gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-8">
            <div className="min-w-0">
              <RedactedPreview rows={preview} />
            </div>

            {/* The reason to register, beside the thing being withheld. */}
            <div className="min-w-0 rounded-[var(--radius-card)] border border-accent-500/30 bg-accent-50/60 p-6 shadow-[var(--shadow-card)]">
              <h3 className="flex items-start gap-2.5 text-[16px] leading-snug font-semibold text-ink">
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent-700 text-white"
                >
                  <Lock className="h-3.5 w-3.5" />
                </span>
                {str(values, 'unlockHeading') || 'Create a free account to unlock the marketplace'}
              </h3>

              {benefits.length ? (
                <ul className="mt-5 space-y-2.5">
                  {benefits.map((item, index) => (
                    <li
                      key={item.text || index}
                      className="flex items-start gap-2.5 text-[14px] leading-relaxed text-ink-soft"
                    >
                      <Check
                        className="mt-0.5 h-4 w-4 shrink-0 text-accent-600"
                        aria-hidden="true"
                      />
                      {item.text}
                    </li>
                  ))}
                </ul>
              ) : null}

              <Button asChild variant="accent" size="lg" className="mt-6 w-full">
                <Link href={cta.href || '/signup'}>
                  {cta.label}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>

              {secondary.label && secondary.href ? (
                <Link
                  href={secondary.href}
                  className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-accent-700 hover:underline"
                >
                  {secondary.label}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              ) : null}
            </div>
          </div>
        </Container>
      </section>
    );
  }

  return (
    <section className="border-b border-line bg-surface">
      <Container size="wide" className="py-14 lg:py-20">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-14">
          <div className="min-w-0">
            {heading}

            {totals && totals.websites > 0 ? (
              <dl className="mt-8 grid max-w-md grid-cols-3 gap-4 border-y border-line py-5">
                {[
                  { value: `${formatNumber(totals.websites)}+`, label: 'vetted websites' },
                  { value: `${totals.niches}+`, label: 'niches' },
                  { value: `${totals.countries}+`, label: 'countries' },
                ].map((stat) => (
                  <div key={stat.label}>
                    <dt className="sr-only">{stat.label}</dt>
                    <dd>
                      <span className="block text-xl font-semibold tracking-tight text-ink">
                        {stat.value}
                      </span>
                      <span className="mt-0.5 block text-[12px] text-muted">{stat.label}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}

            <div className="mt-7">
              <p className="text-[12px] font-semibold tracking-wide text-muted uppercase">
                Filter by
              </p>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {MARKETPLACE_FILTERS.map((filter) => (
                  <li key={filter} className="flex items-center gap-2 text-[14px] text-ink-soft">
                    <Check className="h-4 w-4 shrink-0 text-accent-600" aria-hidden="true" />
                    {filter}
                  </li>
                ))}
              </ul>
            </div>

            <ul className="mt-6 flex flex-wrap gap-2">
              {(['guest-post', 'niche-edit', 'digital-pr'] as const).map((type) => (
                <li
                  key={type}
                  className="rounded-md border border-line-strong bg-white px-2.5 py-1.5 text-[12px] font-medium text-ink-soft"
                >
                  {linkTypeLabels[type]}
                </li>
              ))}
            </ul>

            <div className="mt-8">
              <Button asChild variant="accent" size="lg">
                <Link href={cta.href || '/marketplace'}>
                  {cta.label}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
              <p className="mt-3 text-[13px] text-muted">{str(values, 'ctaCaption')}</p>
            </div>
          </div>

          <div className="min-w-0">
            <RedactedPreview rows={preview} />
          </div>
        </div>
      </Container>
    </section>
  );
}

// ---------------------------------------------------------- old way vs new

/**
 * Doing it yourself, beside doing it here.
 *
 * Two lists rather than a table: the sides are opposites, not the same rows
 * with different values in them.
 */
export function OldVsNewSection({ values }: SectionProps) {
  const oldWay = rows<{ label?: string }>(values, 'oldWay');
  const newWay = rows<{ label?: string }>(values, 'newWay');
  if (oldWay.length === 0 && newWay.length === 0) return null;

  const cta = linkOf(values, 'cta');
  const annotation = str(values, 'annotation');
  const body = values.body as RichTextValue | undefined;

  return (
    <section className="border-b border-line bg-surface">
      <Container size="wide" className="py-14 lg:py-20">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
          <div className="min-w-0">
            <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-[2rem] sm:leading-tight">
              {str(values, 'heading')}
            </h2>
            {body ? (
              <div className="mt-4">
                <RichText source={body} />
              </div>
            ) : null}

            {annotation ? (
              <HandwrittenNote arrow="down-right" className="mt-7 hidden lg:block">
                {annotation}
              </HandwrittenNote>
            ) : null}

            {cta.label && cta.href ? (
              <Button asChild variant="accent" size="lg" className="mt-6 lg:mt-2">
                <Link href={cta.href}>
                  {cta.label}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            ) : null}
          </div>

          <div className="grid min-w-0 gap-5 sm:grid-cols-2">
            <div className="rounded-[var(--radius-card)] border border-line bg-white p-6">
              <h3 className="text-[13px] font-semibold tracking-wide text-muted uppercase">
                {str(values, 'oldHeading')}
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
                {str(values, 'newHeading')}
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

// ------------------------------------------------------------ service cards

/**
 * The things Press Parrot sells, each linking to the page that explains it.
 *
 * Icons and accent colours are fixed and matched by position: four cards in a
 * row only read well when they are visually consistent, and an editor picking
 * colours is how a consistent page becomes a jumble.
 */
const SERVICE_ICONS: LucideIcon[] = [Newspaper, FileEdit, PenLine, Megaphone];
const SERVICE_ACCENTS = [
  'bg-accent-50 text-accent-700',
  'bg-blue-50 text-blue-700',
  'bg-amber-50 text-amber-700',
  'bg-coral-50 text-coral-700',
];

export function ServiceCardsSection({ values }: SectionProps) {
  const services = rows<{ title?: string; body?: string; cta?: unknown }>(values, 'items');
  if (services.length === 0) return null;

  return (
    <section className="border-b border-line bg-white">
      <Container size="wide" className="py-14 lg:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-[2rem] sm:leading-tight">
            {str(values, 'heading')}
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">{str(values, 'intro')}</p>
        </div>

        <ul data-reveal-items="" className="mt-11 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {services.map((service, index) => {
            const Icon = SERVICE_ICONS[index % SERVICE_ICONS.length] as LucideIcon;
            const cta = (service.cta ?? {}) as { label?: string; href?: string };
            return (
              <li
                key={service.title || index}
                className="flex flex-col rounded-[var(--radius-card)] border border-line bg-white p-6 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-pop)]"
              >
                <span
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-xl',
                    SERVICE_ACCENTS[index % SERVICE_ACCENTS.length],
                  )}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-[17px] font-semibold text-ink">{service.title}</h3>
                <p className="mt-2 flex-1 text-[14px] leading-relaxed text-muted">{service.body}</p>
                <Link
                  href={cta.href || '/'}
                  className="mt-5 inline-flex items-center gap-1.5 self-start rounded-lg border border-line-strong bg-white px-3.5 py-2 text-[13px] font-medium text-ink transition-colors hover:border-accent-500 hover:text-accent-700"
                >
                  {cta.label || 'Learn more'}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      </Container>
    </section>
  );
}

// ------------------------------------------------------------- feature list

/**
 * What the platform does.
 *
 * Anything not yet built carries a "Coming soon" badge rather than being
 * quietly listed as though it exists. An editor sets that per feature, and
 * the honest default is to keep it until the thing ships.
 */
const FEATURE_ICONS: LucideIcon[] = [
  ShieldCheck,
  BarChart3,
  Receipt,
  Timer,
  ClipboardList,
  PenLine,
  CreditCard,
  FolderKanban,
];

export function FeatureListSection({ values }: SectionProps) {
  const features = rows<{ title?: string; body?: string; comingSoon?: string }>(values, 'items');
  if (features.length === 0) return null;

  return (
    <section className="border-b border-line bg-white">
      <Container size="wide" className="py-14 lg:py-20">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-[2rem] sm:leading-tight">
            {str(values, 'heading')}
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">{str(values, 'intro')}</p>
        </div>

        <ul data-reveal-items="" className="mt-11 grid gap-x-8 gap-y-9 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature, index) => {
            const Icon = FEATURE_ICONS[index % FEATURE_ICONS.length] as LucideIcon;
            const comingSoon = (feature.comingSoon ?? '').trim().toLowerCase() === 'yes';
            return (
              <li key={feature.title || index}>
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-sunken text-ink-soft">
                  <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                </span>
                <h3 className="mt-4 flex flex-wrap items-center gap-2 text-[15px] font-semibold text-ink">
                  {feature.title}
                  {comingSoon ? (
                    <Badge tone="outline" size="sm">
                      Coming soon
                    </Badge>
                  ) : null}
                </h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{feature.body}</p>
              </li>
            );
          })}
        </ul>
      </Container>
    </section>
  );
}

// ------------------------------------------------------------- agency panel

const AGENCY_ICONS: LucideIcon[] = [Layers, Wallet, FileSpreadsheet, Building2, PenLine, Receipt];

/** A panel aimed at one audience: copy and buttons beside a grid of points. */
export function AgencyPanelSection({ values }: SectionProps) {
  const points = rows<{ label?: string }>(values, 'items');
  const primaryCta = linkOf(values, 'primaryCta');
  const secondaryCta = linkOf(values, 'secondaryCta');

  return (
    <section className="border-b border-line bg-white">
      <Container size="wide" className="py-14 lg:py-20">
        <div className="rounded-[var(--radius-card)] border border-line bg-surface p-7 shadow-[var(--shadow-card)] lg:p-12">
          <div className="grid gap-9 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-14">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold tracking-[0.14em] text-accent-700 uppercase">
                {str(values, 'eyebrow')}
              </p>
              <h2 className="mt-4 text-2xl font-semibold tracking-tight text-ink sm:text-[2rem] sm:leading-tight">
                {str(values, 'heading')}
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-muted">{str(values, 'body')}</p>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Button asChild variant="primary" size="lg">
                  <Link href={primaryCta.href || '/'}>
                    {primaryCta.label}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link href={secondaryCta.href || '/'}>{secondaryCta.label}</Link>
                </Button>
              </div>
            </div>

            <ul data-reveal-items="" className="grid min-w-0 gap-3 sm:grid-cols-2">
              {points.map((point, index) => {
                const Icon = AGENCY_ICONS[index % AGENCY_ICONS.length] as LucideIcon;
                return (
                  <li
                    key={point.label || index}
                    className="flex items-start gap-3 rounded-lg border border-line bg-white p-4"
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-accent-600" aria-hidden="true" />
                    <span className="text-[13px] leading-snug text-ink-soft">{point.label}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </Container>
    </section>
  );
}

// ---------------------------------------------------------------- editorial

/**
 * Long-form copy with its own contents.
 *
 * The substantial public writing a search engine reads most closely, and the
 * shape that stops it being a wall: a sticky list of what is in it beside the
 * articles themselves, each with an anchor somebody can link to.
 *
 * Not animatable. Animating a column of paragraphs as somebody scrolls into
 * it is the thing that makes a site feel like a template, and long-form copy
 * is what the reader came for.
 */
export function EditorialSection({ values }: SectionProps) {
  const articles = rows<{ id?: string; heading?: string; content?: RichTextValue }>(
    values,
    'articles',
  );
  if (articles.length === 0) return null;

  const contents = articles.filter((article) => article.id && article.heading);

  return (
    <section className="border-b border-line bg-white">
      <Container size="wide" className="py-14 lg:py-20">
        <div className="max-w-2xl">
          {str(values, 'eyebrow') ? (
            <p className="text-[11px] font-semibold tracking-[0.14em] text-accent-700 uppercase">
              {str(values, 'eyebrow')}
            </p>
          ) : null}
          <h2 className="mt-4 text-2xl font-semibold tracking-tight text-ink sm:text-[2rem] sm:leading-tight">
            {str(values, 'heading')}
          </h2>
        </div>

        <div className="mt-11 grid gap-10 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] lg:gap-16">
          {contents.length > 1 ? (
            <nav aria-label="On this page" className="lg:sticky lg:top-24 lg:self-start">
              <h3 className="text-[12px] font-semibold tracking-wide text-muted uppercase">
                On this page
              </h3>
              <ol className="mt-4 space-y-2.5 border-l border-line pl-4">
                {contents.map((article, index) => (
                  <li key={article.id || index}>
                    <a
                      href={`#${article.id}`}
                      className="text-[13px] leading-snug text-muted transition-colors hover:text-accent-700"
                    >
                      {article.heading}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          ) : null}

          <div className="min-w-0 max-w-2xl space-y-11">
            {articles.map((article, index) => (
              <article key={article.id || index} id={article.id} className="scroll-mt-24">
                <h3 className="text-[1.375rem] font-semibold tracking-tight text-ink sm:text-2xl">
                  {article.heading}
                </h3>
                <div className="mt-4">
                  <RichText source={article.content ?? ''} />
                </div>
              </article>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}

// ------------------------------------------------------------- metric cards

/** Cards explaining what a metric measures, each linking to where it is explained. */
export function MetricCardsSection({ values }: SectionProps) {
  const items = rows<{ title?: string; body?: string; href?: string }>(values, 'items');
  if (items.length === 0) return null;

  const cta = linkOf(values, 'cta');

  return (
    <section className="border-b border-line bg-white">
      <Container size="wide" className="py-14 lg:py-16">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-[1.875rem] sm:leading-tight">
            {str(values, 'heading')}
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-muted">{str(values, 'body')}</p>
        </div>

        <ul data-reveal-items="" className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, index) => (
            <li key={item.title || index}>
              <Link
                href={item.href || '/link-building-metrics'}
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

/** Kept so the tree-shaker cannot drop the decorative import the steps use. */
export { Feather };
