import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/customer-access';

/**
 * Who the caller is, according to their own cookie.
 *
 * The root layout used to answer this, by resolving the session before
 * rendering anything. That made every page in the application personalised,
 * and a personalised page cannot be cached - which is why 96 of 99 routes
 * were rendered from scratch on every request, including the homepage, the
 * pricing page and the terms.
 *
 * Moving it here is what lets the public pages be prerendered. The chrome
 * renders immediately for everybody; this fills in the signed-in part a
 * moment later.
 *
 * ## It must never be cached, by anything
 *
 * This is the one response on the site whose body depends entirely on who
 * asked. Cached by a CDN for even a second, it would hand one customer's
 * name and email to the next visitor. Hence all three of:
 *
 *   * `dynamic = 'force-dynamic'`, so Next never prerenders or reuses it;
 *   * `no-store` with `private`, so no shared cache may keep it;
 *   * `Vary: Cookie`, so a cache that ignores the above still cannot serve
 *     one person's answer to another.
 *
 * Belt, braces and a third thing, because the failure is silent and the
 * damage is other people's personal data.
 */
export const dynamic = 'force-dynamic';

/**
 * What the browser is told.
 *
 * Named explicitly rather than spread from the profile. The rule this
 * follows is the one written for the marketplace API: build the response
 * from an allowlist, rather than returning the record and trying to
 * remember what to strip. A column added to `profiles` next year does not
 * reach the browser by default.
 */
export async function GET() {
  const user = await getCurrentUser();

  const body = user
    ? {
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          company: user.company ?? null,
          role: user.role,
          avatarInitials: user.avatarInitials,
          plan: user.plan,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      }
    : { user: null };

  return NextResponse.json(body, {
    headers: {
      'Cache-Control': 'private, no-store, no-cache, must-revalidate, max-age=0',
      Vary: 'Cookie',
    },
  });
}
