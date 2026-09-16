import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';

/**
 * The dark green "four steps" band.
 *
 * Takes its copy as props rather than reading a config module, so the page
 * that shows it decides what it says - /how-it-works reads the steps from the
 * CMS, and anything else can pass its own. The layout is fixed: four across on
 * a wide screen, which is what the numbered cards are designed for.
 */

export interface JourneyStepEntry {
  number: string;
  title: string;
  description: string;
  detail?: string;
}

export interface JourneyStepsProps {
  heading: string;
  intro: string;
  steps: JourneyStepEntry[];
  /** Hides the longer per-step copy, for pages with less room. */
  compact?: boolean;
  eyebrow?: string;
}

export function JourneySteps({
  heading,
  intro,
  steps,
  compact = false,
  eyebrow,
}: JourneyStepsProps) {
  if (!steps.length) return null;

  return (
    <section className="dot-grid relative overflow-hidden bg-navy-900 py-16 text-white lg:py-22">
      <div
        aria-hidden="true"
        className="absolute -top-32 -right-24 h-80 w-80 rounded-full bg-accent-500/10 blur-3xl"
      />
      <Container size="wide" className="relative">
        <div className="max-w-2xl">
          {eyebrow ? (
            <p className="text-[11px] font-semibold tracking-[0.12em] text-accent-400 uppercase">
              {eyebrow}
            </p>
          ) : null}
          <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">{heading}</h2>
          <p className="mt-4 text-[15px] leading-relaxed text-white/70">{intro}</p>
        </div>

        <ol className="mt-12 grid gap-px overflow-hidden rounded-xl bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => (
            <li key={step.title || index} className="bg-navy-900 p-6">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent-500/15 text-[13px] font-semibold text-accent-400">
                {step.number}
              </span>
              <h3 className="mt-4 text-[17px] font-semibold">{step.title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-white/70">{step.description}</p>
              {!compact && step.detail ? (
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
