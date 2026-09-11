import Link from 'next/link';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { brand } from '@/lib/config/brand';

export function CtaSection() {
  return (
    <section className="bg-white py-16 lg:py-20">
      <Container size="wide">
        <div className="flex flex-col items-start justify-between gap-6 rounded-xl border border-line bg-surface px-6 py-10 shadow-[var(--shadow-card)] lg:flex-row lg:items-center lg:px-10">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-[28px]">
              Start building links that actually move rankings
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">
              Create a free account to save websites, build a shortlist and place your first order.
              No subscription, no minimum spend. Talk to us at{' '}
              <a className="text-accent-700 hover:underline" href={`mailto:${brand.salesEmail}`}>
                {brand.salesEmail}
              </a>{' '}
              if you need volume pricing.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            <Button asChild size="lg" variant="primary">
              <Link href="/signup">Create an account</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/pricing">See pricing</Link>
            </Button>
          </div>
        </div>
      </Container>
    </section>
  );
}
