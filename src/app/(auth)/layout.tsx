import Link from 'next/link';
import { Check } from 'lucide-react';
import { Logo } from '@/components/layout/logo';
import { brand } from '@/lib/config/brand';

const highlights = [
  '5,000+ manually vetted websites across 20+ niches',
  'Live domain rating, traffic and referring domain data',
  'Fixed prices with no negotiation or hidden fees',
  'Average turnaround of 24 to 72 hours',
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col px-5 py-8 sm:px-8 lg:px-12">
        <div className="flex items-center justify-between">
          <Logo />
          <Link href="/" className="text-[13px] text-muted hover:text-ink">
            Back to site
          </Link>
        </div>
        <main id="main" className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </main>
        <p className="text-[12px] text-muted">
          &copy; {new Date().getFullYear()} {brand.company.legalName}
        </p>
      </div>

      <aside className="dot-grid relative hidden flex-col justify-center overflow-hidden bg-navy-900 px-12 text-white lg:flex">
        <div
          aria-hidden="true"
          className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-accent-500/10 blur-3xl"
        />
        <div className="relative max-w-md">
          <p className="text-[11px] font-semibold tracking-[0.12em] text-accent-400 uppercase">
            Quality links. Real websites. No hassle.
          </p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight">
            The link building marketplace for serious SEOs
          </h2>
          <ul className="mt-8 space-y-3.5">
            {highlights.map((highlight) => (
              <li key={highlight} className="flex gap-3 text-[14px] text-white/75">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent-400" aria-hidden="true" />
                {highlight}
              </li>
            ))}
          </ul>
          <blockquote className="mt-10 border-l-2 border-accent-500/60 pl-4 text-[14px] leading-relaxed text-white/70">
            &ldquo;We replaced three outreach contractors with LinkMarket. Same budget, roughly
            double the placements, and every site is one we would have approved anyway.&rdquo;
            <footer className="mt-2 text-[13px] text-white/50">
              Marta Silva, Head of SEO at Velocity Search
            </footer>
          </blockquote>
        </div>
      </aside>
    </div>
  );
}
