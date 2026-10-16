import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { PlannerShowcase } from './planner-showcase';
import type { ShowcaseStepCopy } from '@/components/home/marketplace-showcase';
import type { ContentAccessors } from '@/lib/cms/resolve';

/**
 * The planner band: the words, and the animation beside them.
 *
 * A server component holding the copy and a client component holding the
 * movement, which is the arrangement every animated band on this site uses.
 * The heading, the body and the six captions are all editable, so the only
 * thing in here a developer owns is the sequence itself.
 *
 * It replaces the marketplace band on this page rather than sitting beside
 * it. That band lists the eight filters a buyer narrows publishers by and
 * ends in a button into the inventory - a good argument on a page selling
 * placements, and beside the point on a page about a planner for links bought
 * anywhere.
 */
export function PlannerBand({ content }: { content: ContentAccessors }) {
  const heading = content.text('preview', 'heading');
  const body = content.text('preview', 'body');
  const steps = content
    .list<ShowcaseStepCopy>('preview', 'steps')
    .filter((step) => step.label);

  if (!heading && steps.length === 0) return null;

  return (
    <section className="border-b border-line bg-surface">
      <Container size="wide" className="py-14 lg:py-20">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-[2rem] sm:leading-tight">
            {heading}
          </h2>
          {body ? <p className="mt-4 text-[15px] leading-relaxed text-muted">{body}</p> : null}
        </div>

        <div className="mt-10">
          <PlannerShowcase steps={steps} />
        </div>

        <Button asChild variant="accent" size="lg" className="mt-10">
          <Link href="/signup">
            Start Your Plan
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
        {/* The planner is free and the button should not have to be believed
            on that; this is the same sentence the hero's microcopy carries. */}
        <p className="mt-3 text-[13px] text-muted">
          Free account, no subscription. The planner itself is free.
        </p>
      </Container>
    </section>
  );
}
