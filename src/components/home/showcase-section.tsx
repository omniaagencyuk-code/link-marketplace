import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { MarketplaceShowcase, type ShowcaseStepCopy } from './marketplace-showcase';
import type { ContentAccessors } from '@/lib/cms/resolve';

/**
 * The marketplace, showing itself, near the top of the homepage.
 *
 * A server component holding the words, with one client component inside it
 * holding the movement. The heading, the six captions and the caveat are all
 * CMS fields: they are the only copy on this section and an editor owns them,
 * the same as every other word on the page.
 *
 * The caption under the panel is not optional dressing. The publishers in the
 * animation are invented - `.example` domains, which RFC 2606 reserves so that
 * none of them can ever be a real site - and this is where a visitor is told
 * so in prose, next to the badge that says it on the panel itself.
 */
export function ShowcaseSection({ content }: { content: ContentAccessors }) {
  const steps = content
    .list<ShowcaseStepCopy>('showcase', 'steps')
    .filter((step) => step.label);
  const cta = content.link('showcase', 'cta');
  const heading = content.text('showcase', 'heading');

  return (
    <section className="border-b border-line bg-accent-50" aria-labelledby="showcase-heading">
      <Container size="wide" className="py-14 lg:py-20">
        <div className="max-w-2xl">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-accent-700 uppercase">
            {content.text('showcase', 'eyebrow')}
          </p>
          <h2
            id="showcase-heading"
            className="mt-4 text-2xl font-semibold tracking-tight text-ink sm:text-[2rem] sm:leading-tight"
          >
            {heading}
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-muted">
            {content.text('showcase', 'body')}
          </p>
        </div>

        <div className="mt-10">
          <MarketplaceShowcase steps={steps} />
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
          {cta.label && cta.href ? (
            <Button asChild variant="accent" size="lg">
              <Link href={cta.href}>
                {cta.label}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          ) : null}
          <p className="max-w-xl text-[13px] text-muted">
            {content.text('showcase', 'caption')}
          </p>
        </div>
      </Container>
    </section>
  );
}
