import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from '@/lib/auth/admin-session';
import {
  CUSTOMER_SESSION_COOKIE,
  verifyCustomerSessionToken,
} from '@/lib/auth/customer-session';
import { supabaseAnonKey, supabaseUrl, isSupabaseEnabled } from '@/lib/supabase/config';
import { returnPathFor } from '@/lib/auth/return-to';

/**
 * Gates private areas before any page renders, and keeps the session fresh.
 *
 * Next.js 16 renamed the `middleware` convention to `proxy`; the behaviour is
 * unchanged. Two separate gates run here:
 *
 * - /admin      - the internal team area.
 * - marketplace - the publisher inventory, which is a benefit of holding an
 *                 account. All of it: `/marketplace` used to be let through
 *                 because it served a signed-out gateway, and the gateway's
 *                 job - being the public, indexable page that explains the
 *                 inventory - now belongs to /guest-posts and its niche pages,
 *                 which are built from masked data and have nothing to leak.
 *
 * This is the first of two checks in both cases. Pages and server actions
 * re-check with `requireAdminSession()` / `requireCustomerSession()`, because
 * actions have their own endpoints and are reachable without rendering a page.
 *
 * When Supabase is connected the proxy also refreshes the auth token. Server
 * components cannot write cookies, so without this a session would expire
 * mid-visit and the customer would be signed out for no apparent reason.
 */

/**
 * Keep crawlers off the inventory even while it is redirecting.
 *
 * A redirect is only seen by a crawler that follows it, and a page is only
 * seen as noindex by one that renders it. This header is read on the response
 * itself, so it applies to the 307 as well as to anything a signed-in request
 * renders - which is what makes it a backstop rather than a second copy of the
 * same check.
 */
const NO_INDEX = 'noindex, nofollow';

function gated(response: NextResponse): NextResponse {
  response.headers.set('X-Robots-Tag', NO_INDEX);
  return response;
}

/**
 * Is there a Supabase session on this request at all?
 *
 * Deliberately not "is this an admin". Answering that needs a profiles read,
 * and the proxy runs on every request - so it checks only that somebody is
 * signed in, and `requireAdminSession()` inside the page does the role check.
 * That is the same two-layer arrangement the rest of the app uses: a cheap
 * gate here, the real decision where the work happens.
 *
 * The consequence is that a signed-in customer reaches /admin and is then
 * bounced by the page. That is the correct order: the cheap check must not be
 * the one that grants access.
 */
async function hasSupabaseSession(request: NextRequest): Promise<boolean> {
  if (!isSupabaseEnabled()) return false;

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll() {
        // Read-only probe: the response this gate returns carries no refreshed
        // cookies, and the customer-facing branch below handles refreshing.
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  return Boolean(user);
}

async function gateAdmin(request: NextRequest, pathname: string) {
  // The sign-in page itself has to stay reachable.
  if (pathname === '/admin/login') return NextResponse.next();

  const session = await verifyAdminSessionToken(
    request.cookies.get(ADMIN_SESSION_COOKIE)?.value,
  );
  if (session) return NextResponse.next();

  // An admin signing in through Supabase Auth holds no admin cookie.
  if (await hasSupabaseSession(request)) return NextResponse.next();

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = '/admin/login';
  loginUrl.search = '';
  // Remember where they were headed, so sign-in returns them there.
  if (pathname !== '/admin') loginUrl.searchParams.set('next', pathname);
  return NextResponse.redirect(loginUrl);
}

/**
 * Signed out, so: sign up, and come back here afterwards.
 *
 * Inventory routes send people to signup rather than login, because somebody
 * who has arrived at a listing from a search result does not have an account
 * yet - offering them a login form first asks them to remember a password they
 * never set. The dashboard is the other way round: you only have a dashboard
 * if you already signed up.
 *
 * The return URL carries the query string. It did not, so somebody who asked
 * for `/websites?niche=technology` came back to an unfiltered marketplace and
 * the filter they came for was gone.
 *
 * `NextResponse.redirect` is a 307 by default and must stay one: a 301 is
 * cached by browsers and by Google more or less permanently, so the day this
 * inventory opens up again every previously-redirected visitor would still be
 * bounced to signup from their own cache.
 */
function signedOutRedirect(request: NextRequest, pathname: string) {
  const isInventory = isInventoryPath(pathname);
  const target = request.nextUrl.clone();
  target.pathname = isInventory ? '/signup' : '/login';
  target.search = '';
  target.searchParams.set('next', returnPathFor(pathname, request.nextUrl.search));
  return gated(NextResponse.redirect(target, 307));
}

/** The publisher inventory: the listings themselves, and the search over them. */
function isInventoryPath(pathname: string): boolean {
  return (
    pathname === '/marketplace' ||
    pathname.startsWith('/marketplace/') ||
    pathname === '/websites' ||
    pathname.startsWith('/websites/')
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAdminPath = pathname === '/admin' || pathname.startsWith('/admin/');

  if (isAdminPath) return gateAdmin(request, pathname);

  const inventory = isInventoryPath(pathname);

  if (!isSupabaseEnabled()) {
    const session = await verifyCustomerSessionToken(
      request.cookies.get(CUSTOMER_SESSION_COOKIE)?.value,
    );
    if (!session) return signedOutRedirect(request, pathname);
    return inventory ? gated(NextResponse.next()) : NextResponse.next();
  }

  // Supabase writes refreshed tokens onto this response, so it has to be the
  // one that is returned - building a different response later would drop the
  // new cookies and log the customer out on the next request.
  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Validates against the auth server rather than trusting the cookie, and
  // refreshes the token as a side effect. Must not be skipped or reordered.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return signedOutRedirect(request, pathname);

  // Signed in, so the page renders - and still carries the header, because an
  // inventory page is not for an index whoever is looking at it.
  return inventory ? gated(response) : response;
}

export const config = {
  matcher: ['/admin/:path*', '/marketplace/:path*', '/websites/:path*', '/dashboard/:path*'],
};
