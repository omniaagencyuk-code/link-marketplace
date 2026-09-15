import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { MonsteraLeaf, PalmFrond } from '@/components/shared/foliage';
import { pageContentService } from '@/lib/services/page-content-service';

/**
 * Closing call to action. Dark jungle green, foliage kept to one side.
 *
 * Reads the homepage's content itself rather than taking it as a prop, because
 * the same band closes several pages - /pricing and /how-it-works among them -
 * and there is one piece of copy behind all of them.
 */
export async function FinalCta() {
  const content = await pageContentService.content('home');
  const primaryCta = content.link('finalCta', 'primaryCta');
  const secondaryCta = content.link('finalCta', 'secondaryCta');
  const annotation = content.text('finalCta', 'annotation');

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
              {content.text('finalCta', 'heading')}
            </h2>
            <p className="mt-4 text-[16px] leading-relaxed text-white/70">
              {content.text('finalCta', 'body')}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" variant="accent">
                <Link href={primaryCta.href}>
                  {primaryCta.label}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white"
              >
                <Link href={secondaryCta.href}>{secondaryCta.label}</Link>
              </Button>
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
