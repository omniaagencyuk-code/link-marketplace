import type { Metadata } from 'next';
import type { ReactNode } from 'react';

/**
 * The websites segment: never indexed, never cached.
 *
 * Both halves are deliberate and neither is sufficient alone.
 *
 * `robots` applies to this layout and everything under it, so a page added
 * below cannot be indexable by forgetting to say so - the mistake this is here
 * to make impossible is a new route under /websites shipping without its
 * own metadata. `proxy.ts` sends the same instruction as a header, which covers
 * the redirect itself, where no page renders and no metadata exists.
 *
 * `force-dynamic` because a cached render is a render made for whoever asked
 * first. These pages are account-only and their content depends on the
 * session; a statically cached copy served from the edge to a signed-out
 * request would hand out the inventory the gate exists to protect, and would
 * do it without the gate ever running.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default function WebsitesLayout({ children }: { children: ReactNode }) {
  return children;
}
