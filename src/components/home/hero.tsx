import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { HandwrittenNote } from '@/components/shared/handwritten';
import { ParrotHero } from './parrot-hero';
import { RedactedPreview } from '@/components/marketplace/redacted-preview';
import { TrustMetrics } from './trust-metrics';
import type { PreviewRow } from '@/lib/services/marketplace-preview';

/**
 * Homepage hero.
 *
 * Three layered columns on desktop: copy and calls to action on the left, the
 * mascot in the middle, the marketplace preview on the right. The mascot
 * column is given negative margins so the bird overlaps both neighbours rather
 * than sitting in its own box. Below 1024px the layout stacks in reading
 * order: headline, CTAs, parrot, preview.
 *
 * The preview rows are redacted server-side, so no publisher is identifiable
 * from the homepage or its payload.
 */
export function Hero({ preview }: { preview: PreviewRow[] }) {
  return (
    <section className="tropical-wash relative overflow-hidden border-b border-line bg-white">
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent-400/40 to-transparent"
      />

      <Container size="wide" className="relative py-10 lg:py-16">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.72fr)_minmax(0,0.92fr)] lg:gap-0">
          {/* copy + CTAs */}
          <div className="relative z-20 min-w-0 lg:pr-6">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-accent-700 uppercase">
              Smarter link building. Better SEO. No squawk.
            </p>

            <h1 className="mt-4 text-[2.5rem] leading-[1.05] font-semibold tracking-tight text-ink sm:text-5xl lg:text-[3.25rem]">
              Link Building
              <br className="hidden lg:block" /> Services Built for
              <br className="hidden lg:block" />{' '}
              <span className="text-accent-600">Better Rankings</span>
            </h1>

            <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-muted">
              Build high quality backlinks through thousands of vetted publishers. Search by SEO
              metrics, order content, manage placements and track everything from one platform.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Button asChild variant="accent" size="lg">
                <Link href="/signup">
                  Get Started Free
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/how-it-works">How It Works</Link>
              </Button>
            </div>

            <ul className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
              {['Free account', 'No subscription', 'Pay only for what you order'].map((item) => (
                <li key={item} className="flex items-center gap-1.5 text-[13px] text-ink-soft">
                  <Check className="h-3.5 w-3.5 shrink-0 text-accent-600" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* mascot, overlapping both columns on desktop */}
          <div className="relative z-10 min-w-0 lg:-mx-10 lg:mb-[-2.5rem]">
            <HandwrittenNote
              arrow="down-right"
              className="absolute -top-2 -left-4 z-20 hidden rotate-[-8deg] lg:block"
            >
              Good links
              <br />
              get you places.
            </HandwrittenNote>
            <ParrotHero />
          </div>

          {/* redacted marketplace preview */}
          <div className="relative z-20 min-w-0">
            <RedactedPreview
              rows={preview}
              cta={{
                label: 'Unlock the Marketplace',
                href: '/signup',
                caption: 'Free account to browse publishers and pricing.',
              }}
            />
          </div>
        </div>

        <div className="mt-10 lg:mt-12">
          <TrustMetrics />
        </div>
      </Container>
    </section>
  );
}
