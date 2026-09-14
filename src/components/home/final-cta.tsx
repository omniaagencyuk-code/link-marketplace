import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { MonsteraLeaf, PalmFrond } from '@/components/shared/foliage';

/** Closing call to action. Dark jungle green, foliage kept to one side. */
export function FinalCta() {
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
              Ready to find your next placement?
            </h2>
            <p className="mt-4 text-[16px] leading-relaxed text-white/70">
              Browse thousands of vetted websites and build better links without endless outreach.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" variant="accent">
                <Link href="/marketplace">
                  Browse Websites
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-white/25 bg-transparent text-white hover:border-white/50 hover:bg-white/10"
              >
                <Link href="/signup">Create an Account</Link>
              </Button>
            </div>
            <p className="font-handwritten mt-6 text-[19px] text-accent-300">
              No squawk. Just quality links.
            </p>
          </div>
        </div>
      </Container>
    </section>
  );
}
