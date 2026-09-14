import Link from 'next/link';
import { ArrowRight, Building2, FileSpreadsheet, Layers, PenLine, Receipt, Wallet } from 'lucide-react';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';

const points = [
  { icon: Layers, label: 'Multiple clients from one account' },
  { icon: Wallet, label: 'Consistent prices you can quote from' },
  { icon: FileSpreadsheet, label: 'Centralised orders and tracking' },
  { icon: Building2, label: 'One marketplace, not forty suppliers' },
  { icon: PenLine, label: 'Content production at campaign volume' },
  { icon: Receipt, label: 'A single invoice' },
];

export function AgenciesSection() {
  return (
    <section className="border-b border-line bg-white" aria-labelledby="agencies-heading">
      <Container size="wide" className="py-14 lg:py-20">
        <div className="rounded-[var(--radius-card)] border border-line bg-surface p-7 shadow-[var(--shadow-card)] lg:p-12">
          <div className="grid gap-9 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-14">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold tracking-[0.14em] text-accent-700 uppercase">
                For SEO agencies
              </p>
              <h2
                id="agencies-heading"
                className="mt-4 text-2xl font-semibold tracking-tight text-ink sm:text-[2rem] sm:leading-tight"
              >
                Built to Scale With SEO Agencies
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-muted">
                Running links for a dozen clients is a different problem from running links for
                one. One marketplace, one set of prices and one order queue across every account
                you manage.
              </p>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Button asChild variant="primary" size="lg">
                  <Link href="/signup">
                    Create Agency Account
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link href="/link-building-agencies">Read more</Link>
                </Button>
              </div>
            </div>

            <ul className="grid min-w-0 gap-3 sm:grid-cols-2">
              {points.map((point) => (
                <li
                  key={point.label}
                  className="flex items-start gap-3 rounded-lg border border-line bg-white p-4"
                >
                  <point.icon
                    className="mt-0.5 h-4 w-4 shrink-0 text-accent-600"
                    aria-hidden="true"
                  />
                  <span className="text-[13px] leading-snug text-ink-soft">{point.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Container>
    </section>
  );
}
