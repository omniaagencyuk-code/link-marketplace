import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from '@/lib/auth/admin-session';
import {
  CUSTOMER_SESSION_COOKIE,
  verifyCustomerSessionToken,
} from '@/lib/auth/customer-session';
import { supabaseAnonKey, supabaseUrl, isSupabaseEnabled } from '@/lib/supabase/config';

/**
 * Gates private areas before any page renders, and keeps the session fresh.
 *
 * Next.js 16 renamed the `middleware` convention to `proxy`; the behaviour is
 * unchanged. Two separate gates run here:
 *
 * - /admin      - the internal team area.
 * - marketplace - the publisher inventory, which is a benefit of holding an
 *                 account. `/marketplace` itself stays public because it
 *                 serves a signed-out gateway page; the listings underneath it
 *                 do not.
 *
 * This is the first of two checks in both cases. Pages and server actions
 * re-check with `requireAdminSession()` / `requireCustomerSession()`, because
 * actions have their own endpoints and are reachable without rendering a page.
 *
 * When Supabase is connected the proxy also refreshes the auth token. Server
 * components cannot write cookies, so without this a session would expire
 * mid-visit and the customer would be signed out for no apparent reason.
 */

/** Paths under /marketplace that render without an account. */
const PUBLIC_MARKETPLACE_PATHS = new Set(['/marketplace']);

async function gateAdmin(request: NextRequest, pathname: string) {
  // The sign-in page itself has to stay reachable.
  if (pathname === '/admin/login') return NextResponse.next();

  const session = await verifyAdminSessionToken(
    request.cookies.get(ADMIN_SESSION_COOKIE)?.value,
  );
  if (session) return NextResponse.next();

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = '/admin/login';
  loginUrl.search = '';
  // Remember where they were headed, so sign-in returns them there.
  if (pathname !== '/admin') loginUrl.searchParams.set('next', pathname);
  return NextResponse.redirect(loginUrl);
}

function signedOutRedirect(request: NextRequest, pathname: string) {
  // Marketplace routes land on the gateway, which explains the product and
  // sells the signup. The dashboard goes straight to the login form.
  const isMarketplace = pathname === '/websites' || pathname.startsWith('/websites/');
  const target = request.nextUrl.clone();
  target.pathname = isMarketplace ? '/marketplace' : '/login';
  target.search = '';
  target.searchParams.set('next', pathname);
  return NextResponse.redirect(target);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAdminPath = pathname === '/admin' || pathname.startsWith('/admin/');

  if (isAdminPath) return gateAdmin(request, pathname);

  if (!isSupabaseEnabled()) {
    if (PUBLIC_MARKETPLACE_PATHS.has(pathname)) return NextResponse.next();

    const session = await verifyCustomerSessionToken(
      request.cookies.get(CUSTOMER_SESSION_COOKIE)?.value,
    );
    return session ? NextResponse.next() : signedOutRedirect(request, pathname);
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

  if (PUBLIC_MARKETPLACE_PATHS.has(pathname)) return response;
  if (user) return response;

  return signedOutRedirect(request, pathname);
}

export const config = {
  matcher: ['/admin/:path*', '/marketplace/:path*', '/websites/:path*', '/dashboard/:path*'],
};
