import { BarChart3, ShieldCheck, Zap } from 'lucide-react';
import { Container } from '@/components/layout/container';

const features = [
  {
    icon: ShieldCheck,
    title: 'Hand-vetted websites',
    description:
      'Every publisher is reviewed for real traffic, editorial standards and clean link profiles.',
  },
  {
    icon: BarChart3,
    title: 'Transparent metrics',
    description:
      'See domain rating, organic traffic, referring domains and audience geography on every listing.',
  },
  {
    icon: Zap,
    title: 'Fast and easy',
    description:
      'Fixed prices, no negotiation and an average turnaround of 24 to 72 hours from approval.',
  },
];

export function FeatureStrip() {
  return (
    <section className="border-b border-line bg-surface py-12 lg:py-16" aria-label="Why buyers choose us">
      <Container size="wide">
        <ul className="grid gap-8 lg:grid-cols-3 lg:gap-0">
          {features.map((feature, index) => (
            <li
              key={feature.title}
              className={
                index > 0 ? 'lg:border-l lg:border-line lg:pl-10 xl:pl-14' : 'lg:pr-10 xl:pr-14'
              }
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-600 text-white shadow-[var(--shadow-card)]">
                <feature.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-[17px] font-semibold text-ink">{feature.title}</h3>
              <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-muted">
                {feature.description}
              </p>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
