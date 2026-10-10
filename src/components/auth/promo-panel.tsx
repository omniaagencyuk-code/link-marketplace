import fs from 'node:fs';
import path from 'node:path';
import Image from 'next/image';
import { ShieldCheck, Clock, Tags, Users, type LucideIcon } from 'lucide-react';
import { formatNumber } from '@/lib/utils/format';
import { artworkPath } from '@/lib/cms/artwork-library';
import { brand } from '@/lib/config/brand';
import type { MarketplaceStats } from '@/lib/services';

/**
 * The mint panel beside the login, signup and reset forms.
 *
 * One panel for all three pages. The forms differ - a heading, a field, a
 * link - and what the product is does not, so the right-hand half is written
 * once and the left-hand half is the page.
 *
 * ## Nothing here is a claim we cannot stand behind
 *
 * The panel this replaced carried a quote from "Marta Silva, Head of SEO at
 * Velocity Search", who does not exist. `src/lib/config/social-proof.ts` has
 * said all along that `testimonials` is empty *on purpose* and that nothing
 * should imply a quote we do not have - the auth pages were simply the place
 * nobody checked. So: no quote, no star rating, no customer count.
 *
 * The figures that are here are counted from the marketplace on the way to
 * rendering the page, which is the same arrangement the homepage's metric row
 * uses and for the same reason: a number typed into a component is true on
 * the day it is typed and silently wrong afterwards. If the count is
 * unavailable the card says something true without numbers rather than
 * falling back to a figure somebody once knew.
 */

interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
}

/** Drawn from what the product does, not from what would sound impressive. */
function features(stats: MarketplaceStats | null): Feature[] {
  return [
    {
      icon: ShieldCheck,
      title: 'Manually vetted websites',
      description:
        stats && stats.totalWebsites > 0
          ? `${formatNumber(stats.totalWebsites)} live listings, each reviewed before it goes on sale.`
          : 'Every listing is reviewed by a person before it goes on sale.',
    },
    {
      icon: Clock,
      title: 'Fast turnaround times',
      description: 'Manage your placements efficiently with clear order tracking.',
    },
    {
      icon: Tags,
      title: 'No negotiation or hidden fees',
      description: 'Fixed prices. Clear metrics. No surprises.',
    },
    {
      icon: Users,
      title: 'Trusted by SEO professionals',
      description: 'Built for agencies, in-house teams and website owners.',
    },
  ];
}

/**
 * The mascot, from the artwork catalogue rather than a path.
 *
 * `mascot-classic` resolves to the one transparent cut-out in the repository.
 * Pointing at the catalogue slug is what makes a better drawing a file swap
 * instead of an edit here - which is the whole reason the catalogue exists.
 */
const MASCOT = artworkPath('mascot-classic').replace(/\.png$/, '.webp');

/** Checked at render, so a missing file is a panel without a bird, never a broken image. */
const mascotExists = () => fs.existsSync(path.join(process.cwd(), 'public', MASCOT));

