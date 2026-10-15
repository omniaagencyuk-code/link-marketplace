import { PreviewBanner } from '@/components/cms/preview-banner';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { siteMenus } from '@/lib/services/menu-service';

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

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  /*
    One read for the whole chrome, and the same read a page under here would
    get: `siteMenus` is request-cached, so the header and the footer below
    share it rather than asking twice. An empty table resolves to the arrays
    in `config/navigation.ts`, which is what makes this safe to add before
    anybody has edited a menu.

    Both header menus are fetched, not one. Which of them is drawn depends on
    whether there is an account, and that is decided in the browser - so the
    choice belongs to the header and the data has to reach it either way.
  */
  const menus = await siteMenus();

  return (
    <div className="flex min-h-dvh flex-col">
      {/*
        Above the header, because it is a statement about the whole page
        rather than part of it - and because the header is sticky, so a bar
        inside it would scroll away from the person who needs it.
      */}
      <PreviewBanner />
      <SiteHeader
        signedOut={menus['header-signed-out']}
        signedIn={menus['header-signed-in']}
      />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter menu={menus.footer} />
    </div>
  );
}
