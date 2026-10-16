import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { CustomerShell } from '@/components/dashboard/shell/customer-shell';
import { CustomerTopbar } from '@/components/dashboard/shell/customer-topbar';

/**
 * The marketplace segment: never indexed, never cached, and inside the
 * customer rail.
 *
 * ## Why this route left the marketing group
 *
 * It no longer has two audiences. This read the session and drew the public
 * site header and footer around a signed-out visitor, which is a request
 * that cannot arrive: `/marketplace` is an inventory path in `proxy.ts` and
 * one without a session is 307'd to /signup before any of this runs. Signed
 * in, the marketplace is the product, and it belongs in the same rail as
 * Orders and Saved Sites - which is where the customer navigation points,
 * and where a customer arriving from it was previously dropped out of the
 * shell and into the public site with no way back but the browser's own
 * button.
 *
 * That is still the reason the folder is not under `(marketing)`: a nested
 * layout cannot escape its parent, so while it sat there the site header was
 * above it whatever it rendered. The group is a folder that does not appear
 * in the path, so no URL depends on this.
 *
 * `CustomerShell` is reused rather than restyled. The rail is navy because
 * that was the last instruction about it, and that decision belongs to the
 * shell and every page wearing it, not to this file.
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

/*
  No session read of its own.

  This asked `getCurrentUser()` to choose between two chromes, and then the
  page asked again to choose between two renders. There is one of each now,
  and the page requires the session rather than reading it - so a request
  that somehow reaches here without one is redirected by the page instead of
  being drawn a header for.
*/
export default function MarketplaceLayout({ children }: { children: ReactNode }) {
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
