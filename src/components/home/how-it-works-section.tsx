import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { journeySteps } from '@/lib/config/how-it-works';

export function HowItWorksSection({
  compact = false,
  showEyebrow = true,
}: {
  compact?: boolean;
  showEyebrow?: boolean;
}) {
  return (
    <section className="dot-grid relative overflow-hidden bg-navy-900 py-16 text-white lg:py-22">
      <div
        aria-hidden="true"
        className="absolute -top-32 -right-24 h-80 w-80 rounded-full bg-accent-500/10 blur-3xl"
      />
      <Container size="wide" className="relative">
        <div className="max-w-2xl">
          {showEyebrow ? (
            <p className="text-[11px] font-semibold tracking-[0.12em] text-accent-400 uppercase">
              How it works
            </p>
          ) : null}
          <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
            Built for marketers, by marketers
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-white/70">
            No back-and-forth emails, no invoice chasing and no guessing whether a site is real.
            Four steps from search to live link.
          </p>
        </div>

        <ol className="mt-12 grid gap-px overflow-hidden rounded-xl bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
          {journeySteps.map((step) => (
            <li key={step.number} className="bg-navy-900 p-6">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent-500/15 text-[13px] font-semibold text-accent-400">
                {step.number}
              </span>
              <h3 className="mt-4 text-[17px] font-semibold">{step.title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-white/70">{step.description}</p>
              {!compact ? (
                <p className="mt-3 text-[13px] leading-relaxed text-white/60">{step.detail}</p>
              ) : null}
            </li>
          ))}
        </ol>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Button asChild variant="accent" size="lg">
            <Link href="/signup">
              Create an account
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button
            asChild
            variant="ghost"
            size="lg"
            className="text-white/80 hover:bg-white/10 hover:text-white"
          >
            <Link href="/marketplace">Browse the marketplace</Link>
          </Button>
        </div>
      </Container>
    </section>
  );
}
