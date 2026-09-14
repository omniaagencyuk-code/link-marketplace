import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from '@/lib/auth/admin-session';

/**
 * Gates the admin area before any admin page renders.
 *
 * Next.js 16 renamed the `middleware` convention to `proxy`; the behaviour is
 * unchanged. This is the first of two checks - admin server actions call
 * `requireAdminSession()` as well, because actions are reachable without
 * rendering a page.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

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

export const config = {
  matcher: '/admin/:path*',
};