export function PromoPanel({ stats }: { stats: MarketplaceStats | null }) {
  const counted = stats
    ? [
        { value: stats.totalWebsites, label: 'Live listings' },
        { value: stats.totalNiches, label: 'Niches' },
        { value: stats.totalCountries, label: 'Countries' },
      ].filter((metric) => metric.value > 0)
    : [];

  return (
    <aside className="relative hidden overflow-hidden bg-accent-50 lg:flex lg:flex-col lg:justify-center">
      {/* Decoration only: a mint wash with the brand's blue and yellow in it. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_80%_0%,var(--color-accent-100)_0%,transparent_70%),radial-gradient(50%_40%_at_10%_100%,var(--color-sky-50)_0%,transparent_70%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-28 -right-28 h-72 w-72 rounded-full bg-sun-50/50 blur-3xl"
      />

      <div className="relative mx-auto flex max-h-full w-full max-w-xl flex-col gap-3.5 overflow-y-auto px-10 py-4 xl:gap-6 xl:px-14 xl:py-12">
        <header>
          <p className="text-[11px] font-semibold tracking-[0.14em] text-accent-700 uppercase">
            Quality links. Real websites. No hassle.
          </p>
          <h2 className="mt-3.5 text-[28px] leading-[1.12] font-semibold tracking-tight text-navy-900 xl:mt-4 xl:text-[38px]">
            Get better backlinks{' '}
            <span className="relative inline-block whitespace-nowrap">
              without the hard work
              {/* The green rule under the second line, as drawn. Decoration. */}
              <span
                aria-hidden="true"
                className="absolute -bottom-1 left-0 h-[7px] w-full rounded-full bg-accent-400/70"
              />
            </span>
          </h2>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-ink-soft xl:mt-5">
            Join SEOs, agencies and businesses using {brand.name} to find, order and track
            high-quality links from real websites.
          </p>
        </header>

        <Mascot />

        <ul className="grid gap-4 sm:grid-cols-2 xl:gap-5">
          {features(stats).map((feature) => (
            <li key={feature.title} className="flex gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-accent-700 shadow-[var(--shadow-card)]">
                <feature.icon className="h-4.5 w-4.5" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-[14px] font-semibold text-navy-900">
                  {feature.title}
                </span>
                <span className="mt-0.5 block text-[13px] leading-relaxed text-ink-soft">
                  {feature.description}
                </span>
              </span>
            </li>
          ))}
        </ul>

        <BenefitsCard counted={counted} />
      </div>
    </aside>
  );
}

/**
 * The mascot on its shadow.
 *
 * Two rules, because the dimension that runs out here is height, not width.
 * The panel is a full-height column with five things stacked in it, and a
 * 1280x720 laptop is 180px shorter than the desktop this was drawn at - so
 * the bird is the one thing in the stack that can go, and under 760px of
 * viewport it does. Shrinking it instead was tried first and does not work:
 * no bird small enough to save 90px is a bird worth showing, and the saving
 * lands on every tall screen too.
 *
 * Above that it is clamped rather than fixed, so it grows with the panel
 * instead of leaving a hole at the top of a 1440p display.
 */
function Mascot() {
  if (!mascotExists()) return null;
  return (
    <div
      className="relative hidden justify-center [@media(min-height:760px)]:flex"
      aria-hidden="true"
    >
      <span className="absolute bottom-1 h-5 w-[46%] rounded-[50%] bg-accent-300/50 blur-[6px]" />
      <Image
        src={MASCOT}
        alt=""
        width={1263}
        height={1246}
        preload
        sizes="(min-width: 1280px) 220px, 180px"
        className="relative h-[clamp(118px,17vh,200px)] w-auto"
      />
    </div>
  );
}

/**
 * What the testimonial card used to be, at the same size.
 *
 * Three counted figures, or - when the marketplace could not be counted -
 * three statements that are true without one.
 */
function BenefitsCard({ counted }: { counted: { value: number; label: string }[] }) {
  if (counted.length === 0) {
    return (
      <div className="rounded-[var(--radius-card)] border border-accent-200/70 bg-white/80 px-5 py-4 shadow-[var(--shadow-card)]">
        <p className="text-[13px] font-semibold text-navy-900">What you get on every order</p>
        <ul className="mt-2.5 grid gap-1.5 text-[13px] leading-relaxed text-ink-soft sm:grid-cols-3">
          <li>A fixed price, shown up front</li>
          <li>Live domain and traffic metrics</li>
          <li>No contract and no minimum</li>
        </ul>
      </div>
    );
  }

  return (
    <div className="rounded-[var(--radius-card)] border border-accent-200/70 bg-white/80 px-5 py-3.5 shadow-[var(--shadow-card)] xl:py-4">
      <p className="text-[11px] font-semibold tracking-[0.1em] text-accent-700 uppercase">
        Counted from the live marketplace
      </p>
      <dl className="mt-2.5 grid grid-cols-3 gap-4 xl:mt-3">
        {counted.map((metric) => (
          <div key={metric.label}>
            <dt className="sr-only">{metric.label}</dt>
            <dd>
              <span className="tabular block text-[20px] leading-tight font-semibold text-navy-900">
                {formatNumber(metric.value)}
              </span>
              <span className="block text-[12px] text-muted">{metric.label}</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
