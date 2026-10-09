import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';

/**
 * Ten minutes.
 *
 * These pages are prerendered now, which is the whole point - but a
 * prerendered page holds whatever its data said when it was built, and half
 * of them put live marketplace figures on screen: how many publishers there
 * are, how many in each niche, a sample of them. Without this, publishing
 * five hundred listings would leave the homepage quoting the old number
 * until somebody happened to deploy.
 *
 * Copy edits do not wait for it. Saving a page in /admin/pages calls
 * `revalidatePath`, so the new wording is live at once; this is the safety
 * net under the figures nobody explicitly revalidates.
 *
 * Ten minutes rather than one because the inventory moves in batches, a
 * stranger cannot tell a ten-minute-old count from a current one, and at
 * one minute most of the caching is given back. A literal, because the
 * value has to be statically analysable - `10 * 60` is not.
 *
 * The pages that genuinely need the request - the marketplace, the listing
 * pages, the blog - declare `force-dynamic` themselves and are unaffected.
 */
export const revalidate = 600;

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
