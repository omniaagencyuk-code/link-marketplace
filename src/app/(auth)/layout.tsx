import Link from 'next/link';
import { BadgeCheck, FileX2, Lock, type LucideIcon } from 'lucide-react';
import { Logo } from '@/components/layout/logo';
import { PromoPanel } from '@/components/auth/promo-panel';
import { brand } from '@/lib/config/brand';
import { websiteService, type MarketplaceStats } from '@/lib/services';

/**
 * The frame every account page sits in: the form on the left, the product on
 * the right.
 *
 * The split is 44/56 rather than even. The form needs a readable column and
 * nothing more; the panel beside it holds a heading, an illustration, four
 * features and a card, and at 50/50 that stack is cramped while the form side
 * is mostly whitespace.
 *
 * Below `lg` the panel is gone rather than stacked. Stacking it puts four
 * feature rows and an illustration between a visitor and the password field
 * on the screen where they are most likely in a hurry; the three indicators
 * under the form carry what is worth carrying.
 */

interface Indicator {
  icon: LucideIcon;
  label: string;
}

/*
  Three statements, each one checkable.

  "Secure payments" is about the payment path - card details go to Stripe and
  never touch this application - and not a certification. We hold none, and
  the difference between the two sentences is the difference between a fact
  and a badge somebody would eventually ask to see.
*/
const indicators: Indicator[] = [
  { icon: BadgeCheck, label: 'Trusted by SEO professionals' },
  { icon: FileX2, label: 'No long-term contracts' },
  { icon: Lock, label: 'Secure payments' },
];

/**
 * The marketplace figures for the panel.
 *
 * Wrapped, because this is the login page. `getStats` is one counted read and
 * it is memoised for the request, but a database that is briefly unreachable
 * must cost a card full of numbers, never the ability to sign in - and a page
 * that throws on a read it only needed for decoration is exactly how the
 * homepage took production down in October.
 */
async function marketplaceStats(): Promise<MarketplaceStats | null> {
  try {
    return await websiteService.getStats();
  } catch {
    return null;
  }
}

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const stats = await marketplaceStats();

  return (
    <div className="grid min-h-dvh lg:grid-cols-[44fr_56fr]">
      <div className="flex flex-col bg-white px-5 py-7 sm:px-8 lg:px-12 xl:px-16">
        <div className="flex items-center justify-between">
          <Logo />
          <Link href="/" className="text-[13px] text-muted hover:text-ink">
            Back to site
          </Link>
        </div>

        <main id="main" className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </main>

        <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-line pt-5 text-[12px] text-muted">
          {indicators.map((indicator) => (
            <li key={indicator.label} className="flex items-center gap-1.5">
              <indicator.icon className="h-3.5 w-3.5 text-accent-600" aria-hidden="true" />
              {indicator.label}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-center text-[12px] text-muted-soft">
          &copy; {new Date().getFullYear()} {brand.company.legalName}
        </p>
      </div>

      <PromoPanel stats={stats} />
    </div>
  );
}
