import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { PreviewBanner } from '@/components/cms/preview-banner';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { CustomerShell } from '@/components/dashboard/shell/customer-shell';
import { CustomerTopbar } from '@/components/dashboard/shell/customer-topbar';
import { getCurrentUser } from '@/lib/auth/customer-access';

/**
 * The marketplace segment: never indexed, never cached, and wearing whichever
 * chrome the visitor has earned.
 *
 * ## Why this route left the marketing group
 *
 * One URL, two audiences. Signed out, `/marketplace` is a public gateway that
 * explains the product and sells the signup, and it needs the site header and
 * footer. Signed in, it is the product, and it belongs in the same navy rail
 * as Orders and Saved Sites - which is where the customer navigation has
 * always pointed, and where a customer arriving from it was previously
 * dropped out of the shell and into the public site with no way back except
 * the browser's own button.
 *
 * A nested layout cannot escape its parent, so while this sat under
 * `(marketing)` the site header was above it whatever it rendered. Moving the
 * folder into its own group changes no URL - a route group is a folder that
 * does not appear in the path - and lets this file own the decision.
 *
 * `CustomerShell` is reused rather than restyled. The rail is navy because
 * that was the last instruction about it, and that decision belongs to the
 * shell and to every page wearing it, not to this redesign.
 *
 * ## The two exports below are what `verify:access` checks for
 *
 * `robots` applies here and to everything under it, so a route added below
 * cannot become indexable by forgetting its own metadata. `proxy.ts` sends
 * the same instruction as a header, which covers the redirect itself, where
 * no page renders and no metadata exists.
 *
 * `force-dynamic` because a cached render is a render made for whoever asked
 * first. What this page shows depends on the session; a copy served from the
 * edge to a signed-out request would hand out the inventory the gate exists
 * to protect, without the gate ever running.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function MarketplaceLayout({ children }: { children: ReactNode }) {
  /*
    Asked here and again in the page, and it costs one round trip rather than
    two: `getCurrentUser` is memoised per request. The alternative - having
    the page render its own chrome - puts the decision about what wraps a
    page inside the page, which is the thing layouts exist to avoid.
  */
  const user = await getCurrentUser();

  if (user) {
    /*
      Wider than the rest of the dashboard, because this page is a
      thirteen-column table and the others are not. Its columns add up to
      1,228px; the shell's usual 84rem cap meant a 1920 screen scrolled the
      table sideways with 274px of the window sitting empty beside it.
    */
    return (
      <CustomerShell topbar={<CustomerTopbar />} width="wide">
        {children}
      </CustomerShell>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Above the header, because it is a statement about the whole page
          rather than part of it - and because the header is sticky, so a bar
          inside it would scroll away from the person who needs it. */}
      <PreviewBanner />
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
