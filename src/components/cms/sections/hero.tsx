import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Check } from 'lucide-react';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { formatNumber } from '@/lib/utils/format';
import { NicheBanner } from '@/components/marketing/niche-banner';
import { image, link, rows, str, type SectionProps } from './shared';

/**
 * The first screen.
 *
 * Structural: it arrives locked, so it cannot be dragged into the middle of a
 * page or deleted by accident. Everything about it is still editable - the
 * headline, the copy, the buttons, the reassurance line, the artwork.
 *
 * ## The H1 lives here and nowhere else
 *
 * This is the only section that renders an `h1`, and a page has one hero. Every
 * other component starts at `h2`, and the rich text editor will not produce an
 * `h1` at all, so a page cannot accidentally grow a second one.
 *
 * ## It must not be animated
 *
 * The headline and the artwork are almost always the Largest Contentful Paint,
 * and an element at `opacity: 0` counts as unpainted - animating this delays
 * the metric that measures it. `Reveal` already refuses to arm anything
 * on screen at load, so a hero would appear instantly whatever was chosen, but
 * the schema does not offer the setting either rather than showing a control
 * that silently does nothing.
 *
 * The image is `priority` for the same reason, and is the one image on a built
 * page that is: everything below the fold is lazy, and marking two images
 * priority makes them compete.
 *
 * ## A banner replaces the artwork column rather than joining it
 *
 * The same arrangement the niche hero already has, and for the same reason:
 * wide artwork drawn to sit behind the whole first screen and a picture in a
 * right-hand column are two answers to one question, and showing both puts
 * two parrots on one screen. From `lg` up only - a 3:1 scene on a phone is a
 * thin strip - so small screens keep the column artwork, which is what was
 * drawn for that shape.
 */
export function HeroSection({ values, variant, data }: SectionProps) {
  const heading = str(values, 'heading');
  if (!heading) return null;

  const artwork = image(values, 'image');
  const banner = image(values, 'banner');
  const hasBanner = Boolean(banner.src);
  const primary = link(values, 'primaryCta');
  const secondary = link(values, 'secondaryCta');
  const points = rows<{ label?: string }>(values, 'points');
  const showCount = variant === 'with-count' && (data.totals?.websites ?? 0) > 0;

  return (
    <section className="tropical-wash relative overflow-hidden border-b border-line bg-white">
      {hasBanner ? <NicheBanner src={banner.src} /> : null}
      <Container size="wide" className="relative py-14 lg:py-20">
        <div
          className={
            hasBanner
              ? 'grid items-center gap-10 lg:grid-cols-1'
              : 'grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,32rem)] lg:gap-14'
          }
        >
          <div className="min-w-0 max-w-2xl">
            {str(values, 'eyebrow') ? (
              <p className="text-[11px] font-semibold tracking-[0.14em] text-accent-700 uppercase">
                {str(values, 'eyebrow')}
              </p>
            ) : null}

            <h1 className="mt-4 text-[2.25rem] leading-[1.06] font-semibold tracking-tight text-ink sm:text-[3.25rem]">
              {heading}
            </h1>

            {str(values, 'body') ? (
              <p className="mt-5 text-[16px] leading-relaxed text-muted lg:text-[17px]">
                {str(values, 'body')}
              </p>
            ) : null}

            <div className="mt-7 flex flex-wrap items-center gap-3">
              {primary.label && primary.href ? (
                <Button asChild variant="accent" size="lg">
                  <Link href={primary.href}>
                    {primary.label}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
              ) : null}
              {secondary.label && secondary.href ? (
                <Button asChild variant="outline" size="lg">
                  <Link href={secondary.href}>{secondary.label}</Link>
                </Button>
              ) : null}
            </div>

            {points.length ? (
              <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2">
                {points.map((point, index) => (
                  <li
                    key={point.label || index}
                    className="flex items-center gap-1.5 text-[13px] text-muted"
                  >
                    <Check className="h-3.5 w-3.5 shrink-0 text-accent-600" aria-hidden="true" />
                    {point.label}
                  </li>
                ))}
              </ul>
            ) : null}

            {/* Counted, never typed. A hero claiming a number is the worst
                place on the site for that number to go stale. */}
            {showCount ? (
              <p className="tabular mt-6 text-[13px] text-muted">
                {formatNumber(data.totals!.websites)} websites listed right now
              </p>
            ) : null}

            {str(values, 'microcopy') ? (
              <p className="mt-4 text-[13px] text-muted">{str(values, 'microcopy')}</p>
            ) : null}
          </div>

          {/*
            Hidden from `lg` up when there is a banner, rather than dropped.

            The banner itself only renders from `lg`, so removing this would
            leave a phone with no artwork at all. `lg:hidden` is what keeps
            both true: the column below the breakpoint, the banner above it.
          */}
          {artwork.src ? (
            <div className={hasBanner ? 'min-w-0 lg:hidden' : 'min-w-0'}>
              <Image
                src={artwork.src}
                alt={artwork.alt}
                width={1200}
                height={900}
                priority
                sizes="(min-width: 1024px) 32rem, 100vw"
                className="h-auto w-full"
              />
            </div>
          ) : null}
        </div>
      </Container>
    </section>
  );
}

