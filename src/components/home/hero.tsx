import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { HandwrittenNote } from '@/components/shared/handwritten';
import { ParrotHero } from './parrot-hero';
import { RedactedPreview } from '@/components/marketplace/redacted-preview';
import { TrustMetrics } from './trust-metrics';
import type { ContentAccessors } from '@/lib/cms/resolve';
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
export function Hero({ content, preview }: { content: ContentAccessors; preview: PreviewRow[] }) {
  const primaryCta = content.link('hero', 'primaryCta');
  const secondaryCta = content.link('hero', 'secondaryCta');
  const reassurance = content.list<{ label: string }>('hero', 'reassurance');
  const annotation = content.text('hero', 'annotation');

  return (
    <section className="tropical-wash relative overflow-hidden border-b border-line bg-white">
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent-400/40 to-transparent"
      />

      <Container size="wide" className="relative py-10 lg:py-16">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.72fr)_minmax(0,0.92fr)] lg:gap-0">
          <div className="relative z-20 min-w-0 lg:pr-6">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-accent-700 uppercase">
              {content.text('hero', 'eyebrow')}
            </p>

            <h1 className="mt-4 text-[2.5rem] leading-[1.05] font-semibold tracking-tight text-ink sm:text-5xl lg:text-[3.25rem]">
              {content.text('hero', 'titleLine1')}
              <br className="hidden lg:block" /> {content.text('hero', 'titleLine2')}
              <br className="hidden lg:block" />{' '}
              <span className="text-accent-600">{content.text('hero', 'titleAccent')}</span>
            </h1>

            <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-muted">
              {content.text('hero', 'intro')}
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
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
              <ul className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
                {reassurance.map((item) => (
                  <li key={item.label} className="flex items-center gap-1.5 text-[13px] text-ink-soft">
                    <Check className="h-3.5 w-3.5 shrink-0 text-accent-600" aria-hidden="true" />
                    {item.label}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="relative z-10 min-w-0 lg:-mx-10 lg:mb-[-2.5rem]">
            {annotation ? (
              <HandwrittenNote
                arrow="down-right"
                className="absolute -top-2 -left-4 z-20 hidden rotate-[-8deg] lg:block"
              >
                {annotation.split('\n').map((line, index) => (
                  <span key={line || index} className="block">
                    {line}
                  </span>
                ))}
              </HandwrittenNote>
            ) : null}
            <ParrotHero />
          </div>

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
          <TrustMetrics content={content} />
        </div>
      </Container>
    </section>
  );
}
