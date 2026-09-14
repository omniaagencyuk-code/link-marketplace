import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from '@/lib/auth/admin-session';
import {
  CUSTOMER_SESSION_COOKIE,
  verifyCustomerSessionToken,
} from '@/lib/auth/customer-session';

/**
 * Gates private areas before any page renders.
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

async function gateCustomer(request: NextRequest, pathname: string) {
  const session = await verifyCustomerSessionToken(
    request.cookies.get(CUSTOMER_SESSION_COOKIE)?.value,
  );
  if (session) return NextResponse.next();

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

  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    return gateAdmin(request, pathname);
  }

  if (PUBLIC_MARKETPLACE_PATHS.has(pathname)) return NextResponse.next();

  return gateCustomer(request, pathname);
}

export const config = {
  matcher: ['/admin/:path*', '/marketplace/:path*', '/websites/:path*', '/dashboard/:path*'],
};
