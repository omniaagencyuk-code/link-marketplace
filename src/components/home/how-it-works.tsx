import { Container } from '@/components/layout/container';
import { Feather } from '@/components/shared/foliage';
import { journeySteps } from '@/lib/config/how-it-works';

/**
 * Four steps, joined by a dotted flight path.
 *
 * The path is one SVG behind the cards on desktop and disappears entirely on
 * smaller screens, where the steps stack.
 */
export function HowItWorks() {
  return (
    <section
      className="relative overflow-hidden border-b border-line bg-white py-16 lg:py-20"
      aria-labelledby="how-it-works-heading"
    >
      <Feather
        aria-hidden="true"
        className="pointer-events-none absolute top-10 right-6 hidden h-auto w-12 rotate-12 opacity-[0.14] lg:block"
      />

      <Container size="wide">
        <div className="max-w-2xl">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-accent-700 uppercase">
            How Press Parrot works
          </p>
          <h2
            id="how-it-works-heading"
            className="mt-4 text-3xl font-semibold tracking-tight text-ink sm:text-4xl"
          >
            From Search to Live Link
          </h2>
        </div>

        {/* flight path, sitting between the heading and the steps so it is
            actually visible rather than hidden behind the cards */}
        <svg
          aria-hidden="true"
          viewBox="0 0 1200 90"
          preserveAspectRatio="none"
          className="pointer-events-none mt-10 hidden h-16 w-full lg:block"
        >
          <path
            d="M40 62C220 8 350 82 600 40 850 -2 980 74 1160 26"
            fill="none"
            stroke="var(--color-accent-500)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray="1 14"
            opacity=".6"
          />
          <g fill="var(--color-accent-600)" opacity=".8">
            <path d="M1160 26c-14-6-26-4-36 6 14 5 26 3 36-6Z" />
            <path d="M1160 26c-10 11-12 23-6 36 10-10 13-22 6-36Z" opacity=".7" />
          </g>
        </svg>

        <div className="relative mt-8 lg:mt-4">
          <ol className="relative grid gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
            {journeySteps.map((step) => (
              <li
                key={step.number}
                className="rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)]"
              >
                <span className="tabular inline-flex h-9 items-center rounded-lg bg-navy-900 px-3 text-[13px] font-semibold text-accent-400">
                  {step.number}
                </span>
                <h3 className="mt-4 text-[17px] font-semibold text-ink">{step.title}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-muted">{step.description}</p>
              </li>
            ))}
          </ol>
        </div>
      </Container>
    </section>
  );
}
