import { BarChart3, ShieldCheck, Users, Zap } from 'lucide-react';
import { Container } from '@/components/layout/container';

const pillars = [
  {
    icon: ShieldCheck,
    title: 'Vetted Websites',
    description:
      'Every publisher is reviewed by hand for real traffic, editorial standards and clean link profiles.',
  },
  {
    icon: BarChart3,
    title: 'Transparent Metrics',
    description:
      'Domain rating, organic traffic, referring domains and audience geography on every listing.',
  },
  {
    icon: Zap,
    title: 'Fast and Easy',
    description:
      'Fixed prices, no negotiation and an average turnaround of 24 to 72 hours from approval.',
  },
  {
    icon: Users,
    title: 'Trusted by SEOs',
    description:
      'Used by agencies, in-house teams and affiliates to place thousands of links every month.',
  },
];

export function TrustStrip() {
  return (
    <section className="border-b border-line bg-surface" aria-label="Why buyers choose us">
      <Container size="wide">
        <ul className="grid gap-px overflow-hidden bg-line sm:grid-cols-2 lg:grid-cols-4">
          {pillars.map((pillar) => (
            <li key={pillar.title} className="bg-surface py-8 lg:px-6 lg:first:pl-0 lg:last:pr-0">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-white text-accent-600 shadow-[var(--shadow-card)]">
                <pillar.icon className="h-4.5 w-4.5" aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-[15px] font-semibold text-ink">{pillar.title}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{pillar.description}</p>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
