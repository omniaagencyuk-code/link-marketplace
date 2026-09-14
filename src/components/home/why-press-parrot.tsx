import Link from 'next/link';
import { ArrowRight, Check, X } from 'lucide-react';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { HandwrittenNote } from '@/components/shared/handwritten';

/**
 * The problem, then the alternative.
 *
 * A two-column comparison rather than a wall of prose: the left column is the
 * work a team does today, the right is what replaces it.
 */

const theOldWay = [
  'Finding websites that are actually relevant',
  'Checking whether the metrics are real',
  'Hunting down a contact who can publish',
  'Negotiating a price with no benchmark',
  'Chasing publishers who have gone quiet',
  'Writing content to someone else’s rules',
  'Following up, again',
  'Tracking which links went live where',
  'Reconciling invoices from a dozen suppliers',
];

const theNewWay = [
  'Every publisher vetted before it is listed',
  'Domain rating, traffic and referring domains on every listing',
  'No outreach - the publisher has already agreed',
  'One fixed price, shown before you order',
  'Order status you can actually see',
  'Content written to the publisher’s requirements',
  'Live URLs returned against each order',
  'One account, one invoice',
];

export function WhyPressParrot() {
  return (
    <section className="border-b border-line bg-surface" aria-labelledby="why-heading">
      <Container size="wide" className="py-14 lg:py-20">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
          <div className="min-w-0">
            <h2
              id="why-heading"
              className="text-2xl font-semibold tracking-tight text-ink sm:text-[2rem] sm:leading-tight"
            >
              Link Building Without the Endless Outreach
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-muted">
              Most of a link building budget is not spent on links. It is spent on coordination:
              finding sites, qualifying them, tracking down editors, agreeing prices and chasing
              people who never reply.
            </p>
            <p className="mt-4 text-[15px] leading-relaxed text-muted">
              We handle the publisher wrangling. You build the rankings.
            </p>

            <HandwrittenNote arrow="down-right" className="mt-7 hidden lg:block">
              We do the squawking.
            </HandwrittenNote>

            <Button asChild variant="accent" size="lg" className="mt-6 lg:mt-2">
              <Link href="/signup">
                Get Started Free
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>

          <div className="grid min-w-0 gap-5 sm:grid-cols-2">
            <div className="rounded-[var(--radius-card)] border border-line bg-white p-6">
              <h3 className="text-[13px] font-semibold tracking-wide text-muted uppercase">
                Doing it yourself
              </h3>
              <ul className="mt-4 space-y-2.5">
                {theOldWay.map((item) => (
                  <li key={item} className="flex gap-2.5 text-[13px] leading-relaxed text-muted">
                    <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-soft" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-[var(--radius-card)] border border-accent-500/30 bg-white p-6 shadow-[var(--shadow-card)]">
              <h3 className="text-[13px] font-semibold tracking-wide text-accent-700 uppercase">
                With Press Parrot
              </h3>
              <ul className="mt-4 space-y-2.5">
                {theNewWay.map((item) => (
                  <li key={item} className="flex gap-2.5 text-[13px] leading-relaxed text-ink-soft">
                    <Check
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-600"
                      aria-hidden="true"
                    />
                    {item}
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
