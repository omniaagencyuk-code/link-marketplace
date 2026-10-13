import { brand } from '@/lib/config/brand';
import { isSupabaseEnabled } from '@/lib/supabase/config';

/**
 * Whether this is the real site, and whether it is fit to be.
 *
 * ## The failure this exists for
 *
 * `isSupabaseEnabled()` is false whenever `NEXT_PUBLIC_DATA_SOURCE` is not
 * "supabase" or the keys are missing, and everything downstream then answers
 * from the mock store. That fallback is deliberate and right for a clone and
 * for a preview deploy: a misconfigured environment stays readable instead of
 * throwing on every page.
 *
 * On the live domain it is the worst failure in the application. The site
 * serves demo publishers at demo prices, and `signInAction` falls through to
 * the mock branch where any email signs in and creates an account. Nothing on
 * the page says any of it. A customer could not tell, and neither could we.
 *
 * So on the live domain it is caught: logged, shown, and - for sign-in, which
 * is the part that is a security hole rather than a cosmetic one - refused.
 *
 * ## What counts as the live domain
 *
 * `VERCEL_ENV` is "production" only for a production deployment; a preview
 * build has "preview", which is why `NODE_ENV` alone is no good - it reads
 * "production" for every preview and for `next start` on a laptop.
 *
 * Off Vercel the fallback is `NEXT_PUBLIC_SITE_URL` naming the brand's own
 * domain, read from the environment rather than from `siteUrl`. The derived
 * value falls back to the production domain whenever the variable is unset,
 * on purpose - a canonical tag pointing at localhost is worse than a guess -
 * and reading it here made a local `next start` announce itself as the live
 * site. Somebody has to have said this is production for this to think so.
 *
 * ## It is settled when the page is built, not when it is served
 *
 * This runs in a prerendered layout, so its answer is baked in at build
 * time. That is the right semantics rather than a limitation: everything it
 * reads except `VERCEL_ENV` is a `NEXT_PUBLIC_` variable, and those are
 * inlined at build by definition. Adding the Supabase keys without
 * redeploying would not switch the data source either.
 */
export function isLiveDeployment(): boolean {
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv) return vercelEnv === 'production';

  const declared = process.env.NEXT_PUBLIC_SITE_URL;
  if (!declared) return false;
  try {
    return new URL(declared).hostname.replace(/^www\./, '') === brand.domain;
  } catch {
    return false;
  }
}

/** The live site running on demo data: the one failure that is silent. */
export function isServingDemoDataLive(): boolean {
  return isLiveDeployment() && !isSupabaseEnabled();
}

/**
 * What to put in front of somebody, in the fewest words that let them fix it.
 *
 * Deliberately names the variables. "Configuration error" sends somebody to
 * ask; this sends them to the project's environment settings.
 */
export const DEMO_DATA_MESSAGE =
  'This deployment is serving demo data. Set NEXT_PUBLIC_DATA_SOURCE=supabase and the Supabase keys, then redeploy.';

/**
 * Said once per server start, so it is in the logs as well as on the page.
 *
 * A module-level side effect rather than a call from a route, because the
 * point is that nobody has to remember to ask. Guarded so that the dozens of
 * modules that import this do not each print it.
 */
let announced = false;

export function announceDemoDataOnce(): void {
  if (announced || !isServingDemoDataLive()) return;
  announced = true;
  console.error(`[deployment] ${DEMO_DATA_MESSAGE}`);
}
